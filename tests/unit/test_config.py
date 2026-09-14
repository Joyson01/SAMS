from backend.app.core.config import Settings


def test_settings_default_values():
    settings = Settings()
    assert ("AttedDEL" in settings.PROJECT_NAME or "SAMS" in settings.PROJECT_NAME)
    assert settings.API_V1_STR == "/api/v1"
    assert settings.ACCESS_TOKEN_EXPIRE_MINUTES > 0
    assert len(settings.BACKEND_CORS_ORIGINS) > 0


def test_settings_env_override():
    settings = Settings(PROJECT_NAME="Custom SAMS Test", DEBUG=False)
    assert settings.PROJECT_NAME == "Custom SAMS Test"
    assert settings.DEBUG is False

