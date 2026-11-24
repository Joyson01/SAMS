import pytest


@pytest.mark.asyncio
async def test_auth_and_audit_api_workflow(staff_client):
    client = staff_client
    # 1. Register User
    reg_payload = {
        "username": "dean_admin",
        "email": "dean@campus.edu",
        "password": "SecurePassword#2026",
        "full_name": "Dean Dr. Alok Gupta",
        "role": "ADMIN",
    }
    public_attempt = await client.post("/api/v1/auth/register", json={**reg_payload, "username": "public_student", "email": "public@campus.edu"}, headers={"Authorization": ""})
    assert public_attempt.status_code == 201
    assert public_attempt.json()["role"] == "STUDENT"

    reg_resp = await client.post("/api/v1/auth/register", json=reg_payload)
    assert reg_resp.status_code == 201
    user_data = reg_resp.json()
    assert user_data["username"] == "dean_admin"
    assert user_data["role"] == "ADMIN"

    # 2. Duplicate registration conflict
    dup_resp = await client.post("/api/v1/auth/register", json=reg_payload)
    assert dup_resp.status_code == 409

    # 3. Login
    login_payload = {
        "username_or_email": "dean_admin",
        "password": "SecurePassword#2026",
    }
    user_agent = "Mozilla/5.0 (Windows NT 10.0) Chrome/131.0"
    failed = await client.post("/api/v1/auth/login", json={**login_payload, "password": "incorrect"},
                               headers={"User-Agent": user_agent})
    assert failed.status_code == 401
    login_resp = await client.post("/api/v1/auth/login", json=login_payload,
                                   headers={"User-Agent": user_agent, "CF-Connecting-IP": "192.0.2.8"})
    assert login_resp.status_code == 200
    assert login_resp.headers["Cache-Control"] == "no-store"
    token_data = login_resp.json()
    assert "access_token" in token_data
    token = token_data["access_token"]

    # 4. Get Current User Profile with Bearer Token
    me_resp = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    assert me_resp.json()["username"] == "dean_admin"

    # 5. Query Audit Logs endpoint
    audit_resp = await client.get("/api/v1/audit-logs", headers={"Authorization": f"Bearer {token}"})
    assert audit_resp.status_code == 200
    audit_data = audit_resp.json()
    assert "total_count" in audit_data
    assert "items" in audit_data


    access = {"Authorization": f"Bearer {token}"}
    security_logs = await client.get("/api/v1/audit-logs?sign_in_activity=true", headers=access)
    assert security_logs.status_code == 200
    assert security_logs.headers["Cache-Control"] == "no-store"
    items = {item["action"]: item for item in security_logs.json()["items"] if item["username"] == "dean_admin"}
    assert set(items) == {"SIGN_IN", "SIGN_IN_FAILED"}
    assert all(item["ip_address"] == "127.0.0.1" and item["user_agent"] == user_agent for item in items.values())
    assert all(item["new_values"] is None for item in items.values())
