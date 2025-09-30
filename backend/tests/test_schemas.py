from app.core.security import create_access_token
from app.models.identity import User, Tenant, UserTenantRole


def auth_header_for(user_id: str):
    token = create_access_token(user_id)
    return {"Authorization": f"Bearer {token}"}


def test_schema_crud_flow(client, db_session):
    # Seed a user and tenant
    u = User(email="creator@example.com", password_hash="x")
    t = Tenant(name="ACME", slug="acme")
    db_session.add_all([u, t])
    db_session.commit()
    db_session.refresh(u)
    db_session.refresh(t)

    utr = UserTenantRole(user_id=u.id, tenant_id=t.id, role="owner")
    db_session.add(utr)
    db_session.commit()

    headers = auth_header_for(u.id)

    # Create schema
    schema_body = {
        "tenant_id": t.id,
        "name": "Customer",
        "description": "Customer profile",
        "schema_definition": {"fields": [{"name": "first_name", "type": "text"}]},
    }
    r = client.post("/api/v1/schemas/", json=schema_body, headers=headers)
    assert r.status_code == 200, r.text
    schema = r.json()
    assert schema["name"] == "Customer"

    # List schemas
    r2 = client.get(f"/api/v1/schemas/?tenant_id={t.id}", headers=headers)
    assert r2.status_code == 200
    items = r2.json()
    assert len(items) == 1
    assert items[0]["id"] == schema["id"]

    # Get schema by id
    r3 = client.get(f"/api/v1/schemas/{schema['id']}", headers=headers)
    assert r3.status_code == 200
    assert r3.json()["id"] == schema["id"]

