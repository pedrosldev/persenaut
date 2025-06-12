import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cdk from 'aws-cdk-lib';

export interface LambdaStackProps extends cdk.StackProps {
    vpc: ec2.IVpc;
    table: dynamodb.ITable;
    securityGroup: ec2.ISecurityGroup;
    instanceId: string;
  }
export class LambdaStack extends Stack {
    constructor(scope: Construct, id: string, props?: LambdaStackProps) {
        super(scope, id, props);

        if (!props) {
            throw new Error('Props are required for LambdaStack');
        }

        const challengeLambda = new NodejsFunction(this, 'ChallengeLambda', {
            entry: path.join(__dirname, '../lambda/index.js'), // tu Lambda en JS
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_20_X,
            vpc: props.vpc,
            securityGroups: [props.securityGroup],
            bundling: {
                externalModules: ['aws-sdk'], // no empacarla, ya está en el entorno Lambda
            },
            environment: {
                INSTANCE_ID: 'i-080aa23d1ecd83299',
                TABLE_NAME: 'Challenges',
            },
        });

        const api = new apigateway.RestApi(this, 'ChallengeApi', {
            restApiName: 'Challenge Generator',
        });

        const challenges = api.root.addResource('challenges');
        challenges.addMethod('POST', new apigateway.LambdaIntegration(challengeLambda));
    }
}
