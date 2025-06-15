import * as cdk from 'aws-cdk-lib';
import { InfraStack } from '../lib/infra-stack';

const app = new cdk.App();

new InfraStack(app, 'InfraStack', {
  env: {
    account: '536697257321',
    region: 'eu-south-2'
  },
});