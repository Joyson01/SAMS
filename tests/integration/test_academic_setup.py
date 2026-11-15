import pytest

@pytest.mark.asyncio
async def test_lab_batch_crud(staff_client):
    c=staff_client
    cls=(await c.post('/api/v1/classes',json={'name':'TEST-A','department':'CS'})).json()
    url=f"/api/v1/classes/{cls['id']}/batches"
    r=await c.post(url,json={'name':'B1'})
    assert r.status_code == 201
    bid=r.json()['id']
    assert (await c.post(url,json={'name':'B1'})).status_code == 409
    assert len((await c.get(url)).json()) == 1
    assert (await c.put(f'{url}/{bid}',json={'name':'B2'})).json()['name'] == 'B2'
    assert (await c.delete(f'{url}/{bid}')).status_code == 204

@pytest.mark.asyncio
async def test_demo_seed_idempotent_without_embeddings(test_db_session):
    from scripts.seed_demo_data import seed_records
    from sqlalchemy import select,func
    from backend.app.models.entities import Student, FaceProfile, ClassSection, Subject
    await seed_records(test_db_session)
    first=[await test_db_session.scalar(select(func.count()).select_from(m)) for m in [Student,FaceProfile,ClassSection,Subject]]
    await seed_records(test_db_session)
    assert first == [await test_db_session.scalar(select(func.count()).select_from(m)) for m in [Student,FaceProfile,ClassSection,Subject]]
    assert first[1] == 0

@pytest.mark.asyncio
async def test_mapping_can_be_saved_twice(staff_client):
    c=staff_client
    subject=(await c.post('/api/v1/subjects',json={'code':'MAP101','name':'Mapping','department':'CS'})).json()
    cls=(await c.post('/api/v1/classes',json={'name':'MAP-A','department':'CS','assigned_subject_ids':[subject['id']]})).json()
    r=await c.put(f"/api/v1/classes/{cls['id']}",json={'assigned_subject_ids':[subject['id']]})
    assert r.status_code==200,r.text
    r=await c.put(f"/api/v1/classes/{cls['id']}",json={'assigned_subject_ids':['missing-subject']})
    assert r.status_code==422,r.text
