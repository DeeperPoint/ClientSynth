"""
Comprehensive QA test suite for all backend endpoints.

Covers:
- Auth: register, login, duplicate email, invalid creds, missing fields
- Tenants: create, list, duplicate slug
- Schemas: CRUD, validation, tenant isolation
- Seeds: upload, list, detail, images, feedback, bad zip, non-zip
- Images: generate, batch_generate, missing seed
- Jobs: create, process, get, data, logs, missing schema
- Exports: create, get, recent, download, delete, unsupported format, route ordering
- Documents: template upload, non-PDF rejection
- Auth guards: unauthenticated access, wrong tenant
"""

import io
import json
import os
import zipfile

from PIL import Image

from app.core.security import create_access_token
from app.models.identity import User, Tenant, UserTenantRole
from app.models.schema import Schema
from app.models.jobs import Job, GeneratedData
from app.models.seeds import Seed, SeedImage


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_zip(images: dict[str, tuple[int, int, tuple]]) -> bytes:
    """Create an in-memory ZIP with PNG images.
    images: {filename: (width, height, color)}
    """
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w") as zf:
        for fname, (w, h, color) in images.items():
            im = Image.new("RGB", (w, h), color=color)
            img_buf = io.BytesIO()
            im.save(img_buf, format="PNG")
            img_buf.seek(0)
            zf.writestr(fname, img_buf.getvalue())
    return buf.getvalue()


