from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from attendance_app.models import Base, Classroom, Student


def test_roll_number_is_unique_inside_class() -> None:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        room = Classroom(name="TE-B")
        db.add(room); db.flush()
        db.add_all([Student(classroom_id=room.id, roll_number="1", name="A"), Student(classroom_id=room.id, roll_number="1", name="B")])
        try:
            db.commit()
        except IntegrityError:
            return
    raise AssertionError("duplicate roll number was accepted")
