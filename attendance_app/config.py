import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    teacher_pin: str
    session_secret: str

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(Path(os.getenv("APP_DATA_DIR", "data")), os.getenv("TEACHER_PIN", "1234"), os.getenv("SESSION_SECRET", "development-secret-change-me-123"))