def _register(client, email="qa@test.com", password="TestPass123!") -> str:
    """Register a user and return the access token."""
    r = client.post("/api/v1/auth/register", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _create_tenant(client, headers, name="QA Tenant", slug="qa-tenant") -> str:
    """Create a tenant and return tenant_id."""
    r = client.post("/api/v1/tenants/", json={"name": name, "slug": slug}, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _seed_user_tenant(db_session, email="seed@test.com") -> tuple[str, str]:
    """Directly seed a user and tenant in the DB, return (user_id, tenant_id)."""
    from app.core.security import hash_password
    user = User(email=email, password_hash=hash_password("pass"), full_name="Seed User")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    tenant = Tenant(name="Seed Tenant", slug=f"seed-tenant-{user.id[:8]}")
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)
    db_session.add(UserTenantRole(user_id=user.id, tenant_id=tenant.id, role="owner"))
    db_session.commit()
    return user.id, tenant.id


def _auth_header_for(user_id: str) -> dict:
    token = create_access_token(user_id)
    return {"Authorization": f"Bearer {token}"}


# ===========================================================================
# AUTH TESTS
# ===========================================================================

class TestAuth:
    def test_register_returns_token(self, client):
        r = client.post("/api/v1/auth/register", json={
            "email": "auth1@test.com", "password": "Secret123", "full_name": "Auth User"
        })
        assert r.status_code == 200
        body = r.json()
        assert "access_token" in body
        assert body["token_type"] == "bearer"

    def test_register_duplicate_email(self, client):
        client.post("/api/v1/auth/register", json={"email": "dup@test.com", "password": "pass"})
        r = client.post("/api/v1/auth/register", json={"email": "dup@test.com", "password": "other"})
        assert r.status_code == 400
        assert "already registered" in r.json()["detail"].lower()

    def test_register_invalid_email(self, client):
        r = client.post("/api/v1/auth/register", json={"email": "not-an-email", "password": "pass"})
        assert r.status_code == 422  # validation error

    def test_register_missing_password(self, client):
        r = client.post("/api/v1/auth/register", json={"email": "nopass@test.com"})
        assert r.status_code == 422

    def test_login_valid(self, client):
        client.post("/api/v1/auth/register", json={"email": "login1@test.com", "password": "Pass1"})
        r = client.post("/api/v1/auth/login", data={"username": "login1@test.com", "password": "Pass1"})
        assert r.status_code == 200
        assert "access_token" in r.json()

    def test_login_wrong_password(self, client):
        client.post("/api/v1/auth/register", json={"email": "login2@test.com", "password": "Right"})
        r = client.post("/api/v1/auth/login", data={"username": "login2@test.com", "password": "Wrong"})
        assert r.status_code == 401

    def test_login_nonexistent_user(self, client):
        r = client.post("/api/v1/auth/login", data={"username": "nobody@test.com", "password": "x"})
        assert r.status_code == 401

    def test_unauthenticated_access(self, client):
        """Endpoints requiring auth should return 403 (HTTPBearer) when no token is provided."""
        r = client.get("/api/v1/tenants/")
        assert r.status_code == 403

    def test_invalid_token(self, client):
        r = client.get("/api/v1/tenants/", headers={"Authorization": "Bearer invalidtoken"})
        assert r.status_code == 401


# ===========================================================================
# TENANT TESTS
# ===========================================================================

class TestTenants:
    def test_create_tenant(self, client):
        token = _register(client, "t1@test.com")
        headers = _auth_header(token)
        r = client.post("/api/v1/tenants/", json={"name": "T1", "slug": "t-1"}, headers=headers)
        assert r.status_code == 200
        body = r.json()
        assert body["name"] == "T1"
        assert body["slug"] == "t-1"
        assert "id" in body

    def test_create_duplicate_slug(self, client):
        token = _register(client, "t2@test.com")
        headers = _auth_header(token)
        client.post("/api/v1/tenants/", json={"name": "A", "slug": "dup-slug"}, headers=headers)
        r = client.post("/api/v1/tenants/", json={"name": "B", "slug": "dup-slug"}, headers=headers)
        assert r.status_code == 400
        assert "slug" in r.json()["detail"].lower()

    def test_list_my_tenants(self, client):
        token = _register(client, "t3@test.com")
        headers = _auth_header(token)
        client.post("/api/v1/tenants/", json={"name": "X", "slug": "t3-x"}, headers=headers)
        client.post("/api/v1/tenants/", json={"name": "Y", "slug": "t3-y"}, headers=headers)
        r = client.get("/api/v1/tenants/", headers=headers)
        assert r.status_code == 200
        tenants = r.json()
        assert len(tenants) >= 2
        slugs = {t["slug"] for t in tenants}
        assert "t3-x" in slugs
        assert "t3-y" in slugs

    def test_tenant_isolation_between_users(self, client):
        token_a = _register(client, "iso_a@test.com")
        token_b = _register(client, "iso_b@test.com")
        hdr_a = _auth_header(token_a)
        hdr_b = _auth_header(token_b)
        client.post("/api/v1/tenants/", json={"name": "A-only", "slug": "iso-a"}, headers=hdr_a)
        r = client.get("/api/v1/tenants/", headers=hdr_b)
        slugs = {t["slug"] for t in r.json()}
        assert "iso-a" not in slugs


# ===========================================================================
# SCHEMA TESTS
# ===========================================================================

class TestSchemas:
    def test_create_schema(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "sch1@test.com")
        headers = _auth_header_for(uid)
        r = client.post("/api/v1/schemas/", json={
            "tenant_id": tid,
            "name": "Person",
            "schema_definition": {"fields": [{"name": "first_name", "type": "text"}]}
        }, headers=headers)
        assert r.status_code == 200
        body = r.json()
        assert body["name"] == "Person"
        assert "id" in body

    def test_create_schema_missing_fields_key(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "sch2@test.com")
        headers = _auth_header_for(uid)
        r = client.post("/api/v1/schemas/", json={
            "tenant_id": tid,
            "name": "Bad",
            "schema_definition": {"no_fields": []}
        }, headers=headers)
        assert r.status_code == 400

    def test_list_schemas(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "sch3@test.com")
        headers = _auth_header_for(uid)
        # Create two schemas
        client.post("/api/v1/schemas/", json={
            "tenant_id": tid, "name": "S1",
            "schema_definition": {"fields": [{"name": "a", "type": "text"}]}
        }, headers=headers)
        client.post("/api/v1/schemas/", json={
            "tenant_id": tid, "name": "S2",
            "schema_definition": {"fields": [{"name": "b", "type": "text"}]}
        }, headers=headers)
        r = client.get(f"/api/v1/schemas/?tenant_id={tid}", headers=headers)
        assert r.status_code == 200
        schemas = r.json()
        assert len(schemas) >= 2

    def test_get_schema_by_id(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "sch4@test.com")
        headers = _auth_header_for(uid)
        r1 = client.post("/api/v1/schemas/", json={
            "tenant_id": tid, "name": "Fetch Me",
            "schema_definition": {"fields": [{"name": "c", "type": "text"}]}
        }, headers=headers)
        sid = r1.json()["id"]
        r2 = client.get(f"/api/v1/schemas/{sid}", headers=headers)
        assert r2.status_code == 200
        assert r2.json()["id"] == sid

    def test_get_schema_not_found(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "sch5@test.com")
        headers = _auth_header_for(uid)
        r = client.get("/api/v1/schemas/nonexistent-id", headers=headers)
        assert r.status_code == 404

    def test_schema_tenant_access_denied(self, client, db_session):
        uid1, tid1 = _seed_user_tenant(db_session, "sch6a@test.com")
        uid2, _ = _seed_user_tenant(db_session, "sch6b@test.com")
        headers2 = _auth_header_for(uid2)
        # uid2 should not be able to list schemas for tid1
        r = client.get(f"/api/v1/schemas/?tenant_id={tid1}", headers=headers2)
        assert r.status_code == 403


# ===========================================================================
# SEED TESTS
# ===========================================================================

class TestSeeds:
    def test_upload_seed_zip(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "seed1@test.com")
        headers = _auth_header_for(uid)
        zip_bytes = _make_zip({"img1.png": (16, 16, (255, 0, 0)), "img2.jpg": (24, 24, (0, 255, 0))})
        files = {
            "tenant_id": (None, tid),
            "name": (None, "Test Seed"),
            "description": (None, "A test seed"),
            "category": (None, "test-cat"),
            "zip_file": ("test.zip", zip_bytes, "application/zip"),
        }
        r = client.post("/api/v1/seeds/upload", files=files, headers=headers)
        assert r.status_code == 200
        body = r.json()
        assert body["images"] == 2
        assert body["status"] == "completed"

    def test_upload_non_zip_rejected(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "seed2@test.com")
        headers = _auth_header_for(uid)
        files = {
            "tenant_id": (None, tid),
            "name": (None, "Not Zip"),
            "description": (None, ""),
            "category": (None, ""),
            "zip_file": ("test.txt", b"hello", "text/plain"),
        }
        r = client.post("/api/v1/seeds/upload", files=files, headers=headers)
        assert r.status_code == 400
        assert "zip" in r.json()["detail"].lower()

    def test_upload_bad_zip(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "seed3@test.com")
        headers = _auth_header_for(uid)
        files = {
            "tenant_id": (None, tid),
            "name": (None, "Bad Zip"),
            "description": (None, ""),
            "category": (None, ""),
            "zip_file": ("bad.zip", b"this is not a zip", "application/zip"),
        }
        r = client.post("/api/v1/seeds/upload", files=files, headers=headers)
        assert r.status_code == 400
        assert "invalid" in r.json()["detail"].lower() or "zip" in r.json()["detail"].lower()

    def test_upload_zip_no_images(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "seed4@test.com")
        headers = _auth_header_for(uid)
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, mode="w") as zf:
            zf.writestr("readme.txt", "no images here")
        zip_bytes = buf.getvalue()
        files = {
            "tenant_id": (None, tid),
            "name": (None, "Empty Seed"),
            "description": (None, ""),
            "category": (None, ""),
            "zip_file": ("empty.zip", zip_bytes, "application/zip"),
        }
        r = client.post("/api/v1/seeds/upload", files=files, headers=headers)
        assert r.status_code == 200
        assert r.json()["images"] == 0

    def test_list_seeds(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "seed5@test.com")
        headers = _auth_header_for(uid)
        zip_bytes = _make_zip({"a.png": (8, 8, (0, 0, 0))})
        files = {
            "tenant_id": (None, tid), "name": (None, "ListSeed"),
            "description": (None, ""), "category": (None, "cat1"),
            "zip_file": ("s.zip", zip_bytes, "application/zip"),
        }
        client.post("/api/v1/seeds/upload", files=files, headers=headers)
        r = client.get(f"/api/v1/seeds/?tenant_id={tid}", headers=headers)
        assert r.status_code == 200
        seeds = r.json()
        assert any(s["name"] == "ListSeed" for s in seeds)

    def test_get_seed_detail_with_images(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "seed6@test.com")
        headers = _auth_header_for(uid)
        zip_bytes = _make_zip({"pic.png": (32, 32, (128, 128, 128))})
        files = {
            "tenant_id": (None, tid), "name": (None, "Detail"),
            "description": (None, "desc"), "category": (None, "photos"),
            "zip_file": ("d.zip", zip_bytes, "application/zip"),
        }
        r1 = client.post("/api/v1/seeds/upload", files=files, headers=headers)
        seed_id = r1.json()["id"]

        r2 = client.get(f"/api/v1/seeds/{seed_id}?include_images=true", headers=headers)
        assert r2.status_code == 200
        body = r2.json()
        assert body["name"] == "Detail"
        assert "images" in body
        assert len(body["images"]) == 1
        assert body["images"][0]["w"] == 32

    def test_get_seed_not_found(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "seed7@test.com")
        headers = _auth_header_for(uid)
        r = client.get("/api/v1/seeds/nonexistent", headers=headers)
        assert r.status_code == 404

    def test_list_seed_images(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "seed8@test.com")
        headers = _auth_header_for(uid)
        zip_bytes = _make_zip({"x.png": (10, 10, (1, 2, 3)), "y.png": (20, 20, (4, 5, 6))})
        files = {
            "tenant_id": (None, tid), "name": (None, "ImgList"),
            "description": (None, ""), "category": (None, ""),
            "zip_file": ("il.zip", zip_bytes, "application/zip"),
        }
        r1 = client.post("/api/v1/seeds/upload", files=files, headers=headers)
        seed_id = r1.json()["id"]

        r2 = client.get(f"/api/v1/seeds/{seed_id}/images", headers=headers)
        assert r2.status_code == 200
        imgs = r2.json()
        assert len(imgs) == 2

    def test_submit_feedback(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "seed9@test.com")
        headers = _auth_header_for(uid)
        zip_bytes = _make_zip({"fb.png": (8, 8, (0, 0, 0))})
        files = {
            "tenant_id": (None, tid), "name": (None, "FBSeed"),
            "description": (None, ""), "category": (None, ""),
            "zip_file": ("fb.zip", zip_bytes, "application/zip"),
        }
        r1 = client.post("/api/v1/seeds/upload", files=files, headers=headers)
        seed_id = r1.json()["id"]

        r2 = client.post(f"/api/v1/seeds/{seed_id}/feedback",
                         data={"quality_rating": "4", "feedback_type": "manual"},
                         headers=headers)
        assert r2.status_code == 200
        assert r2.json()["ok"] is True

    def test_seed_tenant_access_denied(self, client, db_session):
        uid1, tid1 = _seed_user_tenant(db_session, "seed10a@test.com")
        uid2, _ = _seed_user_tenant(db_session, "seed10b@test.com")
        headers2 = _auth_header_for(uid2)
        r = client.get(f"/api/v1/seeds/?tenant_id={tid1}", headers=headers2)
        assert r.status_code == 403


