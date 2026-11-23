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


@pytest.mark.asyncio
async def test_class_counts_use_active_department_and_section_roster(staff_client, test_db_session):
    from backend.app.models.entities import Student

    client = staff_client
    subject = (await client.post('/api/v1/subjects', json={
        'code': 'CS10', 'name': 'Algorithms', 'department': 'CS', 'credits': 3,
    })).json()
    section = (await client.post('/api/v1/classes', json={
        'name': 'TE-B', 'department': 'CS', 'section': 'B', 'assigned_subject_ids': [subject['id']],
    })).json()
    for index, (dept, division, status) in enumerate([
        ('CS', 'B', 'ACTIVE'), ('CS', 'A', 'ACTIVE'), ('IT', 'B', 'ACTIVE'), ('CS', 'B', 'INACTIVE'),
    ]):
        test_db_session.add(Student(student_code=str(index), roll_number=str(index), first_name='Test',
                                    last_name=str(index), email=f'{index}@example.com', class_name='TE-B',
                                    department=dept, section=division, status=status))
    await test_db_session.commit()
    detail = (await client.get(f"/api/v1/classes/{section['id']}")).json()
    listing = (await client.get('/api/v1/classes')).json()
    assert listing == [detail]
    assert (detail['student_count'], detail['subject_count'], detail['total_curriculum_credits']) == (1, 1, 3)


@pytest.mark.asyncio
async def test_slot_validation_preserves_saved_timetable(staff_client):
    client = staff_client
    classes = '/api/v1/classes'
    first = (await client.post(classes, json={'name': 'TE-A'})).json()['id']
    second = (await client.post(classes, json={'name': 'TE-B'})).json()['id']
    foreign_batch = (await client.post(f'{classes}/{second}/batches', json={'name': 'B2'})).json()['id']
    path = f'{classes}/{first}/timetable'
    slot = {'class_id': first, 'day_of_week': 'monday', 'start_time': '9:30',
            'end_time': '11:00', 'label': 'Workshop'}
    for changes in ({'batch_id': foreign_batch}, {'subject_id': 'missing'}, {'day_of_week': 'next week'},
                    {'end_time': '09:00'}, {'end_time': '25:00'}):
        assert (await client.post(path, json={**slot, **changes})).status_code == 422
    saved = await client.post(path, json=slot)
    assert saved.status_code == 201, saved.text
    assert saved.json()['start_time'] == '09:30' and saved.json()['day_of_week'] == 'Monday'
    edit = f"{classes}/timetable/entries/{saved.json()['id']}"
    assert (await client.put(edit, json={'start_time': '14:00'})).status_code == 422
    assert (await client.get(path)).json() == [saved.json()]
