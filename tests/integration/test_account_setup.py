import pytest
from backend.app.core.config import settings

PAYLOAD = dict(username='newuser', email='new@example.com', full_name='New User', password='Secure12345')

@pytest.mark.asyncio
async def test_public_role_is_ignored(client):
    r = await client.post('/api/v1/auth/register', json={**PAYLOAD, 'role': 'ADMIN'})
    assert r.status_code == 201
    assert r.json()['role'] == 'STUDENT'
    assert (await client.post('/api/v1/auth/register', json=PAYLOAD)).status_code == 409

@pytest.mark.asyncio
async def test_password_policy(client):
    for password in ['abcdefgh', '123456789', 'ab12']:
        assert (await client.post('/api/v1/auth/register', json={**PAYLOAD, 'password': password})).status_code == 422

@pytest.mark.asyncio
async def test_bootstrap_and_session_rotation(client, monkeypatch):
    monkeypatch.setattr(settings, 'ENVIRONMENT', 'development')
    r = await client.post('/api/v1/auth/bootstrap-admin', json=PAYLOAD)
    assert r.status_code == 201
    assert r.json()['role'] == 'ADMIN'
    assert (await client.post('/api/v1/auth/bootstrap-admin', json={**PAYLOAD, 'username':'other'})).status_code == 409
    tokens = (await client.post('/api/v1/auth/login', json={'username_or_email':'newuser','password':PAYLOAD['password']})).json()
    rotated = await client.post('/api/v1/auth/refresh', json={'refresh_token':tokens['refresh_token']})
    assert rotated.status_code == 200
    assert (await client.post('/api/v1/auth/refresh', json={'refresh_token':tokens['refresh_token']})).status_code == 401
    headers = {'Authorization':f"Bearer {rotated.json()['access_token']}"}
    assert (await client.post('/api/v1/auth/logout', headers=headers)).status_code == 204
    assert (await client.get('/api/v1/auth/me', headers=headers)).status_code == 401

@pytest.mark.asyncio
async def test_bootstrap_production_requires_token(client, monkeypatch):
    monkeypatch.setattr(settings, 'ENVIRONMENT', 'production')
    monkeypatch.setattr(settings, 'BOOTSTRAP_TOKEN', 'test-setup-secret')
    assert (await client.post('/api/v1/auth/bootstrap-admin', json=PAYLOAD)).status_code == 403
    assert (await client.post('/api/v1/auth/bootstrap-admin', json={**PAYLOAD, 'bootstrap_token':'test-setup-secret'})).status_code == 201

@pytest.mark.asyncio
async def test_admin_user_management(staff_client):
    c = staff_client
    r = await c.post('/api/v1/auth/users', json={**PAYLOAD,'role':'FACULTY'})
    assert r.status_code == 201
    uid = r.json()['id']
    assert (await c.patch(f'/api/v1/auth/users/{uid}', json={'is_active':False})).status_code == 200
    assert (await c.post('/api/v1/auth/login', json={'username_or_email':'newuser','password':PAYLOAD['password']})).status_code == 403

@pytest.mark.asyncio
async def test_student_cannot_read_staff_directory(client):
    await client.post('/api/v1/auth/register',json=PAYLOAD)
    tokens=(await client.post('/api/v1/auth/login',json={'username_or_email':PAYLOAD['username'],'password':PAYLOAD['password']})).json()
    assert (await client.get('/api/v1/students',headers={'Authorization':f"Bearer {tokens['access_token']}"})).status_code == 403

@pytest.mark.asyncio
async def test_password_over_bcrypt_byte_limit_rejected(client):
    r=await client.post('/api/v1/auth/register',json={**PAYLOAD,'password':'a1'+'x'*80})
    assert r.status_code == 422