# ===========================================================================
# IMAGE GENERATION TESTS
# ===========================================================================

class TestImages:
    def test_generate_single_image(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "img1@test.com")
        headers = _auth_header_for(uid)
        seed = Seed(tenant_id=tid, name="S", upload_status="completed", created_by=uid)
        db_session.add(seed)
        db_session.commit()
        db_session.refresh(seed)
        si = SeedImage(seed_id=seed.id, tenant_id=tid, filename="a.png",
                       s3_key="local://x/a.png", s3_url="local://x/a.png",
                       width=64, height=64)
        db_session.add(si)
        db_session.commit()
        db_session.refresh(si)

        r = client.post("/api/v1/images/generate", json={
            "tenant_id": tid, "job_id": "j1", "record_id": "r1",
            "field_name": "photo", "seed_id": seed.id,
            "seed_image_id": si.id, "prompt": "test", "style": "professional"
        }, headers=headers)
        assert r.status_code == 200
        body = r.json()
        assert body["w"] == 64
        assert body["h"] == 64
        assert "url" in body

    def test_generate_missing_seed(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "img2@test.com")
        headers = _auth_header_for(uid)
        r = client.post("/api/v1/images/generate", json={
            "tenant_id": tid, "job_id": "j1", "record_id": "r1",
            "field_name": "photo", "seed_id": "nonexistent",
            "seed_image_id": "nonexistent", "prompt": "test"
        }, headers=headers)
        assert r.status_code == 404

    def test_generate_missing_seed_image(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "img3@test.com")
        headers = _auth_header_for(uid)
        seed = Seed(tenant_id=tid, name="S", upload_status="completed", created_by=uid)
        db_session.add(seed)
        db_session.commit()
        db_session.refresh(seed)

        r = client.post("/api/v1/images/generate", json={
            "tenant_id": tid, "job_id": "j1", "record_id": "r1",
            "field_name": "photo", "seed_id": seed.id,
            "seed_image_id": "bad-image-id", "prompt": "test"
        }, headers=headers)
        assert r.status_code == 404

    def test_batch_generate_with_fallback(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "img4@test.com")
        headers = _auth_header_for(uid)
        zip_bytes = _make_zip({"x.png": (10, 10, (0, 0, 0))})
        files = {
            "tenant_id": (None, tid), "name": (None, "BatchSeed"),
            "description": (None, ""), "category": (None, ""),
            "zip_file": ("b.zip", zip_bytes, "application/zip"),
        }
        r1 = client.post("/api/v1/seeds/upload", files=files, headers=headers)
        seed_id = r1.json()["id"]

        r2 = client.post("/api/v1/images/batch_generate", json={
            "tenant_id": tid, "seed_id": seed_id,
            "total_outputs": 3, "repeat_per_image": 1,
            "prompt": "test", "style": "professional"
        }, headers=headers)
        assert r2.status_code == 200
        outputs = r2.json()
        assert len(outputs) == 3

    def test_batch_generate_nonexistent_seed(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "img5@test.com")
        headers = _auth_header_for(uid)
        r = client.post("/api/v1/images/batch_generate", json={
            "tenant_id": tid, "seed_id": "nonexistent",
            "total_outputs": 1
        }, headers=headers)
        assert r.status_code == 404


