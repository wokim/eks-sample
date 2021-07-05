import * as cdk from '@aws-cdk/core';
import * as eks from '@aws-cdk/aws-eks';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';

export class EksSampleStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'eks-vpc', {
      cidr: '10.0.0.0/16',
      maxAzs: 3,
      // In order to save on NAT cost. Be aware you may be charged for cross-AZ data traffic instead.
      natGateways: 2,
      subnetConfiguration: [
        { cidrMask: 24, name: 'public', subnetType: ec2.SubnetType.PUBLIC },
        { cidrMask: 24, name: 'eks-worker-node', subnetType: ec2.SubnetType.PRIVATE },
      ],
      // In order for the private hosted zone to properly route traffic to your API server,
      // your VPC must have enableDnsHostnames and enableDnsSupport set to true, and the DHCP options
      // set for your VPC must include AmazonProvidedDNS in its domain name servers list.
      // https://docs.aws.amazon.com/eks/latest/userguide/cluster-endpoint.html
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });

    // Using Amazon EC2 Instance Connect for SSH access to your EC2 Instances
    // https://aws.amazon.com/ko/blogs/compute/new-using-amazon-ec2-instance-connect-for-ssh-access-to-your-ec2-instances/
    const sendSSHPublicKeyPolicyStatement = new iam.PolicyStatement();
    sendSSHPublicKeyPolicyStatement.addResources(`arn:aws:ec2:${process.env.CDK_DEFAULT_REGION}:${process.env.CDK_DEFAULT_ACCOUNT}:instance/*`);
    sendSSHPublicKeyPolicyStatement.addActions(
      'ec2-instance-connect:SendSSHPublicKey',
      'ec2:DescribeInstances'
    );
    sendSSHPublicKeyPolicyStatement.addCondition('StringEquals', {
      'ec2:osuser': 'ec2-user'
    });
    sendSSHPublicKeyPolicyStatement.effect = iam.Effect.ALLOW;

    const sendSSHPublicKeyPolicy = new iam.Policy(this, 'send-ssh-public-key-policy', {
      policyName: 'SendSSHPublicKeyPolicy',
      statements: [ sendSSHPublicKeyPolicyStatement ]
    });

    const bastion = new ec2.BastionHostLinux(this, 'eks-bastion', {
      instanceName: 'eks-bastion',
      vpc,
      subnetSelection: { subnetType: ec2.SubnetType.PUBLIC },
    });
    bastion.allowSshAccessFrom(ec2.Peer.anyIpv4());
    sendSSHPublicKeyPolicy.attachToRole(bastion.role);

    const cluster = new eks.Cluster(this, 'eks-sample', {
      clusterName: 'eks-sample',
      version: eks.KubernetesVersion.V1_20,
      vpc,
      vpcSubnets: [{ subnetType: ec2.SubnetType.PUBLIC }, { subnetType: ec2.SubnetType.PRIVATE }],
      endpointAccess: eks.EndpointAccess.PUBLIC_AND_PRIVATE,
      defaultCapacity: 0,
      // Additional cluster security groups control communications from the Kubernetes control plane to compute resources in your account.
      // It does not apply to worker nodes, but only to the control plane, so leave it as an empty security group.
      securityGroup: new ec2.SecurityGroup(this, 'ControlPlaneAdditionalSecurityGroup', {
        vpc,
        description: 'EKS Control Plane Additional Security Group',
      }),
    });

    // A cluster security group is designed to allow all traffic from the control plane and managed node groups to flow freely between each other.
    // Allow SSH access to worker nodes.
    cluster.clusterSecurityGroup.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.icmpPing());
    cluster.clusterSecurityGroup.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(22));

    // The following policy provides the minimum privileges necessary for Cluster Autoscaler to run.
    // https://github.com/kubernetes/autoscaler/tree/master/cluster-autoscaler/cloudprovider/aws#iam-policy
    // define the cluster autoscaler policy statements
    // https://docs.aws.amazon.com/en_pv/eks/latest/userguide/cluster-autoscaler.html#ca-create-ngs
    const clusterAutoscalerPolicyStatement = new iam.PolicyStatement();
    clusterAutoscalerPolicyStatement.addResources('*');
    clusterAutoscalerPolicyStatement.addActions(
      'autoscaling:DescribeAutoScalingGroups',
      'autoscaling:DescribeAutoScalingInstances',
      'autoscaling:DescribeLaunchConfigurations',
      'autoscaling:DescribeTags',
      'autoscaling:SetDesiredCapacity',
      'autoscaling:TerminateInstanceInAutoScalingGroup',
      'ec2:DescribeLaunchTemplateVersions'
    );
    clusterAutoscalerPolicyStatement.effect = iam.Effect.ALLOW;

    // Create the policy based on the statements
    const clusterAutoscalerPolicy = new iam.Policy(this, 'cluster-autoscaler-policy', {
      policyName: 'ClusterAutoscalerPolicy',
      statements: [ clusterAutoscalerPolicyStatement ]
    });

    clusterAutoscalerPolicy.attachToRole(cluster.addNodegroupCapacity('eks-on-demand-capacity', {
      nodegroupName: 'eks-on-demand-capacity',
      instanceTypes: [
        new ec2.InstanceType('m5.large'), // 1st priority
        new ec2.InstanceType('m4.large')  // 2nd priority
      ],
      minSize: 2,
      desiredSize: 2,
      maxSize: 10,
      capacityType: eks.CapacityType.ON_DEMAND,
      diskSize: 20 // 20 GiB
    }).role);

    clusterAutoscalerPolicy.attachToRole(cluster.addNodegroupCapacity('eks-spot-capacity', {
      nodegroupName: 'eks-spot-capacity',
      instanceTypes: [
        new ec2.InstanceType('m4.large'),
        new ec2.InstanceType('m5.large'),
        new ec2.InstanceType('m5a.large'),
      ],
      minSize: 1,
      desiredSize: 3,
      maxSize: 10,
      capacityType: eks.CapacityType.SPOT,
      diskSize: 20 // 20 GiB
    }).role);
  }
}
