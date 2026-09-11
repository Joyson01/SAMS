import os
from typing import Any, List, Union
from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "JOJIPA-SAMS — Smart Attendance Management System"
    APP_NAME: str = "JOJIPA-SAMS — Smart Attendance Management System"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    @field_validator("DEBUG", mode="before")
    @classmethod
    def parse_debug_flag(cls, v: Any) -> bool:
        if isinstance(v, bool):
            return v
        if isinstance(v, str):
            v_lower = v.strip().lower()
            if v_lower in ("true", "1", "t", "yes", "y", "debug", "dev", "development"):
                return True
            if v_lower in ("false", "0", "f", "no", "n", "release", "prod", "production"):
                return False
        return bool(v)

    # Database Settings
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/sams_db"
    DATABASE_SYNC_URL: str = "postgresql://postgres:postgres@localhost:5432/sams_db"
    DATABASE_FALLBACK_SQLITE: bool = True
    SQLITE_FALLBACK_URL: str = "sqlite+aiosqlite:///./data/sams_dev.db"

    # Security & Tokens
    SECRET_KEY: str = "sams-super-secret-jwt-key-for-development-change-in-production-2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 8  # 8 hours

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        "http://0.0.0.0:5173",
    ]

    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "text"  # 'text' or 'json'

    # Model Configuration
    MODEL_STORAGE_DIR: str = "./ai_engine/models"
    ENROLLMENT_IMAGE_DIR: str = "./data/enrollment_images"
    KNOWN_THRESHOLD: float = 0.65
    REVIEW_THRESHOLD: float = 0.55
    FACE_MATCH_THRESHOLD: float = 0.65
    MIN_FACE_SIZE: int = 40

    # Real-Time Video & Streaming Pipeline Performance Knobs
    RECOGNITION_FPS: float = 5.0
    RECOGNITION_WIDTH: int = 640
    RECOGNITION_HEIGHT: int = 360
    JPEG_QUALITY: int = 80
    MAX_CAMERAS: int = 16
    MAX_WORKERS: int = 4
    FRAME_QUEUE_SIZE: int = 2
    CACHE_TTL_SECONDS: float = 30.0
    ONNX_THREADS: int = 4
    AI_PROVIDER: str = "CPUExecutionProvider"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="allow",
    )


settings = Settings()
