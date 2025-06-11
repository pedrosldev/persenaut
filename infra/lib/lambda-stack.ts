// lambda-stack.ts
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

interface LambdaStackProps extends cdk.StackProps {
    vpc: ec2.IVpc;
    table: dynamodb.ITable;
    securityGroup: ec2.ISecurityGroup;
    instanceId: string;
}

export class LambdaStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: LambdaStackProps) {
        super(scope, id, props);

        const lambdaFn = new lambda.Function(this, 'InfraLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset('lambda'),
            vpc: props.vpc,
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
            securityGroups: [props.securityGroup],
            environment: {
                EC2_INSTANCE_ID: props.instanceId,
                DDB_TABLE_NAME: props.table.tableName,
            },
            timeout: cdk.Duration.seconds(30),
        });

        const api = new apigw.LambdaRestApi(this, 'InfraApi', {
            handler: lambdaFn,
            proxy: false,
        });

        const challenges = api.root.addResource('challenges');
        challenges.addMethod('POST');
    }
}