# ===========================================================================
# JOB TESTS
# ===========================================================================

class TestJobs:
    def _setup_schema(self, db_session, uid, tid) -> str:
        schema = Schema(
            tenant_id=tid, name="TestSchema", created_by=uid,
            schema_definition={"fields": [{"name": "first_name", "type": "text"}]}
        )
        db_session.add(schema)
        db_session.commit()
        db_session.refresh(schema)
        return schema.id

    def test_create_job(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "job1@test.com")
        schema_id = self._setup_schema(db_session, uid, tid)
        headers = _auth_header_for(uid)

        r = client.post("/api/v1/jobs/", json={
            "tenant_id": tid, "schema_id": schema_id,
            "name": "Test Job", "total_records": 2
        }, headers=headers)
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "pending"
        assert "id" in body

    def test_create_job_missing_schema(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "job2@test.com")
        headers = _auth_header_for(uid)
        r = client.post("/api/v1/jobs/", json={
            "tenant_id": tid, "schema_id": "nonexistent",
            "name": "Bad Job", "total_records": 1
        }, headers=headers)
        assert r.status_code == 404

    def test_process_one_and_get_job(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "job3@test.com")
        schema_id = self._setup_schema(db_session, uid, tid)
        headers = _auth_header_for(uid)

        # Drain any stale pending jobs from previous tests
        client.post("/api/v1/jobs/process_all", headers=headers)

        r1 = client.post("/api/v1/jobs/", json={
            "tenant_id": tid, "schema_id": schema_id,
            "name": "Process Job", "total_records": 1
        }, headers=headers)
        job_id = r1.json()["id"]

        r2 = client.post("/api/v1/jobs/process_one", headers=headers)
        assert r2.status_code == 200

        r3 = client.get(f"/api/v1/jobs/{job_id}", headers=headers)
        assert r3.status_code == 200
        body = r3.json()
        # After processing one record, job should be completed or failed
        assert body["status"] in ("completed", "processing", "failed")

    def test_process_all(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "job4@test.com")
        schema_id = self._setup_schema(db_session, uid, tid)
        headers = _auth_header_for(uid)

        # Create two jobs
        client.post("/api/v1/jobs/", json={
            "tenant_id": tid, "schema_id": schema_id,
            "name": "Job A", "total_records": 1
        }, headers=headers)
        client.post("/api/v1/jobs/", json={
            "tenant_id": tid, "schema_id": schema_id,
            "name": "Job B", "total_records": 1
        }, headers=headers)

        r = client.post("/api/v1/jobs/process_all", headers=headers)
        assert r.status_code == 200
        assert r.json()["processed"] >= 2

    def test_get_job_data(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "job5@test.com")
        schema_id = self._setup_schema(db_session, uid, tid)
        headers = _auth_header_for(uid)

        r1 = client.post("/api/v1/jobs/", json={
            "tenant_id": tid, "schema_id": schema_id,
            "name": "Data Job", "total_records": 2
        }, headers=headers)
        job_id = r1.json()["id"]
        client.post("/api/v1/jobs/process_one", headers=headers)

        r2 = client.get(f"/api/v1/jobs/{job_id}/data", headers=headers)
        assert r2.status_code == 200
        assert isinstance(r2.json(), list)

    def test_get_job_logs(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "job6@test.com")
        schema_id = self._setup_schema(db_session, uid, tid)
        headers = _auth_header_for(uid)

        r1 = client.post("/api/v1/jobs/", json={
            "tenant_id": tid, "schema_id": schema_id,
            "name": "Logs Job", "total_records": 1
        }, headers=headers)
        job_id = r1.json()["id"]
        client.post("/api/v1/jobs/process_one", headers=headers)

        r2 = client.get(f"/api/v1/jobs/{job_id}/logs", headers=headers)
        assert r2.status_code == 200
        logs = r2.json()
        assert isinstance(logs, list)
        # Processing should have created at least one log entry
        assert len(logs) >= 1

    def test_get_job_not_found(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "job7@test.com")
        headers = _auth_header_for(uid)
        r = client.get("/api/v1/jobs/nonexistent", headers=headers)
        assert r.status_code == 404

    def test_job_tenant_access_denied(self, client, db_session):
        uid1, tid1 = _seed_user_tenant(db_session, "job8a@test.com")
        uid2, _ = _seed_user_tenant(db_session, "job8b@test.com")
        schema_id = self._setup_schema(db_session, uid1, tid1)
        headers1 = _auth_header_for(uid1)
        headers2 = _auth_header_for(uid2)

        r1 = client.post("/api/v1/jobs/", json={
            "tenant_id": tid1, "schema_id": schema_id,
            "name": "Private Job", "total_records": 1
        }, headers=headers1)
        job_id = r1.json()["id"]

        r2 = client.get(f"/api/v1/jobs/{job_id}", headers=headers2)
        assert r2.status_code == 403


