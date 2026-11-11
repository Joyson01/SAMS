from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class UserRegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str = Field(..., min_length=2, max_length=128)
    role: str = Field("STUDENT", description="Requested role; elevated roles require an administrator.")

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        valid = {"ADMIN", "FACULTY", "OPERATOR", "STUDENT"}
        normalized = value.upper()
        if normalized not in valid:
            raise ValueError(f"Invalid role. Allowed: {sorted(valid)}")
        return normalized


class UserLoginRequest(BaseModel):
    username_or_email: str
    password: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(..., min_length=1)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    username: str
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in_seconds: int
    user: UserResponse
