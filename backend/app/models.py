from datetime import datetime, date
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime,
    Date, ForeignKey, Text, Enum as SAEnum
)
from sqlalchemy.orm import relationship, DeclarativeBase
import enum


class Base(DeclarativeBase):
    pass


class UserRole(str, enum.Enum):
    user = "user"
    admin = "admin"


class User(Base):
    __tablename__ = "users"

    id             = Column(Integer, primary_key=True, index=True)
    email          = Column(String(255), unique=True, index=True, nullable=False)
    username       = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role           = Column(SAEnum(UserRole), default=UserRole.user, nullable=False)
    is_active      = Column(Boolean, default=True)
    daily_quota    = Column(Integer, default=50)   # max générations / jour
    created_at     = Column(DateTime, default=datetime.utcnow)

    usage_logs = relationship("UsageLog", back_populates="user", cascade="all, delete-orphan")


class UsageLog(Base):
    __tablename__ = "usage_logs"

    id           = Column(Integer, primary_key=True, index=True)
    user_id      = Column(Integer, ForeignKey("users.id"), nullable=False)
    action       = Column(String(50), nullable=False)   # writing|fill|reading|flashcards|correct_writing
    tokens_used  = Column(Integer, default=0)
    log_date     = Column(Date, default=date.today)
    created_at   = Column(DateTime, default=datetime.utcnow)
    extra        = Column(Text, nullable=True)           # JSON optionnel (thème, niveau…)

    user = relationship("User", back_populates="usage_logs")