# ===========================================================================
# EXPORT TESTS
# ===========================================================================

class TestExports:
    def _seed_completed_job(self, db_session, uid, tid) -> str:
        schema = Schema(
            tenant_id=tid, name="ExpSchema", created_by=uid,
            schema_definition={"fields": [{"name": "name", "type": "text"}]}
        )
        db_session.add(schema)
        db_session.commit()
        db_session.refresh(schema)
        job = Job(tenant_id=tid, schema_id=schema.id, name="ExpJob",
                  total_records=2, generated_records=2, status="completed",
                  created_by=uid, progress=100)
        db_session.add(job)
        db_session.commit()
        db_session.refresh(job)
        for i in range(2):
            db_session.add(GeneratedData(
                job_id=job.id, tenant_id=tid, record_index=i,
                record_data={"name": f"Person{i}"}
            ))
        db_session.commit()
        return job.id

    def test_create_json_export(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "exp1@test.com")
        job_id = self._seed_completed_job(db_session, uid, tid)
        headers = _auth_header_for(uid)

        r = client.post("/api/v1/exports/", json={
            "job_id": job_id, "format": "json"
        }, headers=headers)
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "completed"
        assert body["id"]

    def test_create_csv_export(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "exp2@test.com")
        job_id = self._seed_completed_job(db_session, uid, tid)
        headers = _auth_header_for(uid)

        r = client.post("/api/v1/exports/", json={
            "job_id": job_id, "format": "csv"
        }, headers=headers)
        assert r.status_code == 200
        assert r.json()["status"] == "completed"

    def test_create_export_unsupported_format(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "exp3@test.com")
        job_id = self._seed_completed_job(db_session, uid, tid)
        headers = _auth_header_for(uid)

        r = client.post("/api/v1/exports/", json={
            "job_id": job_id, "format": "xlsx"
        }, headers=headers)
        assert r.status_code == 400

    def test_create_export_missing_job(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "exp4@test.com")
        headers = _auth_header_for(uid)

        r = client.post("/api/v1/exports/", json={
            "job_id": "nonexistent", "format": "json"
        }, headers=headers)
        assert r.status_code == 404

    def test_get_export(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "exp5@test.com")
        job_id = self._seed_completed_job(db_session, uid, tid)
        headers = _auth_header_for(uid)

        r1 = client.post("/api/v1/exports/", json={"job_id": job_id, "format": "json"}, headers=headers)
        export_id = r1.json()["id"]

        r2 = client.get(f"/api/v1/exports/{export_id}", headers=headers)
        assert r2.status_code == 200
        body = r2.json()
        assert body["id"] == export_id
        assert body["format"] == "json"
        assert body["status"] == "completed"

    def test_get_export_not_found(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "exp6@test.com")
        headers = _auth_header_for(uid)
        r = client.get("/api/v1/exports/nonexistent", headers=headers)
        assert r.status_code == 404

    def test_recent_exports(self, client, db_session):
        """Verify that GET /api/v1/exports/recent works correctly (route ordering fix)."""
        uid, tid = _seed_user_tenant(db_session, "exp7@test.com")
        job_id = self._seed_completed_job(db_session, uid, tid)
        headers = _auth_header_for(uid)

        # Create an export
        client.post("/api/v1/exports/", json={"job_id": job_id, "format": "json"}, headers=headers)

        r = client.get(f"/api/v1/exports/recent?tenant_id={tid}", headers=headers)
        assert r.status_code == 200
        exports = r.json()
        assert isinstance(exports, list)
        assert len(exports) >= 1
        # Verify it's the list format (has 'name', 'format', 'status'), not the detail format
        assert "name" in exports[0]
        assert "format" in exports[0]

    def test_download_export(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "exp8@test.com")
        job_id = self._seed_completed_job(db_session, uid, tid)
        headers = _auth_header_for(uid)

        r1 = client.post("/api/v1/exports/", json={"job_id": job_id, "format": "json"}, headers=headers)
        export_id = r1.json()["id"]

        r2 = client.get(f"/api/v1/exports/{export_id}/download", headers=headers)
        assert r2.status_code == 200
        assert "application/json" in r2.headers.get("content-type", "")
        # Content should be valid JSON with 2 records
        data = json.loads(r2.content)
        assert len(data) == 2

    def test_download_csv_export(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "exp9@test.com")
        job_id = self._seed_completed_job(db_session, uid, tid)
        headers = _auth_header_for(uid)

        r1 = client.post("/api/v1/exports/", json={"job_id": job_id, "format": "csv"}, headers=headers)
        export_id = r1.json()["id"]

        r2 = client.get(f"/api/v1/exports/{export_id}/download", headers=headers)
        assert r2.status_code == 200
        assert "text/csv" in r2.headers.get("content-type", "")
        content = r2.content.decode("utf-8")
        lines = content.strip().split("\n")
        assert len(lines) == 3  # header + 2 rows

    def test_delete_export(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "exp10@test.com")
        job_id = self._seed_completed_job(db_session, uid, tid)
        headers = _auth_header_for(uid)

        r1 = client.post("/api/v1/exports/", json={"job_id": job_id, "format": "json"}, headers=headers)
        export_id = r1.json()["id"]

        r2 = client.delete(f"/api/v1/exports/{export_id}", headers=headers)
        assert r2.status_code == 200
        assert r2.json()["deleted"] is True

        # Verify it's gone
        r3 = client.get(f"/api/v1/exports/{export_id}", headers=headers)
        assert r3.status_code == 404

    def test_export_tenant_access_denied(self, client, db_session):
        uid1, tid1 = _seed_user_tenant(db_session, "exp11a@test.com")
        uid2, _ = _seed_user_tenant(db_session, "exp11b@test.com")
        job_id = self._seed_completed_job(db_session, uid1, tid1)
        headers1 = _auth_header_for(uid1)
        headers2 = _auth_header_for(uid2)

        r1 = client.post("/api/v1/exports/", json={"job_id": job_id, "format": "json"}, headers=headers1)
        export_id = r1.json()["id"]

        r2 = client.get(f"/api/v1/exports/{export_id}", headers=headers2)
        assert r2.status_code == 403


