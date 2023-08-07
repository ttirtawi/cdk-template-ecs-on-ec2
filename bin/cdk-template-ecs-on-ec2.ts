#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CdkTemplateEcsOnEc2Stack } from '../lib/cdk-template-ecs-on-ec2-stack';
import {CdkTemplateEcsOnEc2StackMultiArch} from '../lib/cdk-template-ecs-on-ec2-multiarch';
import {CdkTemplateEcsOnEc2StackPrivateALB} from '../lib/cdk-template-ecs-on-ec2-private-alb';
import { CdkTemplateEcsOnEc2StackCorrectIAM } from '../lib/cdk-template-ecs-on-ec2-stack-correct-iam';
import { CdkTemplateEcsOnEc2StackWrongIAM } from '../lib/cdk-template-ecs-on-ec2-stack-wrong-iam';

const app = new cdk.App();
new CdkTemplateEcsOnEc2Stack(app, 'CdkTemplateEcsOnEc2Stack', {
});

new CdkTemplateEcsOnEc2StackMultiArch(app, 'CdkTemplateEcsOnEc2StackMultiArch', {
});

new CdkTemplateEcsOnEc2Stack(app, 'demo-ecs-graviton-jakarta', {
  env: { account: '452922823873', region: 'ap-southeast-3' },

});
new CdkTemplateEcsOnEc2StackPrivateALB(app, 'demo-ecs-private-alb', {
  env: { account: '452922823873', region: 'ap-southeast-3' },

});

new CdkTemplateEcsOnEc2StackCorrectIAM(app, 'demo1-ecs-correct-iam', {
  env: { account: '452922823873', region: 'ap-southeast-3' },

});

new CdkTemplateEcsOnEc2StackWrongIAM(app, 'demo2-ecs-wrong-iam', {
  env: { account: '452922823873', region: 'ap-southeast-3' },

});
