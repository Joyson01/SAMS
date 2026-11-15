from attendance_app.config import Settings

def test_missing_secret_generates_private_persistent_secret(monkeypatch,tmp_path):
    monkeypatch.setenv("APP_DATA_DIR",str(tmp_path)); monkeypatch.delenv("SESSION_SECRET",raising=False)
    first=Settings.from_env().session_secret
    assert len(first) >= 48
    assert Settings.from_env().session_secret == first
    assert (tmp_path/".session-secret").stat().st_mode & 0o077 == 0
