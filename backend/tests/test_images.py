from app.core.security import create_access_token
from app.models.identity import User, Tenant, UserTenantRole
from app.models.seeds import Seed, SeedImage


def auth_header_for(user_id: str):
    token = create_access_token(user_id)
    return {"Authorization": f"Bearer {token}"}


def test_generate_from_seed_image(client, db_session):
    u = User(email="img@example.com", password_hash="x")
    t = Tenant(name="ImgTenant", slug="img-tenant")
    db_session.add_all([u, t])
    db_session.commit()
    db_session.refresh(u)
    db_session.refresh(t)
    db_session.add(UserTenantRole(user_id=u.id, tenant_id=t.id, role="owner"))
    db_session.commit()

    seed = Seed(tenant_id=t.id, name="S", upload_status="completed", created_by=u.id)
    db_session.add(seed)
    db_session.commit()
    db_session.refresh(seed)

    img = SeedImage(
        seed_id=seed.id,
        tenant_id=t.id,
        filename="a.png",
        s3_key="local://a",
        s3_url="local://a",
        file_size=10,
        content_type="image/png",
        width=32,
        height=32,
    )
    db_session.add(img)
    db_session.commit()
    db_session.refresh(img)

    headers = auth_header_for(u.id)
    body = {
        "tenant_id": t.id,
        "job_id": "job1",
        "record_id": "0",
        "field_name": "avatar",
        "seed_id": seed.id,
        "seed_image_id": img.id,
        "prompt": "Test",
        "style": "professional",
    }
    r = client.post("/api/v1/images/generate", json=body, headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["url"].startswith("file://")
    assert data["w"] == 32 and data["h"] == 32

