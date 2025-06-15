import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';

export class InfraStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly bucket: s3.Bucket;
  public readonly table: dynamodb.Table;
  public readonly challengeLambda: lambda.Function;
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    cdk.Tags.of(this).add('Name', 'persenaut');
    cdk.Tags.of(this).add('Stack', 'persenaut');

    this.vpc = new ec2.Vpc(this, 'InfraVPC', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          name: 'PublicSubnet',
          subnetType: ec2.SubnetType.PUBLIC
        },
        {
          name: 'PrivateSubnet',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
        },
      ],
    });

    this.bucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: 'persenaut-frontend-bucket-' + cdk.Stack.of(this).account,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'error.html',
      publicReadAccess: true,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false
      }),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    this.table = new dynamodb.Table(this, 'ChallengesTable', {
      tableName: 'Challenges',
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    
    const apiKeySecret = secretsmanager.Secret.fromSecretAttributes(this, 'ImportedOpenRouterSecret', {
      secretCompleteArn: 'arn:aws:secretsmanager:eu-south-2:536697257321:secret:OpenRouterApiKey-2tcs4q'
    });

    this.challengeLambda = new NodejsFunction(this, 'ChallengeLambda', {
      entry: path.join(__dirname, '../lambda/index.js'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(60),
      memorySize: 1024,
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        TABLE_NAME: this.table.tableName,
        OPENROUTER_SECRET_ARN: apiKeySecret.secretArn,
        HTTP_REFERER: 'https://tu-sitio-web.com',
        APP_TITLE: 'Challenge Generator'
      },
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [new ec2.SecurityGroup(this, 'LambdaSG', {
        vpc: this.vpc,
        description: 'Security Group for Lambda',
        allowAllOutbound: true
      })],
      bundling: {
        externalModules: [
          '@aws-sdk/client-dynamodb',
          '@aws-sdk/lib-dynamodb',
          '@aws-sdk/client-secrets-manager'
        ],
      }
    });
    this.challengeLambda.addEnvironment('LOG_LEVEL', 'DEBUG');

    this.table.grantReadWriteData(this.challengeLambda);
    apiKeySecret.grantRead(this.challengeLambda);

    this.api = new apigateway.RestApi(this, 'ChallengeApi', {
      restApiName: 'Challenge Generator API',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    const challenges = this.api.root.addResource('challenges');
    challenges.addMethod('POST', new apigateway.LambdaIntegration(this.challengeLambda));

    this.vpc.addInterfaceEndpoint('SecretsManagerEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER
    });

    this.vpc.addGatewayEndpoint('DynamoDbEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB
    });

    // Outputs
    new cdk.CfnOutput(this, 'BucketWebsiteURL', {
      value: this.bucket.bucketWebsiteUrl,
      description: 'Bucket URL for frontend',
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.api.url,
      description: 'Base URL for API Gateway',
    });
  }
}