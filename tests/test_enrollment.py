import numpy as np
import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from attendance_app.models import Base, Classroom, FaceEmbedding
from attendance_app.recognition.types import DetectedFace
from attendance_app.services.students import enroll_student

class FakeEngine:
    def analyze(self, image): return [DetectedFace((0,0,10,10), np.array([1,0], dtype=np.float32), 0.9)]

def test_enrollment_requires_three_photos_and_stores_embeddings() -> None:
    engine=create_engine("sqlite://"); Base.metadata.create_all(engine)
    with Session(engine) as db:
        room=Classroom(name="A"); db.add(room); db.commit()
        with pytest.raises(ValueError): enroll_student(db, FakeEngine(), room.id, "Ana", "1", [b"a"])
        student=enroll_student(db, FakeEngine(), room.id, "Ana", "1", [b"a",b"b",b"c"])
        assert student.name == "Ana"
        assert len(db.scalars(select(FaceEmbedding)).all()) == 3
