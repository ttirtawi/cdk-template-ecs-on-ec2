import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as alb from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as iam from 'aws-cdk-lib/aws-iam';

export class CdkTemplateEcsOnEc2StackMultiArch extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here

    // Create new VPC
    const vpc = new ec2.Vpc(this, 'vpc', {
      ipAddresses: ec2.IpAddresses.cidr('172.33.0.0/16'), //****MODIFY AS REQUIRED****//
      maxAzs: 2, //****MODIFY AS REQUIRED****//
      subnetConfiguration: [
        {
          cidrMask: 24, //****MODIFY AS REQUIRED****//
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 22, //****MODIFY AS REQUIRED****//
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
      instanceType: new ec2.InstanceType('m6g.xlarge'),  //****MODIFY AS REQUIRED****//
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(
        ecs.AmiHardwareType.ARM
        //****MODIFY AS REQUIRED (use STANDARD for Intel instance and ARM for Graviton instance)****//
      ),
      minCapacity: 1,
      maxCapacity: 5,
      desiredCapacity: 2,
      role,
    });

    // Create EC2 Capacity Provider
    const capacityProvider = new ecs.AsgCapacityProvider(this, 'asgCapacityProvider',{
      autoScalingGroup,
      enableManagedTerminationProtection: false,
      enableManagedScaling: true
    });

    // Create EC2 Auto Scaling Group
    const autoScalingGroupIntel = new autoscaling.AutoScalingGroup(this, 'asgIntel', {
      vpc,
      instanceType: new ec2.InstanceType('m5.xlarge'),  //****MODIFY AS REQUIRED****//
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(
        ecs.AmiHardwareType.STANDARD
        //****MODIFY AS REQUIRED (use STANDARD for Intel instance and ARM for Graviton instance)****//
      ),
      minCapacity: 1,
      maxCapacity: 5,
      desiredCapacity: 2,
      role,
    });

    // Create EC2 Capacity Provider
    const capacityProviderIntel = new ecs.AsgCapacityProvider(this, 'asgCapacityProviderIntel',{
      autoScalingGroup: autoScalingGroupIntel,
      enableManagedTerminationProtection: false,
      enableManagedScaling: true
    });

    // Attach Capacity Provider to ECS Cluster
    cluster.addAsgCapacityProvider(capacityProvider);
    cluster.addAsgCapacityProvider(capacityProviderIntel);

    // Prepare Port Mapping
    var demoPortMapping: ecs.PortMapping[] = [];
    demoPortMapping.push({
      containerPort: 8080,  //****MODIFY AS REQUIRED****//
      protocol: ecs.Protocol.TCP
    });

    // Create Task Execution Role
    const executionRole = new iam.Role(this, 'executionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryPowerUser')
      ],
    });

    // Create Task Definition
    const taskDefinition = new ecs.Ec2TaskDefinition(this, 'taskDefinition', {
      networkMode: ecs.NetworkMode.AWS_VPC,
      executionRole
    });

    // Add Container to the Task Definition
    const container = taskDefinition.addContainer('web', {
      image: ecs.ContainerImage.fromRegistry('452922823873.dkr.ecr.ap-southeast-1.amazonaws.com/cdkpipelinebuildmultiarchstack-ecrrepo4ed174df-7m8k8wlegjdt'), 
       //****MODIFY AS REQUIRED****//
      portMappings: demoPortMapping,
      memoryReservationMiB: 256,  //****MODIFY AS REQUIRED****//
      logging: new ecs.AwsLogDriver({
        streamPrefix: 'ECSLogGroup',  //****MODIFY AS REQUIRED****//
        mode: ecs.AwsLogDriverMode.NON_BLOCKING
      }),
      environment: {
        "TITLE": "Docker on ECS with EC2 (multi-arch)"
      }
    });

    // Create ECS Service
    const ecsService = new ecs.Ec2Service(this, 'service', {
      cluster: cluster,
      taskDefinition: taskDefinition,
      assignPublicIp: false,
      desiredCount: 5,  //****MODIFY AS REQUIRED****//
      capacityProviderStrategies: [
        {
          capacityProvider: capacityProvider.capacityProviderName,
          weight: 1
        },
        {
          capacityProvider: capacityProviderIntel.capacityProviderName,
          weight: 1
        }
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
      maxCapacity: 20  //****MODIFY AS REQUIRED****//
    })

    serviceAutoScaling.scaleOnRequestCount('scaleOnRequestCount', {
      requestsPerTarget: 100,  //****MODIFY AS REQUIRED****//
      targetGroup
    })

    new cdk.CfnOutput(this, 'DNSLoadBalancer', {value: lb.loadBalancerDnsName});
  }
}
