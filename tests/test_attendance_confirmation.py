from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from attendance_app.models import Base, Classroom, Student, AttendanceRecord
from attendance_app.services.attendance import confirm_attendance

def test_confirmation_records_every_active_student() -> None:
    e=create_engine("sqlite://"); Base.metadata.create_all(e)
    with Session(e) as db:
        c=Classroom(name="A"); db.add(c); db.flush(); db.add_all([Student(classroom_id=c.id,name="A",roll_number="1"),Student(classroom_id=c.id,name="B",roll_number="2")]); db.commit()
        confirm_attendance(db,c.id,"Math",{1},{1:.9})
        assert [r.status for r in db.scalars(select(AttendanceRecord).order_by(AttendanceRecord.student_id))]==["present","absent"]
