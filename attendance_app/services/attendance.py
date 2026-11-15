from datetime import datetime
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..models import Student, Subject, AttendanceSession, AttendanceRecord

def confirm_attendance(db:Session,classroom_id:int,subject_name:str,present:set[int],confidence:dict[int,float])->AttendanceSession:
    subject=db.scalar(select(Subject).where(Subject.name==subject_name))
    if not subject: subject=Subject(name=subject_name); db.add(subject); db.flush()
    session=AttendanceSession(classroom_id=classroom_id,subject_id=subject.id,confirmed_at=datetime.utcnow()); db.add(session); db.flush()
    students=db.scalars(select(Student).where(Student.classroom_id==classroom_id,Student.active.is_(True))).all()
    allowed={s.id for s in students}
    if not present<=allowed: raise ValueError("Student is not in this class")
    for s in students: db.add(AttendanceRecord(attendance_session_id=session.id,student_id=s.id,student_name=s.name,roll_number=s.roll_number,status="present" if s.id in present else "absent",confidence=confidence.get(s.id),manually_adjusted=False))
    db.commit(); return session
