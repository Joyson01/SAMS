from fastapi.testclient import TestClient
from attendance_app.main import create_app

def test_teacher_can_create_class(monkeypatch,tmp_path) -> None:
    monkeypatch.setenv("APP_DATA_DIR",str(tmp_path)); monkeypatch.setenv("TEACHER_PIN","1234")
    client=TestClient(create_app()); client.post("/login",data={"pin":"1234"})
    response=client.post("/classes",data={"name":"TE-B"},follow_redirects=False)
    assert response.status_code==303
    assert "TE-B" in client.get("/students").text
