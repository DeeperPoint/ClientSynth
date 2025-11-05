#!/usr/bin/env python3
"""
Script to create a new S3 bucket with public read access configured from the start.
This is easier than modifying an existing private bucket.
"""

import boto3
import json
import os
import sys
from botocore.exceptions import ClientError

def main():
    # Get configuration from environment variables
    aws_access_key = os.getenv('AWS_ACCESS_KEY_ID')
    aws_secret_key = os.getenv('AWS_SECRET_ACCESS_KEY')
    aws_region = os.getenv('AWS_REGION', 'us-east-2')
    
    # Generate a unique bucket name
    import time
    timestamp = int(time.time())
    new_bucket_name = f"synthetic-client-assets-{timestamp}"
    
    if not aws_access_key or not aws_secret_key:
        print("Error: AWS credentials not set (AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY)")
        sys.exit(1)
    
    print("=" * 60)
    print("Creating New Public S3 Bucket")
    print("=" * 60)
    print(f"Bucket name: {new_bucket_name}")
    print(f"Region: {aws_region}")
    print("-" * 60)
    
    # Initialize S3 client
    s3_client = boto3.client(
        's3',
        aws_access_key_id=aws_access_key,
        aws_secret_access_key=aws_secret_key,
        region_name=aws_region
    )
    
    try:
        # Step 1: Create the bucket
        print("\nStep 1: Creating S3 bucket...")
        try:
            if aws_region == 'us-east-1':
                # us-east-1 doesn't need LocationConstraint
                s3_client.create_bucket(Bucket=new_bucket_name)
            else:
                s3_client.create_bucket(
                    Bucket=new_bucket_name,
                    CreateBucketConfiguration={'LocationConstraint': aws_region}
                )
            print(f"✓ Bucket '{new_bucket_name}' created successfully")
        except ClientError as e:
            print(f"✗ Failed to create bucket: {e}")
            sys.exit(1)
        
        # Step 2: Disable Block Public Access
        print("\nStep 2: Configuring public access settings...")
        try:
            s3_client.put_public_access_block(
                Bucket=new_bucket_name,
                PublicAccessBlockConfiguration={
                    'BlockPublicAcls': False,
                    'IgnorePublicAcls': False,
                    'BlockPublicPolicy': False,
                    'RestrictPublicBuckets': False
                }
            )
            print("✓ Public access block settings configured")
        except ClientError as e:
            print(f"⚠ Warning: Could not configure public access block: {e}")
            print("  Continuing anyway...")
        
        # Step 3: Set bucket ownership controls
        print("\nStep 3: Configuring bucket ownership...")
        try:
            s3_client.put_bucket_ownership_controls(
                Bucket=new_bucket_name,
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
            print(f"⚠ Warning: Could not set ownership controls: {e}")
            print("  Continuing anyway...")
        
        # Step 4: Add bucket policy for public read
        print("\nStep 4: Adding public read policy...")
        bucket_policy = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Sid": "PublicReadGetObject",
                    "Effect": "Allow",
                    "Principal": "*",
                    "Action": "s3:GetObject",
                    "Resource": f"arn:aws:s3:::{new_bucket_name}/*"
                }
            ]
        }
        
        try:
            s3_client.put_bucket_policy(
                Bucket=new_bucket_name,
                Policy=json.dumps(bucket_policy)
            )
            print("✓ Public read policy applied")
        except ClientError as e:
            print(f"✗ Failed to set bucket policy: {e}")
            print("\nBucket was created but policy couldn't be applied.")
            print("You may need to add the policy manually via AWS Console.")
        
        # Step 5: Enable CORS for web access
        print("\nStep 5: Configuring CORS...")
        cors_configuration = {
            'CORSRules': [
                {
                    'AllowedHeaders': ['*'],
                    'AllowedMethods': ['GET', 'HEAD'],
                    'AllowedOrigins': ['*'],
                    'ExposeHeaders': ['ETag'],
                    'MaxAgeSeconds': 3600
                }
            ]
        }
        
        try:
            s3_client.put_bucket_cors(
                Bucket=new_bucket_name,
                CORSConfiguration=cors_configuration
            )
            print("✓ CORS configured for web access")
        except ClientError as e:
            print(f"⚠ Warning: Could not configure CORS: {e}")
        
        # Success!
        print("\n" + "=" * 60)
        print("✓ SUCCESS! New public bucket created and configured!")
        print("=" * 60)
        print(f"\nBucket Name: {new_bucket_name}")
        print(f"Region: {aws_region}")
        print(f"Public URL Format: https://{new_bucket_name}.s3.amazonaws.com/<key>")
        print("\n" + "=" * 60)
        print("NEXT STEPS:")
        print("=" * 60)
        print("1. Update your .env file with the new bucket name:")
        print(f"   AWS_S3_BUCKET={new_bucket_name}")
        print("\n2. Restart your application")
        print("\n3. Test by generating some data with images/PDFs")
        print("=" * 60)
        
        # Write to a file for easy reference
        with open('new-bucket-config.txt', 'w') as f:
            f.write(f"AWS_S3_BUCKET={new_bucket_name}\n")
            f.write(f"AWS_REGION={aws_region}\n")
            f.write(f"\nPublic URL: https://{new_bucket_name}.s3.amazonaws.com/\n")
        
        print(f"\n📝 Configuration saved to: new-bucket-config.txt")
        
    except Exception as e:
        print(f"\n✗ ERROR: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()

