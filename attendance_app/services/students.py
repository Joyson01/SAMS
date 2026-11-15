import numpy as np
from sqlalchemy.orm import Session
from ..models import Student, FaceEmbedding
from ..recognition.types import RecognitionEngine

def enroll_student(db: Session, engine: RecognitionEngine, classroom_id: int, name: str, roll_number: str, images: list[bytes]) -> Student:
    if len(images) != 3: raise ValueError("Exactly three photos are required")
    faces=[]
    for image in images:
        found=engine.analyze(image)
        if len(found)!=1 or found[0].quality < .5: raise ValueError("Each photo must contain one clear face")
        faces.append(found[0])
    if min(float(np.dot(faces[0].embedding, f.embedding)) for f in faces[1:]) < .35: raise ValueError("Photos appear to show different people")
    student=Student(classroom_id=classroom_id,name=name.strip(),roll_number=roll_number.strip()); db.add(student); db.flush()
    for face in faces: db.add(FaceEmbedding(student_id=student.id,vector=face.embedding.astype(np.float32).tobytes(),dimension=len(face.embedding),quality=face.quality))
    db.commit(); return student
