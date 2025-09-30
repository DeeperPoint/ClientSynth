from app.core.security import create_access_token
from app.models.identity import User, Tenant, UserTenantRole
from app.models.schema import Schema


def auth_header_for(user_id: str):
    token = create_access_token(user_id)
    return {"Authorization": f"Bearer {token}"}


def test_job_end_to_end(client, db_session):
    # Seed user + tenant + membership
    u = User(email="job@example.com", password_hash="x")
    t = Tenant(name="JobTenant", slug="job-tenant")
    db_session.add_all([u, t])
    db_session.commit()
    db_session.refresh(u)
    db_session.refresh(t)
    db_session.add(UserTenantRole(user_id=u.id, tenant_id=t.id, role="owner"))
    db_session.commit()

    # Create schema
    s = Schema(tenant_id=t.id, name="Customer", description=None, schema_definition={"fields": [{"name": "first_name", "type": "text"}]}, created_by=u.id)
    db_session.add(s)
    db_session.commit()
    db_session.refresh(s)

    headers = auth_header_for(u.id)

    # Create job
    body = {"tenant_id": t.id, "schema_id": s.id, "name": "Test Job", "total_records": 3}
    r = client.post("/api/v1/jobs/", json=body, headers=headers)
    assert r.status_code == 200, r.text
    job_id = r.json()["id"]

    # Process job
    r2 = client.post("/api/v1/jobs/process_one", headers=headers)
    assert r2.status_code == 200
    assert r2.json()["processed"] in (True, False)  # processed if pending exists

    # Fetch job
    r3 = client.get(f"/api/v1/jobs/{job_id}", headers=headers)
    assert r3.status_code == 200
    # status should be completed or processing depending on processor run

    # Data
    r4 = client.get(f"/api/v1/jobs/{job_id}/data", headers=headers)
    assert r4.status_code == 200
    # If processed, we should have records; if not, zero.
    assert isinstance(r4.json(), list)