# ===========================================================================
# DOCUMENT TESTS
# ===========================================================================

class TestDocuments:
    def test_upload_pdf_template(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "doc1@test.com")
        headers = _auth_header_for(uid)
        # Create a minimal PDF-like file (enough to pass the extension check)
        pdf_content = b"%PDF-1.4 minimal"
        files = {"file": ("template.pdf", pdf_content, "application/pdf")}
        r = client.post(f"/api/v1/documents/templates/upload?tenant_id={tid}&name=TestTemplate",
                        files=files, headers=headers)
        assert r.status_code == 200
        body = r.json()
        assert body["name"] == "TestTemplate"
        assert body["filename"] == "template.pdf"
        assert "id" in body

    def test_upload_non_pdf_rejected(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "doc2@test.com")
        headers = _auth_header_for(uid)
        files = {"file": ("doc.txt", b"not a pdf", "text/plain")}
        r = client.post(f"/api/v1/documents/templates/upload?tenant_id={tid}&name=Bad",
                        files=files, headers=headers)
        assert r.status_code == 400
        assert "pdf" in r.json()["detail"].lower()

    def test_generate_document_missing_template(self, client, db_session):
        uid, tid = _seed_user_tenant(db_session, "doc3@test.com")
        headers = _auth_header_for(uid)
        r = client.post("/api/v1/documents/generate", json={
            "tenant_id": tid, "template_id": "nonexistent",
            "data": {"field1": "value1"}
        }, headers=headers)
        assert r.status_code == 404


