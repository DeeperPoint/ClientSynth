def test_register_and_login_flow(client):
    # Register
    payload = {"email": "test@example.com", "password": "Passw0rd!", "full_name": "Test User"}
    r = client.post("/api/v1/auth/register", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "access_token" in data

    # Login
    r2 = client.post("/api/v1/auth/login", data={"username": payload["email"], "password": payload["password"]})
    assert r2.status_code == 200, r2.text
    data2 = r2.json()
    assert "access_token" in data2

