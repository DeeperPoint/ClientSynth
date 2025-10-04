#!/usr/bin/env python3
import os
import sys
import time
import json
import httpx

BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")
EMAIL = os.getenv("EMAIL", "demo@example.com")
PASSWORD = os.getenv("PASSWORD", "demopass123")
TENANT_SLUG = os.getenv("TENANT_SLUG", "demo-tenant")
TENANT_NAME = os.getenv("TENANT_NAME", "Demo Tenant")
SCHEMA_NAME = os.getenv("SCHEMA_NAME", "People With Photos")
DRIVE_FOLDER = os.getenv("DRIVE_FOLDER")  # required
TOTAL = int(os.getenv("TOTAL", "10"))

if not DRIVE_FOLDER:
    print("ERROR: Set DRIVE_FOLDER to a Google Drive folder URL or ID shared with your service account.")
    sys.exit(1)

headers = {"Content-Type": "application/json"}


def _post(client, path, json_body, token=None, form=False):
    h = headers.copy()
    if token:
        h["Authorization"] = f"Bearer {token}"
    if form:
        return client.post(f"{BASE_URL}{path}", data=json_body, headers=h)
    else:
        return client.post(f"{BASE_URL}{path}", json=json_body, headers=h)


def _get(client, path, token=None, params=None):
    h = headers.copy()
    if token:
        h["Authorization"] = f"Bearer {token}"
    return client.get(f"{BASE_URL}{path}", params=params or {}, headers=h)


def main():
    with httpx.Client(timeout=60) as client:
        # Register or login
        token = None
        r = _post(client, "/api/v1/auth/register", {"email": EMAIL, "password": PASSWORD, "full_name": "Demo User"})
        if r.status_code == 200:
            token = r.json()["access_token"]
            print("Registered new user.")
        else:
            # Try login
            r = client.post(
                f"{BASE_URL}/api/v1/auth/login",
                data={"username": EMAIL, "password": PASSWORD},
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            r.raise_for_status()
            token = r.json()["access_token"]
            print("Logged in existing user.")

        # Create or get tenant
        r = _post(client, "/api/v1/tenants/", {"name": TENANT_NAME, "slug": TENANT_SLUG}, token=token)
        if r.status_code == 200:
            tenant = r.json()
            tenant_id = tenant["id"]
            print("Created tenant:", tenant_id)
        else:
            # list and find
            r = _get(client, "/api/v1/tenants/", token=token)
            r.raise_for_status()
            tenants = r.json()
            match = next((t for t in tenants if t["slug"] == TENANT_SLUG), None)
            if not match:
                print("ERROR: Could not create or find tenant")
                sys.exit(2)
            tenant_id = match["id"]
            print("Using existing tenant:", tenant_id)

        # Create schema
        schema_definition = {
            "fields": [
                {"name": "first_name", "type": "name", "description": "Person first name"},
                {"name": "last_name", "type": "name", "description": "Person last name"},
                {"name": "bio", "type": "text", "description": "Short professional bio"},
                {"name": "photo", "type": "image", "prompt": "Professional headshot"},
            ]
        }
        r = _post(
            client,
            "/api/v1/schemas/",
            {"tenant_id": tenant_id, "name": SCHEMA_NAME, "schema_definition": schema_definition},
            token=token,
        )
        r.raise_for_status()
        schema = r.json()
        schema_id = schema["id"]
        print("Created schema:", schema_id)

        # Import seeds from Google Drive
        r = _post(
            client,
            "/api/v1/seeds/import_drive",
            {"tenant_id": tenant_id, "name": "Drive Seeds", "folder_url_or_id": DRIVE_FOLDER},
            token=token,
        )
        r.raise_for_status()
        seed_info = r.json()
        print("Imported seed:", seed_info)

        # Create job
        r = _post(
            client,
            "/api/v1/jobs/",
            {"tenant_id": tenant_id, "schema_id": schema_id, "name": "Batch Image Gen", "total_records": TOTAL},
            token=token,
        )
        r.raise_for_status()
        job = r.json()
        job_id = job["id"]
        print("Created job:", job_id)

        # Process all pending jobs
        r = _post(client, "/api/v1/jobs/process_all", {}, token=token)
        r.raise_for_status()
        print("Process_all:", r.json())

        # Poll job
        for _ in range(30):
            r = _get(client, f"/api/v1/jobs/{job_id}", token=token)
            r.raise_for_status()
            j = r.json()
            print("Job status:", j)
            if j["status"] in ("completed", "failed"):
                break
            time.sleep(1)

        # Fetch generated data
        r = _get(client, f"/api/v1/jobs/{job_id}/data", token=token)
        r.raise_for_status()
        data = r.json()
        print(f"Generated {len(data)} records. Sample:")
        print(json.dumps(data[:2], indent=2))


if __name__ == "__main__":
    main()
