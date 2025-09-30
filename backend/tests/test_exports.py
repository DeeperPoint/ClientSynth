from app.core.security import create_access_token
from app.models.identity import User, Tenant, UserTenantRole
from app.models.schema import Schema
from app.models.jobs import Job, GeneratedData


def auth_header_for(user_id: str):
    token = create_access_token(user_id)
    return {"Authorization": f"Bearer {token}"}


def seed_job_with_data(db_session):
    u = User(email="exp@example.com", password_hash="x")
    t = Tenant(name="ExpTenant", slug="exp-tenant")
    db_session.add_all([u, t])
    db_session.commit()
    db_session.refresh(u)
    db_session.refresh(t)
    db_session.add(UserTenantRole(user_id=u.id, tenant_id=t.id, role="owner"))
    db_session.commit()

    s = Schema(tenant_id=t.id, name="S", description=None, schema_definition={"fields": [{"name": "first_name", "type": "text"}]}, created_by=u.id)
    db_session.add(s)
    db_session.commit()
    db_session.refresh(s)

    j = Job(tenant_id=t.id, schema_id=s.id, name="J", total_records=2, created_by=u.id, status="completed")
    db_session.add(j)
    db_session.commit()
    db_session.refresh(j)

    db_session.add_all([
        GeneratedData(job_id=j.id, tenant_id=t.id, record_index=0, record_data={"first_name": "Alice"}),
        GeneratedData(job_id=j.id, tenant_id=t.id, record_index=1, record_data={"first_name": "Bob"}),
    ])
    db_session.commit()
    return u, t, j


def test_export_json_and_csv(client, db_session):
    u, t, j = seed_job_with_data(db_session)
    headers = auth_header_for(u.id)

    # JSON
    r1 = client.post("/api/v1/exports/", json={"job_id": j.id, "format": "json"}, headers=headers)
    assert r1.status_code == 200
    assert r1.json()["status"] == "completed"

    # CSV
    r2 = client.post("/api/v1/exports/", json={"job_id": j.id, "format": "csv"}, headers=headers)
    assert r2.status_code == 200
    assert r2.json()["status"] == "completed"

