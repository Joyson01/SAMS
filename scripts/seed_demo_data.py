"""Optional idempotent academic demo data. Never creates embeddings or attendance."""
import asyncio
from sqlalchemy import select
from backend.app.database.session import AsyncSessionLocal, init_db_schema
from backend.app.models.entities import ClassSection, Subject, Student, Batch, ClassSubject

async def seed_records(db):
    cls=await db.scalar(select(ClassSection).where(ClassSection.name=='DEMO-A'))
    if not cls:
        cls=ClassSection(name='DEMO-A',department='Computer Science',year=3,semester=5,section='A')
        db.add(cls)
        await db.flush()
    subject=await db.scalar(select(Subject).where(Subject.code=='DEMO-CS'))
    if not subject:
        subject=Subject(code='DEMO-CS',name='Computer Science Demo',department='Computer Science')
        db.add(subject)
        await db.flush()
    if not await db.scalar(select(ClassSubject).where(ClassSubject.class_id==cls.id,ClassSubject.subject_id==subject.id)):
        db.add(ClassSubject(class_id=cls.id,subject_id=subject.id))
    batch=await db.scalar(select(Batch).where(Batch.class_id==cls.id,Batch.name=='B1'))
    if not batch:
        batch=Batch(class_id=cls.id,name='B1')
        db.add(batch)
        await db.flush()
    for i, name in enumerate(['Aarav','Diya','Kabir'],1):
        code=f'DEMO-{i:03}'
        if not await db.scalar(select(Student).where(Student.student_code==code)):
            db.add(Student(student_code=code,roll_number=code,first_name=name,last_name='Demo',email=f'demo{i}@example.com',department=cls.department,class_name=cls.name,section='A',batch_id=batch.id))
    await db.commit()

async def seed_demo_data():
    await init_db_schema()
    async with AsyncSessionLocal() as db:
        await seed_records(db)
    print('Demo academics ready. No embeddings or attendance were created.')

if __name__=='__main__':
    asyncio.run(seed_demo_data())
