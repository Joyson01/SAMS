import json
import logging
from backend.app.core.logging import StructuredJsonFormatter


def test_structured_json_formatter():
    formatter = StructuredJsonFormatter()
    record = logging.LogRecord(
        name="test_logger",
        level=logging.INFO,
        pathname="test.py",
        lineno=42,
        msg="Test logging message: %s",
        args=("sample",),
        exc_info=None,
    )
    formatted = formatter.format(record)
    parsed = json.loads(formatted)

    assert parsed["level"] == "INFO"
    assert parsed["logger"] == "test_logger"
    assert "Test logging message: sample" in parsed["message"]
    assert "timestamp" in parsed

