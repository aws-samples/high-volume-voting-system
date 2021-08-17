import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as kinesis from '@aws-cdk/aws-kinesis';
import * as iam from "@aws-cdk/aws-iam";
import {Effect} from "@aws-cdk/aws-iam";

export interface EnahncedFanOutEventProps {
    lambdaFunction: lambda.IFunction;
    kinesisStream: kinesis.IStream;
    batchSize?: number|undefined;
    parallelizationFactor?: number|undefined;
    startingPosition?: lambda.StartingPosition|undefined;
}

// Creates an EnhancedFanOut Reseiver and a Lambda Event Mapping for this
export class EnahncedFanOutEvent extends cdk.Construct {

    public readonly handler: lambda.Function;

    constructor(scope: cdk.Construct, id: string, props: EnahncedFanOutEventProps) {
        super(scope, id);

        const consumer = new kinesis.CfnStreamConsumer(this, id+'Consumer', {
            consumerName: id + 'Consumer',
            streamArn: props.kinesisStream.streamArn,
        });

        new lambda.EventSourceMapping(this, 'votesCounterEventSourceMapping', {
            eventSourceArn: consumer.attrConsumerArn,
            target: props.lambdaFunction,
            startingPosition: props.startingPosition,
            batchSize: props.batchSize,
            parallelizationFactor: props.parallelizationFactor
        });

        props.lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
            actions: ['kinesis:SubscribeToShard'],
            effect: Effect.ALLOW,
            resources: [
                consumer.attrConsumerArn
            ]
        }));

    }
}