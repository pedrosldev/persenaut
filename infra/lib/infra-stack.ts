import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

export class InfraStack extends cdk.Stack {
  public readonly ollamaInstance: ec2.Instance;
  public readonly vpc: ec2.Vpc;
  public readonly bucket: s3.Bucket;
  public readonly table: dynamodb.Table;
  public readonly lambdaFn: lambda.Function;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    
    cdk.Tags.of(this).add('Name', 'persenaut');
    cdk.Tags.of(this).add('Stack', 'persenaut');

    
    this.vpc = new ec2.Vpc(this, 'InfraVPC', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: 'PublicSubnet', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'PrivateSubnet', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
      ],
    });

    
    const ollamaSG = new ec2.SecurityGroup(this, 'OllamaSG', {
      vpc: this.vpc,
      description: 'Allow SSH and HTTP access to Ollama EC2',
      allowAllOutbound: true,
    });
    ollamaSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'Allow SSH');
    ollamaSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP');
    ollamaSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'Allow HTTPS');
    ollamaSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(11434), 'Allow Ollama port'); 

    
    this.ollamaInstance = new ec2.Instance(this, 'OllamaInstance', {
      vpc: this.vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.XLARGE),
      machineImage: ec2.MachineImage.latestAmazonLinux2(),
      securityGroup: ollamaSG,
      keyPair: ec2.KeyPair.fromKeyPairName(this, 'OllamaInstanceKeyPair', 'vockey'),
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      blockDevices: [{
        deviceName: '/dev/xvda',
        volume: ec2.BlockDeviceVolume.ebs(30),
      }],
    });
    this.ollamaInstance.userData.addCommands(
      'sudo yum update -y',
      'sudo yum install -y docker',
      'sudo service docker start',
      'sudo usermod -aG docker ec2-user',
      'docker run -d --name ollama -p 11434:11434 ollama/ollama:latest'
    );

    
    this.bucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: 'persenaut-frontend-bucket-' + cdk.Stack.of(this).account,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'error.html',
      publicReadAccess: true,
      blockPublicAccess: new s3.BlockPublicAccess({ blockPublicAcls: false, blockPublicPolicy: false, ignorePublicAcls: false, restrictPublicBuckets: false }),  
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    

    
    this.table = new dynamodb.Table(this, 'ChallengesTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    
    this.lambdaFn = new lambda.Function(this, 'InfraLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda'), 
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [ollamaSG],
      environment: {
        EC2_INSTANCE_ID: this.ollamaInstance.instanceId,
        DDB_TABLE_NAME: this.table.tableName,
      },
      timeout: cdk.Duration.seconds(30),
    });

    
    const api = new apigw.LambdaRestApi(this, 'InfraApi', {
      handler: this.lambdaFn,
      proxy: false,
      restApiName: 'InfraApi',
    });
    const challenges = api.root.addResource('challenges');
    challenges.addMethod('POST');

    
    new cdk.CfnOutput(this, 'BucketWebsiteURL', {
      value: this.bucket.bucketWebsiteUrl,
      description: 'Bucket URL for frontend',
    });
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'Base URL for API Gateway',
    });
    new cdk.CfnOutput(this, 'OllamaInstanceId', {
      value: this.ollamaInstance.instanceId,
      description: 'ID of the EC2 Ollama instance',
    });
  }
}
