import io
import zipfile
from PIL import Image

from app.core.security import create_access_token
from app.models.identity import User, Tenant, UserTenantRole


def auth_header_for(user_id: str):
    token = create_access_token(user_id)
    return {"Authorization": f"Bearer {token}"}


def make_zip_with_image() -> bytes:
    img_bytes = io.BytesIO()
    img = Image.new("RGB", (16, 16), color=(255, 0, 0))
    img.save(img_bytes, format="PNG")
    img_bytes.seek(0)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w") as zf:
        zf.writestr("test.png", img_bytes.getvalue())
    return buf.getvalue()


def test_seed_upload_list_feedback(client, db_session):
    # Seed user+tenant
    u = User(email="seeduser@example.com", password_hash="x")
    t = Tenant(name="SeedTenant", slug="seed-tenant")
    db_session.add_all([u, t])
    db_session.commit()
    db_session.refresh(u)
    db_session.refresh(t)
    db_session.add(UserTenantRole(user_id=u.id, tenant_id=t.id, role="owner"))
    db_session.commit()

    headers = auth_header_for(u.id)

    # Upload seed zip
    data = {
        "tenant_id": (None, t.id),
        "name": (None, "Portraits"),
        "description": (None, "Test"),
        "category": (None, "portrait"),
        "zip_file": ("images.zip", make_zip_with_image(), "application/zip"),
    }
    r = client.post("/api/v1/seeds/upload", files=data, headers=headers)
    assert r.status_code == 200, r.text
    seed_id = r.json()["id"]
    assert r.json()["images"] == 1

    # List seeds
    r2 = client.get(f"/api/v1/seeds/?tenant_id={t.id}", headers=headers)
    assert r2.status_code == 200
    items = r2.json()
    assert any(s["id"] == seed_id for s in items)

    # List images
    r3 = client.get(f"/api/v1/seeds/{seed_id}/images", headers=headers)
    assert r3.status_code == 200
    assert len(r3.json()) == 1

    # Post feedback
    r4 = client.post(f"/api/v1/seeds/{seed_id}/feedback", data={"quality_rating": 5}, headers=headers)
    assert r4.status_code == 200
    assert r4.json()["ok"] is True

