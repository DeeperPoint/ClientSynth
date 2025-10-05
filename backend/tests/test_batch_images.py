import io
import zipfile
from PIL import Image


def make_zip_with_two_images() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w") as zf:
        # image1.png (10x10)
        im1 = Image.new("RGB", (10, 10), color=(0, 0, 255))
        b1 = io.BytesIO(); im1.save(b1, format="PNG"); b1.seek(0)
        zf.writestr("a/image1.png", b1.getvalue())
        # image2.png (12x12)
        im2 = Image.new("RGB", (12, 12), color=(255, 0, 0))
        b2 = io.BytesIO(); im2.save(b2, format="PNG"); b2.seek(0)
        zf.writestr("b/image2.png", b2.getvalue())
    return buf.getvalue()


def test_batch_generate_end_to_end(client):
    # 1) Register -> token
    r = client.post("/api/v1/auth/register", json={"email": "docuser@example.com", "password": "Passw0rd!"})
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2) Create tenant via API
    r2 = client.post("/api/v1/tenants/", json={"name": "DocTenant", "slug": "doc-tenant"}, headers=headers)
    assert r2.status_code == 200, r2.text
    tenant_id = r2.json()["id"]

    # 3) Upload seed with two images
    zip_bytes = make_zip_with_two_images()
    files = {
        "tenant_id": (None, tenant_id),
        "name": (None, "Profile Seed"),
        "description": (None, "test"),
        "category": (None, "doc"),
        "zip_file": ("images.zip", zip_bytes, "application/zip"),
    }
    r3 = client.post("/api/v1/seeds/upload", files=files, headers=headers)
    assert r3.status_code == 200, r3.text
    seed_id = r3.json()["id"]
    assert r3.json()["images"] == 2

    # 4) Batch generate: total 5 outputs, repeat each image twice
    body = {
        "tenant_id": tenant_id,
        "seed_id": seed_id,
        "total_outputs": 5,
        "repeat_per_image": 2,
        "prompt": "Generate professional portrait",
        "style": "professional",
        "job_id": "doc-job",
    }
    r4 = client.post("/api/v1/images/batch_generate", json=body, headers=headers)
    assert r4.status_code == 200, r4.text
    outputs = r4.json()
    assert len(outputs) == 5
    # All outputs should have file:// URLs and dimensions from provider
    for o in outputs:
        assert o["url"].startswith("file://")
        assert o["w"] > 0 and o["h"] > 0
