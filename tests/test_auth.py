from fastapi.testclient import TestClient

from attendance_app.main import create_app


def test_home_requires_pin_and_login_unlocks_it(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("APP_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("TEACHER_PIN", "2468")
    monkeypatch.setenv("SESSION_SECRET", "x" * 32)
    client = TestClient(create_app())
    assert client.get("/", follow_redirects=False).status_code == 303
    assert client.post("/login", data={"pin": "bad"}).status_code == 401
    assert client.post("/login", data={"pin": "2468"}, follow_redirects=False).status_code == 303
    assert client.get("/").status_code == 200
