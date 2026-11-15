import os
import secrets
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    teacher_pin: str
    session_secret: str

    @classmethod
    def from_env(cls) -> "Settings":
        data_dir=Path(os.getenv("APP_DATA_DIR","data")); data_dir.mkdir(parents=True,exist_ok=True)
        secret_file=data_dir/".session-secret"; secret=os.getenv("SESSION_SECRET")
        if not secret:
            if secret_file.exists(): secret=secret_file.read_text().strip()
            else:
                secret=secrets.token_urlsafe(48); secret_file.write_text(secret); secret_file.chmod(0o600)
        return cls(data_dir,os.getenv("TEACHER_PIN","1234"),secret)