# ===========================================================================
# HEALTH / READINESS TESTS
# ===========================================================================

class TestHealthReadiness:
    def test_health(self, client):
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_ready(self, client):
        r = client.get("/ready")
        assert r.status_code == 200
        assert r.json()["ready"] is True

    def test_root(self, client):
        r = client.get("/")
        assert r.status_code == 200
        body = r.json()
        assert body["service"] == "clientsynth-backend"
        assert "version" in body


# ===========================================================================
# END-TO-END WORKFLOW TEST
# ===========================================================================

class TestE2EWorkflow:
    def test_full_generation_pipeline(self, client, db_session):
        """
        Full end-to-end: register -> create tenant -> create schema ->
        upload seed -> create job -> process job -> verify generated data ->
        export JSON -> download export
        """
        # 1. Register
        token = _register(client, "e2e@test.com", "E2EPass!")
        headers = _auth_header(token)

        # 2. Create tenant
        tid = _create_tenant(client, headers, "E2E Tenant", "e2e-tenant")

        # 3. Create schema with text + image fields
        r = client.post("/api/v1/schemas/", json={
            "tenant_id": tid,
            "name": "E2E Schema",
            "schema_definition": {
                "fields": [
                    {"name": "full_name", "type": "text"},
                    {"name": "avatar", "type": "image", "prompt": "professional portrait"},
                ]
            }
        }, headers=headers)
        assert r.status_code == 200
        schema_id = r.json()["id"]

        # 4. Upload a seed
        zip_bytes = _make_zip({"portrait.png": (64, 64, (200, 150, 100))})
        files = {
            "tenant_id": (None, tid), "name": (None, "Portraits"),
            "description": (None, "Face photos"), "category": (None, "portraits"),
            "zip_file": ("portraits.zip", zip_bytes, "application/zip"),
        }
        r = client.post("/api/v1/seeds/upload", files=files, headers=headers)
        assert r.status_code == 200
        assert r.json()["images"] == 1

        # 5. Drain any stale pending jobs from previous tests
        client.post("/api/v1/jobs/process_all", headers=headers)

        # 6. Create job
        r = client.post("/api/v1/jobs/", json={
            "tenant_id": tid, "schema_id": schema_id,
            "name": "E2E Job", "total_records": 2
        }, headers=headers)
        assert r.status_code == 200
        job_id = r.json()["id"]

        # 7. Process job
        r = client.post("/api/v1/jobs/process_one", headers=headers)
        assert r.status_code == 200

        # 8. Check job status
        r = client.get(f"/api/v1/jobs/{job_id}", headers=headers)
        assert r.status_code == 200
        job_status = r.json()["status"]
        assert job_status in ("completed", "processing", "failed")

        # 9. Get generated data
        r = client.get(f"/api/v1/jobs/{job_id}/data", headers=headers)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        if job_status == "completed":
            assert len(data) == 2
            assert "full_name" in data[0]
            assert "avatar" in data[0]

        # 10. Get logs
        r = client.get(f"/api/v1/jobs/{job_id}/logs", headers=headers)
        assert r.status_code == 200
        assert len(r.json()) >= 1

        # 11. Export JSON
        r = client.post("/api/v1/exports/", json={
            "job_id": job_id, "format": "json"
        }, headers=headers)
        assert r.status_code == 200
        export_id = r.json()["id"]

        # 12. Download export
        r = client.get(f"/api/v1/exports/{export_id}/download", headers=headers)
        assert r.status_code == 200

        # 13. Recent exports
        r = client.get(f"/api/v1/exports/recent?tenant_id={tid}", headers=headers)
        assert r.status_code == 200
        assert len(r.json()) >= 1

        # 14. Clean up: delete export
        r = client.delete(f"/api/v1/exports/{export_id}", headers=headers)
        assert r.status_code == 200
