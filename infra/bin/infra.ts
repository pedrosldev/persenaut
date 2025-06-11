// lib/lambda-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { InfraStack } from '../lib/infra-stack';
import { LambdaStack } from '../lib/lambda-stack';


const vpcId = process.env.VPC_ID;
const tableName = process.env.DDB_TABLE_NAME;
const securityGroupId = process.env.SECURITY_GROUP_ID;
const ec2InstanceId = process.env.EC2_INSTANCE_ID;

if (!vpcId || !tableName || !securityGroupId || !ec2InstanceId) {
  throw new Error('Faltan variables de entorno: VPC_ID, DDB_TABLE_NAME, SECURITY_GROUP_ID, EC2_INSTANCE_ID');
}
const app = new cdk.App();

const lambdaResourcesStack = new cdk.Stack(app, 'LambdaResourcesStack', {
  env: { account: '536697257321', region: 'eu-south-2' },
});
const vpc = ec2.Vpc.fromLookup(lambdaResourcesStack, 'VPC', { vpcId });
const table = dynamodb.Table.fromTableName(lambdaResourcesStack, 'Table', tableName);
const securityGroup = ec2.SecurityGroup.fromSecurityGroupId(lambdaResourcesStack, 'SecurityGroup', securityGroupId);

new InfraStack(app, 'InfraStack', {
  env: { account: '536697257321', region: 'eu-south-2' },
});

new LambdaStack(app, 'LambdaStack', {
  vpc,
  table,
  securityGroup,
  instanceId: ec2InstanceId,
  env: { account: '536697257321', region: 'eu-south-2' },
});
