import * as cdk from '@aws-cdk/core';
import {Duration} from '@aws-cdk/core';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as apigw from '@aws-cdk/aws-apigateway';
import * as iam from '@aws-cdk/aws-iam';
import * as kinesis from '@aws-cdk/aws-kinesis';
import * as lambda from '@aws-cdk/aws-lambda';
import {StartingPosition} from '@aws-cdk/aws-lambda';
import {EnhancedFanOutEvent} from "./EnhancedFanOutEvent";


export class HighVolumeVotingSystemStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const table = new dynamodb.Table(this, 'VotesTableNew', {
      sortKey: {name: 'userid', type: dynamodb.AttributeType.STRING},
      partitionKey: {name: 'voteid', type: dynamodb.AttributeType.STRING},
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST
    });

    const intermediateResultTable = new dynamodb.Table(this, 'IntermediateVotesTable', {
      sortKey: {name: 'option', type: dynamodb.AttributeType.STRING},
      partitionKey: {name: 'voteid', type: dynamodb.AttributeType.STRING},
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST
    });

    const votesStream = new kinesis.Stream(this, 'VotesStream', {
      retentionPeriod: Duration.days(1),
      shardCount: 1
    });

    const voteCounter = new lambda.Function(this, 'votesCounterFunction', {
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset('lambda'),
      handler: 'countVotes.handler',
      environment: {
        VOTE_TABLE_NAME: table.tableName
      }
    });

    const intermediateResults = new lambda.Function(this, 'intermediateResultsFunction', {
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset('lambda'),
      handler: 'intermediateVotes.handler',
      memorySize: 512,
      environment: {
        VOTE_TABLE_NAME: intermediateResultTable.tableName
      }
    });

    new EnhancedFanOutEvent(this, 'votesCounter', {
      kinesisStream: votesStream,
      lambdaFunction: voteCounter,
      startingPosition: StartingPosition.LATEST,
      batchSize: 10,
      parallelizationFactor: 1
    });

    new EnhancedFanOutEvent(this, 'intermediateResults', {
      kinesisStream: votesStream,
      lambdaFunction: intermediateResults,
      startingPosition: StartingPosition.LATEST,
      batchSize: 10000,
      parallelizationFactor: 1,
      maxBatchingWindow: Duration.seconds(5)
    });

    const credentialsRole = new iam.Role(this, "Role", {
      assumedBy: new iam.ServicePrincipal("apigateway.amazonaws.com"),
    });

    const api = new apigw.RestApi(this, 'RestVotingEndpoint', {
      deployOptions: {
        stageName: 'dev',
        tracingEnabled: true,
        throttlingRateLimit: 0,
        throttlingBurstLimit: 0
      }
    });

    const vote = api.root.addResource('vote');
    vote.addMethod(
        'POST',
      new apigw.AwsIntegration({
        service: 'kinesis',
        action: 'PutRecord',
        integrationHttpMethod: 'POST',
        options: {
          credentialsRole: credentialsRole,
          timeout: Duration.seconds(2),
          integrationResponses: [
            {
              statusCode: '200'
            },
          ],
          requestTemplates: {
            'application/json': `{
                "StreamName": "${votesStream.streamName}",
                "Data": "$util.base64Encode($input.json('$'))",
                "PartitionKey": "$input.path('$.cognitoid')"
            }`,
          },
        }
      }),
        {
          methodResponses: [{statusCode: '200'}]
        }

    );

    votesStream.grantWrite(credentialsRole);

    votesStream.grantRead(voteCounter);
    votesStream.grantRead(intermediateResults);

    table.grantWriteData(voteCounter);
    intermediateResultTable.grantWriteData(intermediateResults);
  }
}
