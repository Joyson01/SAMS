import pytest


@pytest.mark.asyncio
async def test_hod_is_created_by_admin_and_can_see_only_assigned_department(staff_client):
    client = staff_client
    admin_header = client.headers["Authorization"]

    for name, department in (("CS-A", "Computer Engineering"), ("ME-A", "Mechanical")):
        response = await client.post("/api/v1/classes", json={"name": name, "department": department})
        assert response.status_code == 201, response.text

    payload = {
        "username": "department_head",
        "email": "head@example.com",
        "full_name": "Department Head",
        "password": "Department123",
        "role": "HOD",
    }
    assert (await client.post("/api/v1/auth/users", json=payload)).status_code == 422
    payload["department"] = "Computer Engineering"
    created = await client.post("/api/v1/auth/users", json=payload)
    assert created.status_code == 201, created.text
    assert created.json()["role"] == "HOD"
    assert created.json()["department"] == payload["department"]

    login = await client.post("/api/v1/auth/login", json={
        "username_or_email": payload["username"], "password": payload["password"],
    })
    assert login.status_code == 200, login.text
    client.headers["Authorization"] = f"Bearer {login.json()['access_token']}"

    overview = await client.get("/api/v1/department/overview", params={"department": "Mechanical"})
    assert overview.status_code == 200, overview.text
    assert overview.json() == {
        "department": "Computer Engineering", "classes": 1,
        "active_students": 0, "active_sessions": 0,
    }
    assert (await client.get("/api/v1/classes")).status_code == 403
    assert (await client.post("/api/v1/auth/users", json=payload)).status_code == 403

    client.headers["Authorization"] = admin_header
    assert (await client.get("/api/v1/department/overview")).status_code == 403

    del client.headers["Authorization"]
    public = await client.post("/api/v1/auth/register", json={
        **payload, "username": "public_account", "email": "public@example.com",
    })
    assert public.status_code == 201, public.text
    assert public.json()["role"] == "STUDENT"
    assert public.json()["department"] is None
