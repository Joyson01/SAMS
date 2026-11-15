from dataclasses import dataclass
import numpy as np
from .types import DetectedFace

@dataclass
class GalleryEntry: student_id: int; embedding: np.ndarray
@dataclass
class MatchProposal: student_id: int|None; confidence: float; box: tuple[int,int,int,int]

def match_faces(faces:list[DetectedFace], gallery:list[GalleryEntry], threshold:float=.55)->list[MatchProposal]:
    out=[]
    for face in faces:
        scores=[float(np.dot(face.embedding/np.linalg.norm(face.embedding),g.embedding/np.linalg.norm(g.embedding))) for g in gallery]
        i=int(np.argmax(scores)) if scores else -1; score=scores[i] if scores else 0.0
        out.append(MatchProposal(gallery[i].student_id if score>=threshold else None,score,face.box))
    best={}
    for i,p in enumerate(out):
        if p.student_id is not None and (p.student_id not in best or p.confidence>out[best[p.student_id]].confidence): best[p.student_id]=i
    for i,p in enumerate(out):
        if p.student_id is not None and best[p.student_id]!=i: out[i]=MatchProposal(None,p.confidence,p.box)
    return out
