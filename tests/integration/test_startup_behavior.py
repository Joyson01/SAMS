import pytest
from sqlalchemy import select,func
from backend.app.models.entities import User
from backend.app.core.config import settings

@pytest.mark.asyncio
async def test_development_seed_only_when_empty(test_db_session,monkeypatch):
    import scripts.create_admin as setup
    from contextlib import asynccontextmanager
    @asynccontextmanager
    async def session():
        try:
            yield test_db_session
        finally:
            await test_db_session.rollback()
    async def no_schema(): pass
    monkeypatch.setattr(setup,'AsyncSessionLocal',session)
    monkeypatch.setattr(setup,'init_db_schema',no_schema)
    monkeypatch.setattr(settings,'ENVIRONMENT','production')
    await setup.seed_development_admin()
    assert await test_db_session.scalar(select(func.count(User.id)))==0
    await test_db_session.rollback()
    monkeypatch.setattr(settings,'ENVIRONMENT','development')
    await setup.seed_development_admin()
    await setup.seed_development_admin()
    assert await test_db_session.scalar(select(func.count(User.id)))==1
    user=await test_db_session.scalar(select(User))
    assert user.username=='admin'

@pytest.mark.asyncio
async def test_model_failure_does_not_abort_startup(monkeypatch):
    import backend.app.main as main
    from backend.app.services import recognition_service as rec
    monkeypatch.setattr(rec,'_pipeline_instance',None)
    monkeypatch.setattr(main.face_recognition_service,'_app',None)
    def unavailable(): raise RuntimeError('missing models')
    monkeypatch.setattr(main.face_recognition_service,'_initialize_engine',unavailable)
    async def db_unavailable(): return False,'test-offline',0
    monkeypatch.setattr(main,'check_database_connection',db_unavailable)
    async with main.lifespan(main.app):
        assert rec._pipeline_instance is None

@pytest.mark.asyncio
async def test_development_default_cannot_login_in_production(client,test_db_session,monkeypatch):
    from backend.app.core.security import hash_password
    test_db_session.add(User(username='admin',email='admin@example.com',full_name='Dev Admin',role='ADMIN',password_hash=hash_password('Admin@12345')))
    await test_db_session.commit()
    monkeypatch.setattr(settings,'ENVIRONMENT','production')
    r=await client.post('/api/v1/auth/login',json={'username_or_email':'admin','password':'Admin@12345'})
    assert r.status_code==403
