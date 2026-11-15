from datetime import timedelta
import pytest
from fastapi import HTTPException

from backend.app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_password_hashing_and_verification():
    plain = "SAMS@SecurePassword2026!"
    hashed = hash_password(plain)

    assert hashed != plain
    assert hashed.startswith("$2b$") or hashed.startswith("$2a$")
    assert verify_password(plain, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False


def test_jwt_creation_and_decoding():
    payload = {"sub": "user-uuid-12345", "username": "prof_sharma", "role": "FACULTY"}
    token = create_access_token(data=payload, expires_delta=timedelta(minutes=15))

    decoded = decode_access_token(token)
    assert decoded["sub"] == "user-uuid-12345"
    assert decoded["username"] == "prof_sharma"
    assert decoded["role"] == "FACULTY"
    assert "exp" in decoded


def test_jwt_expired_token_raises_401():
    payload = {"sub": "user-uuid-12345", "username": "prof_sharma", "role": "FACULTY"}
    # Token that expired 5 minutes ago
    expired_token = create_access_token(data=payload, expires_delta=timedelta(minutes=-5))

    with pytest.raises(HTTPException) as exc:
        decode_access_token(expired_token)
    assert exc.value.status_code == 401
    assert "expired" in exc.value.detail.lower()

