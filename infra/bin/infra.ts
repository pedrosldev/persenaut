// lib/lambda-stack.ts
import * as cdk from 'aws-cdk-lib';

import { InfraStack } from '../lib/infra-stack';
import { LambdaStack } from '../lib/lambda-stack';





const app = new cdk.App();

const lambdaResourcesStack = new cdk.Stack(app, 'LambdaResourcesStack', {
  env: { account: '536697257321', region: 'eu-south-2' },
});

new InfraStack(app, 'InfraStack', {
  env: { account: '536697257321', region: 'eu-south-2' },
});

new LambdaStack(app, 'LambdaStack', {

  env: { account: '536697257321', region: 'eu-south-2' },
});
