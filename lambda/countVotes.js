const { DynamoDB, Lambda } = require('aws-sdk');

exports.handler = async function(event) {
    const dynamo = new DynamoDB();

    let dynamoDBItems = [];
    event.Records.forEach(record => {
        // Kinesis data is base64 encoded so decode here
        const vote = JSON.parse(Buffer.from(record.kinesis.data, 'base64').toString('ascii'));
        dynamoDBItems.push({
            PutRequest: {
                Item: {
                    "userid": {
                        S: vote.cognitoid,
                    },
                    "voteid": {
                        S: vote.voteid
                    },
                    "vote_option": {
                        S: vote.option
                    }
                }
            }
        })
    });

    const writeParams = {
        RequestItems: {}
    };
    writeParams.RequestItems[process.env.VOTE_TABLE_NAME] = dynamoDBItems;
    console.log(JSON.stringify(writeParams));

    await dynamo.batchWriteItem(writeParams, function(err, data) {
        if (err) console.log(err, err.stack); // an error occurred
        else     console.log(data);           // successful response

    }).promise();
    return {statusCode: 200};
};