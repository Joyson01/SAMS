import numpy as np
from attendance_app.recognition.matching import GalleryEntry, match_faces
from attendance_app.recognition.types import DetectedFace

def test_low_confidence_is_unknown_and_duplicate_keeps_best() -> None:
    gallery=[GalleryEntry(1,np.array([1,0],dtype=np.float32))]
    faces=[DetectedFace((0,0,1,1),np.array([.9,.1],dtype=np.float32),1),DetectedFace((2,2,3,3),np.array([.8,.2],dtype=np.float32),1),DetectedFace((4,4,5,5),np.array([0,1],dtype=np.float32),1)]
    result=match_faces(faces,gallery,.7)
    assert [x.student_id for x in result].count(1)==1
    assert [x.student_id for x in result].count(None)==2
