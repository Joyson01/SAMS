import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any, Dict
from backend.app.core.config import settings


class StructuredJsonFormatter(logging.Formatter):
    """Formats log records as structured JSON."""

    def format(self, record: logging.LogRecord) -> str:
        log_obj: Dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "line": record.lineno,
        }
        if record.exc_info:
            log_obj["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_obj)


def setup_logging() -> None:
    """Configures structured application logging."""
    log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)

    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)

    # Remove existing handlers to avoid duplicate logs
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(log_level)

    if settings.LOG_FORMAT.lower() == "json":
        formatter = StructuredJsonFormatter()
    else:
        formatter = logging.Formatter(
            fmt="%(asctime)s [%(levelname)s] [%(name)s:%(lineno)d] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )

    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    # Set specific third-party library log levels
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING if not settings.DEBUG else logging.INFO)


logger = logging.getLogger("sams")

