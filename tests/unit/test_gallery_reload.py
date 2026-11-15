import numpy as np
from ai_engine.recognition.vector_matcher import EnrolledTemplate, VectorMatcher

def test_reload_between_scoring_and_lookup_keeps_identity(monkeypatch):
    a=np.zeros(512,dtype=np.float32);a[0]=1
    b=np.zeros(512,dtype=np.float32);b[1]=1
    def template(name,embedding):return EnrolledTemplate(name,name,name,name,name,embedding,1,'FRONT')
    matcher=VectorMatcher();matcher.build_index([template('Alice',a)])
    matmul=np.matmul
    def reload_after_score(*args,**kwargs):
        result=matmul(*args,**kwargs)
        matcher.build_index([template('Bob',b)])
        return result
    monkeypatch.setattr(np,'matmul',reload_after_score)
    decision,best,_,_=matcher.match(a)
    assert best.student_id=='Alice'
    assert best.similarity==1
