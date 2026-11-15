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
    public_attempt = await client.post("/api/v1/auth/register", json=reg_payload, headers={"Authorization": ""})
    assert public_attempt.status_code == 403

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
    login_resp = await client.post("/api/v1/auth/login", json=login_payload)
    assert login_resp.status_code == 200
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

