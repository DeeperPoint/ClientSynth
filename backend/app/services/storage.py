import os
import time
from typing import Tuple
from urllib.parse import quote as urlquote

import boto3
from botocore.client import Config as BotoConfig
from app.core.config import settings


class LocalStorage:
    def __init__(self, base_dir: str = "/tmp/clientsynth"):
        self.base_dir = base_dir
        os.makedirs(self.base_dir, exist_ok=True)

    def save_generated(self, tenant_id: str, job_id: str, record_id: str, field_name: str, data: bytes) -> Tuple[str, str]:
        path_dir = os.path.join(self.base_dir, tenant_id, job_id, record_id)
        os.makedirs(path_dir, exist_ok=True)
        file_path = os.path.join(path_dir, f"{field_name}.png")
        with open(file_path, "wb") as f:
            f.write(data)
        url = f"file://{file_path}"
        return file_path, url

    def save_bytes(self, tenant_id: str, job_id: str, record_id: str, field_name: str, data: bytes, ext: str = ".bin", content_type: str | None = None) -> Tuple[str, str]:
        """Save arbitrary bytes (PDFs, etc.) and return (path_or_key, url)."""
        path_dir = os.path.join(self.base_dir, tenant_id, job_id, record_id)
        os.makedirs(path_dir, exist_ok=True)
        safe_ext = ext if ext.startswith(".") else f".{ext}"
        file_path = os.path.join(path_dir, f"{field_name}{safe_ext}")
        with open(file_path, "wb") as f:
            f.write(data)
        url = f"file://{file_path}"
        return file_path, url


class S3Storage:
    def __init__(self, bucket: str | None = None, region: str | None = None, base_prefix: str = "clientsynth"):
        self.bucket = bucket or settings.AWS_S3_BUCKET
        self.region = region or settings.AWS_REGION
        if not self.bucket:
            raise RuntimeError("AWS_S3_BUCKET not configured")
        self.base_prefix = base_prefix.strip("/")
        self.s3 = boto3.client(
            "s3",
            region_name=self.region,
            config=BotoConfig(s3={"addressing_style": "virtual"}),
        )

    def _key(self, tenant_id: str, job_id: str, record_id: str, field_name: str) -> str:
        safe = lambda s: urlquote(s, safe="")
        return f"{self.base_prefix}/{safe(tenant_id)}/{safe(job_id)}/{safe(record_id)}/{safe(field_name)}.png"

    def save_generated(self, tenant_id: str, job_id: str, record_id: str, field_name: str, data: bytes) -> Tuple[str, str]:
        key = self._key(tenant_id, job_id, record_id, field_name)
        self.s3.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType="image/png")
        # Try to form a public URL; if bucket is not public, we can presign
        public_url = f"https://{self.bucket}.s3.{self.region}.amazonaws.com/{key}"
        # Optionally presign (safer for private buckets)
        try:
            url = self.s3.generate_presigned_url(
                "get_object", Params={"Bucket": self.bucket, "Key": key}, ExpiresIn=3600
            )
        except Exception:
            url = public_url
        return key, url

    def save_bytes(self, tenant_id: str, job_id: str, record_id: str, field_name: str, data: bytes, ext: str = ".bin", content_type: str | None = None) -> Tuple[str, str]:
        key_base = self._key(tenant_id, job_id, record_id, field_name)
        # replace .png with provided ext
        if ext and ext.startswith("."):
            key = key_base.rsplit(".", 1)[0] + ext
        else:
            key = key_base + ext
        self.s3.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type or "application/octet-stream")
        public_url = f"https://{self.bucket}.s3.{self.region}.amazonaws.com/{key}"
        try:
            url = self.s3.generate_presigned_url(
                "get_object", Params={"Bucket": self.bucket, "Key": key}, ExpiresIn=3600
            )
        except Exception:
            url = public_url
        return key, url


def get_storage():
    if settings.AWS_S3_BUCKET:
        try:
            return S3Storage()
        except Exception:
            # Fallback to local if misconfigured
            return LocalStorage()
    return LocalStorage()


