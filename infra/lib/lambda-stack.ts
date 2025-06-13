import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as cdk from 'aws-cdk-lib';

export class LambdaStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        // 1. Tabla DynamoDB
        const challengesTable = new dynamodb.Table(this, 'ChallengesTable', {
            tableName: 'Challenges',
            partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        });

        // 2. Referencia al secreto existente usando el ARN completo
        const apiKeySecret = secretsmanager.Secret.fromSecretAttributes(this, 'ImportedOpenRouterSecret', {
            secretCompleteArn: 'arn:aws:secretsmanager:eu-south-2:536697257321:secret:OpenRouterApiKey-2tcs4q'
        });

        // 3. Lambda Function
        const challengeLambda = new NodejsFunction(this, 'ChallengeLambda', {
            entry: path.join(__dirname, '../lambda/index.js'),
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_20_X,
            environment: {
                TABLE_NAME: challengesTable.tableName,
                OPENROUTER_SECRET_ARN: apiKeySecret.secretArn, // Pasamos el ARN
                HTTP_REFERER: 'https://tu-sitio-web.com',
                APP_TITLE: 'Challenge Generator'
            },
            bundling: {
                externalModules: [
                    '@aws-sdk/client-dynamodb',
                    '@aws-sdk/lib-dynamodb',
                    '@aws-sdk/client-secrets-manager'
                ],
            },
            timeout: cdk.Duration.minutes(5),
        });

        // 4. Permisos
        challengesTable.grantReadWriteData(challengeLambda);
        apiKeySecret.grantRead(challengeLambda);

        // 5. API Gateway
        const api = new apigateway.RestApi(this, 'ChallengeApi', {
            restApiName: 'Challenge Generator API',
            defaultCorsPreflightOptions: {
                allowOrigins: apigateway.Cors.ALL_ORIGINS,
                allowMethods: apigateway.Cors.ALL_METHODS,
            },
        });

        const challenges = api.root.addResource('challenges');
        challenges.addMethod('POST', new apigateway.LambdaIntegration(challengeLambda));
    }
}