from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel, EmailStr, field_validator


# ── Auth ─────────────────────────────────────────────────────────────

class UserRegister(BaseModel):
    email: EmailStr
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def username_alphanum(cls, v: str) -> str:
        if not v.replace("_", "").replace("-", "").isalnum():
            raise ValueError("Username: lettres, chiffres, _ et - uniquement")
        if len(v) < 3 or len(v) > 50:
            raise ValueError("Username: 3 à 50 caractères")
        return v

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Mot de passe: 8 caractères minimum")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: Optional[int] = None


class UserOut(BaseModel):
    id: int
    email: str
    username: str
    role: str
    daily_quota: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Quota ─────────────────────────────────────────────────────────────

class QuotaStatus(BaseModel):
    used_today: int
    daily_quota: int
    remaining: int
    reset_at: str   # "midnight"


# ── Generation requests ───────────────────────────────────────────────

class GenerateWritingRequest(BaseModel):
    theme: str
    level: str


class GenerateFillRequest(BaseModel):
    level: str
    theme: str


class GenerateReadingRequest(BaseModel):
    theme: str
    level: str


class GenerateFlashcardsRequest(BaseModel):
    theme: str
    level: str


class CorrectWritingRequest(BaseModel):
    prompt: str
    text: str
    level: str


# ── Admin ─────────────────────────────────────────────────────────────

class UpdateQuota(BaseModel):
    daily_quota: int


class UsageLogOut(BaseModel):
    id: int
    action: str
    tokens_used: int
    log_date: date
    created_at: datetime
    extra: Optional[str]

    model_config = {"from_attributes": True}


class UserAdminOut(UserOut):
    usage_today: int = 0
