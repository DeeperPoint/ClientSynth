#!/usr/bin/env python3
"""
Script to configure S3 bucket for public read access.
This script will:
1. Disable 'Block Public Access' settings
2. Add a bucket policy for public read access
3. Enable public ACLs

WARNING: This makes ALL objects in the bucket publicly accessible via HTTP.
Only use this for assets/media that should be publicly accessible.
"""

import boto3
import json
import os
import sys
from botocore.exceptions import ClientError

def main():
    # Get configuration from environment variables
    bucket_name = os.getenv('AWS_S3_BUCKET')
    aws_access_key = os.getenv('AWS_ACCESS_KEY_ID')
    aws_secret_key = os.getenv('AWS_SECRET_ACCESS_KEY')
    aws_region = os.getenv('AWS_REGION', 'us-east-1')
    
    if not bucket_name:
        print("Error: AWS_S3_BUCKET environment variable is not set")
        sys.exit(1)
    
    if not aws_access_key or not aws_secret_key:
        print("Error: AWS credentials not set (AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY)")
        sys.exit(1)
    
    print(f"Configuring bucket: {bucket_name}")
    print(f"Region: {aws_region}")
    print("-" * 50)
    
    # Initialize S3 client
    s3_client = boto3.client(
        's3',
        aws_access_key_id=aws_access_key,
        aws_secret_access_key=aws_secret_key,
        region_name=aws_region
    )
    
    try:
        # Step 1: Remove Block Public Access settings
        print("Step 1: Disabling Block Public Access settings...")
        try:
            s3_client.put_public_access_block(
                Bucket=bucket_name,
                PublicAccessBlockConfiguration={
                    'BlockPublicAcls': False,
                    'IgnorePublicAcls': False,
                    'BlockPublicPolicy': False,
                    'RestrictPublicBuckets': False
                }
            )
            print("✓ Block Public Access settings disabled")
        except ClientError as e:
            print(f"✗ Failed to disable Block Public Access: {e}")
            print("  This might be okay if settings were already configured")
        
        # Step 2: Set bucket policy for public read access
        print("\nStep 2: Setting bucket policy for public read access...")
        bucket_policy = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Sid": "PublicReadGetObject",
                    "Effect": "Allow",
                    "Principal": "*",
                    "Action": "s3:GetObject",
                    "Resource": f"arn:aws:s3:::{bucket_name}/*"
                }
            ]
        }
        
        try:
            s3_client.put_bucket_policy(
                Bucket=bucket_name,
                Policy=json.dumps(bucket_policy)
            )
            print("✓ Bucket policy set for public read access")
        except ClientError as e:
            print(f"✗ Failed to set bucket policy: {e}")
            sys.exit(1)
        
        # Step 3: Enable ACLs (ownership controls)
        print("\nStep 3: Configuring bucket ownership controls...")
        try:
            s3_client.put_bucket_ownership_controls(
                Bucket=bucket_name,
                OwnershipControls={
                    'Rules': [
                        {
                            'ObjectOwnership': 'BucketOwnerPreferred'
                        }
                    ]
                }
            )
            print("✓ Bucket ownership controls configured")
        except ClientError as e:
            print(f"✗ Failed to set ownership controls: {e}")
            print("  This might be okay if settings were already configured")
        
        # Step 4: Verify the configuration
        print("\nStep 4: Verifying configuration...")
        try:
            response = s3_client.get_bucket_policy(Bucket=bucket_name)
            policy = json.loads(response['Policy'])
            print("✓ Bucket policy verified")
            print(f"  Policy: {json.dumps(policy, indent=2)}")
        except ClientError as e:
            print(f"✗ Could not verify bucket policy: {e}")
        
        print("\n" + "=" * 50)
        print("✓ SUCCESS: Bucket is now configured for public access!")
        print("=" * 50)
        print(f"\nYour assets will now be accessible at:")
        print(f"https://{bucket_name}.s3.amazonaws.com/<object-key>")
        print("\nNOTE: It may take a few minutes for changes to propagate.")
        
    except Exception as e:
        print(f"\n✗ ERROR: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()

