from datetime import date
from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from .models import User, UsageLog


def get_usage_today(db: Session, user_id: int) -> int:
    """Nombre de générations effectuées aujourd'hui par l'utilisateur."""
    return (
        db.query(func.count(UsageLog.id))
        .filter(
            UsageLog.user_id == user_id,
            UsageLog.log_date == date.today(),
            UsageLog.action.in_([
                "writing_generate", "fill_generate",
                "reading_generate", "flashcards_generate",
                "writing_correct",
            ]),
        )
        .scalar()
        or 0
    )


def check_quota(db: Session, user: User) -> None:
    """Lève une 429 si le quota journalier est atteint."""
    used = get_usage_today(db, user.id)
    if used >= user.daily_quota:
        raise HTTPException(
            status_code=429,
            detail=f"Quota journalier atteint ({user.daily_quota} générations/jour). "
                   f"Réessaie demain ou contacte un administrateur.",
        )


def log_usage(
    db: Session,
    user_id: int,
    action: str,
    tokens_used: int = 0,
    extra: str | None = None,
) -> None:
    """Enregistre une utilisation en base."""
    entry = UsageLog(
        user_id=user_id,
        action=action,
        tokens_used=tokens_used,
        log_date=date.today(),
        extra=extra,
    )
    db.add(entry)
    db.commit()


def quota_status(db: Session, user: User) -> dict:
    used = get_usage_today(db, user.id)
    return {
        "used_today": used,
        "daily_quota": user.daily_quota,
        "remaining": max(0, user.daily_quota - used),
        "reset_at": "minuit (UTC)",
    }
