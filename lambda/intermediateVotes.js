const { DynamoDB, Lambda } = require('aws-sdk');


exports.handler = async function(event) {
    const dynamo = new DynamoDB();
    const votes = new Map();

    let dynamoDBItems = [];
    let key = '';
    let vote;
    console.log("Number of Reecords: [" + event.Records.length +']');
    event.Records.forEach(record => {
        // Kinesis data is base64 encoded so decode here
        const item = JSON.parse(Buffer.from(record.kinesis.data, 'base64').toString('ascii'));
        key = item.voteid + item.option;

        vote = votes.has(key) ? votes.get(key) : {voteid: item.voteid, option: item.option, count:0};

        vote.count = vote.count+1;
        votes.set(key, vote);
    });

    console.log(votes);
    votes.forEach(record => {
        dynamo.updateItem({
            TableName: process.env.VOTE_TABLE_NAME,
            Key: {
                voteid: { S: record.voteid },
                option: { S: record.option }
            },
            UpdateExpression: 'ADD votes :incr',
            ExpressionAttributeValues: { ':incr': { N: ''+record.count } }
        }).promise();

        dynamoDBItems.push({
            PutRequest: {
                Item: record
            }
        });
    });
    return {statusCode: 200};
};