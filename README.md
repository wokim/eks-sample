# EKS Sample

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `cdk deploy`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template

## Send a SSH public key to an instance

As there are no SSH public keys deployed on this machine, you need to use EC2 Instance Connect with the command aws ec2-instance-connect send-ssh-public-key to provide your SSH public key.

The following send-ssh-public-key example sends the specified SSH public key to the specified instance. The key is used to authenticate the specified user

```sh
# Each Linux instance launches with a default Linux system user account. The default user name is determined by the AMI that was specified when you launched the instance. For Amazon Linux 2 or the Amazon Linux AMI, the user name is `ec2-user`.

aws ec2-instance-connect send-ssh-public-key \
    --instance-id <instance-id> \
    --instance-os-user <username> \
    --availability-zone <az> \
    --ssh-public-key file:///<pubkey path>

# For example,
aws ec2-instance-connect send-ssh-public-key \
    --instance-id i-0efeed666c186b196 \
    --instance-os-user ec2-user \
    --availability-zone ap-northeast-2a \
    --ssh-public-key file:///home/ec2-user/.ssh/id_rsa.pub
```

## SSH key-gen

```sh
ssh-keygen -t rsa
```

## To connect a bastion host

```sh
# Retrieve public DNS name to connect to bastion host
aws ec2 describe-instances --instance-ids <instance-id> --query 'Reservations[].Instances[].PublicDnsName'

# For example,
aws ec2 describe-instances --instance-ids i-0efeed666c186b196 --query 'Reservations[].Instances[].PublicDnsName'

# Connect SSH
# After authentication, the public key is made available to the instance through the instance metadata for 60 seconds. During this time, connect to the instance using the associated private key:
ssh ec2-user@<PublicDnsName>
ssh ec2-user@ec2-13-125-37-72.ap-northeast-2.compute.amazonaws.com
```

## Cluster Autoscaler

```sh
kubectl apply -f cluster-autoscaler-autodiscover.yaml
```

## Termination Handler

```sh
kubectl apply -f https://github.com/aws/aws-node-termination-handler/releases/download/v1.3.1/all-resources.yaml
```
