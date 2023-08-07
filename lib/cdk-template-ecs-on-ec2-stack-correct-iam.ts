import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as alb from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecrasset from 'aws-cdk-lib/aws-ecr-assets';
import * as path from 'path';

export class CdkTemplateEcsOnEc2StackCorrectIAM extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here
    const dockerImageWeb = new ecrasset.DockerImageAsset(this, 'dockerImageWeb', {
      directory: path.join(__dirname, '../app'),
      platform: ecrasset.Platform.LINUX_ARM64
    });

    // Create new VPC
    const vpc = new ec2.Vpc(this, 'vpc', {
      ipAddresses: ec2.IpAddresses.cidr('172.33.0.0/16'), 
      maxAzs: 2, 
      natGateways: 1,
      subnetConfiguration: [
        {
          cidrMask: 24, 
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 22, 
          name: 'private-nat',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        }
      ]
    });

    // Create ECS Cluster
    const cluster = new ecs.Cluster(this, 'myECSCluster', {
      vpc: vpc
    });

    // Create IAM Role for EC2 instances
    const role = new iam.Role(this, 'role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    });

    // Create EC2 Auto Scaling Group
    const autoScalingGroup = new autoscaling.AutoScalingGroup(this, 'asg', {
      vpc,
      instanceType: new ec2.InstanceType('m6g.large'),  
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(
        ecs.AmiHardwareType.ARM
      ),
      minCapacity: 1,
      maxCapacity: 5,
      desiredCapacity: 1,
      role,
    });

    // Create EC2 Capacity Provider
    const capacityProvider = new ecs.AsgCapacityProvider(this, 'asgCapacityProvider',{
      autoScalingGroup,
      enableManagedTerminationProtection: false,
      enableManagedScaling: true
    });

    // Attach Capacity Provider to ECS Cluster
    cluster.addAsgCapacityProvider(capacityProvider);

    // Prepare Port Mapping
    var demoPortMapping: ecs.PortMapping[] = [];
    demoPortMapping.push({
      containerPort: 8080,  
      protocol: ecs.Protocol.TCP
    });

    // Create Task Execution Role
    const executionRole = new iam.Role(this, 'executionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'),
      ],
    });

    // Create Task Definition
    const taskDefinition = new ecs.Ec2TaskDefinition(this, 'taskDefinition', {
      networkMode: ecs.NetworkMode.AWS_VPC,
      executionRole
    });

    // Add Container to the Task Definition
    const container = taskDefinition.addContainer('web', {
      image: ecs.ContainerImage.fromDockerImageAsset(dockerImageWeb),
      portMappings: demoPortMapping,
      memoryReservationMiB: 256,  
      logging: new ecs.AwsLogDriver({
        streamPrefix: 'ECSLogGroup',  
        mode: ecs.AwsLogDriverMode.NON_BLOCKING
      }),
      environment: {
        "TITLE": "Docker on ECS with Graviton EC2"
      }
    });

    // Create ECS Service
    const ecsService = new ecs.Ec2Service(this, 'service', {
      cluster: cluster,
      taskDefinition: taskDefinition,
      assignPublicIp: false,
      desiredCount: 5,  
      capacityProviderStrategies: [
        {
          capacityProvider: capacityProvider.capacityProviderName,
          weight: 1
        },
      ]
    })

    // Create Application Load Balancer
    const lb = new alb.ApplicationLoadBalancer(this, 'loadbalancer', {
      vpc,
      internetFacing: true,
    });

    // Create Application Load Balancer HTTP Listener
    const listener = lb.addListener('httpListener', {
      port: 80 
    });

    // Create Target Group and Attach ECS Service
    const targetGroup = new alb.ApplicationTargetGroup(this, 'targetGroup', {
      vpc,
      port: 80,
      protocol: alb.ApplicationProtocol.HTTP,
      targetType: alb.TargetType.IP
    })
    ecsService.attachToApplicationTargetGroup(targetGroup)

    // Configure listener to forward traffic to the Target Group
    listener.addTargetGroups('addtargetgroup', {
      targetGroups: [targetGroup]
    })

    const serviceAutoScaling = ecsService.autoScaleTaskCount({
      maxCapacity: 20  
    })

    serviceAutoScaling.scaleOnRequestCount('scaleOnRequestCount', {
      requestsPerTarget: 100,  
      targetGroup
    })

    new cdk.CfnOutput(this, 'DNSLoadBalancer', {value: lb.loadBalancerDnsName});
  }
}
