from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..models import User, UsageLog
from ..schemas import UserAdminOut, UpdateQuota, UsageLogOut
from ..auth import require_admin
from ..quota import get_usage_today

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/users", response_model=list[UserAdminOut])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    users = db.query(User).order_by(User.created_at.desc()).all()
    result = []
    for u in users:
        out = UserAdminOut.model_validate(u)
        out.usage_today = get_usage_today(db, u.id)
        result.append(out)
    return result


@router.patch("/users/{user_id}/quota", response_model=UserAdminOut)
def update_quota(
    user_id: int,
    payload: UpdateQuota,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Utilisateur introuvable")
    user.daily_quota = payload.daily_quota
    db.commit()
    db.refresh(user)
    out = UserAdminOut.model_validate(user)
    out.usage_today = get_usage_today(db, user.id)
    return out


@router.patch("/users/{user_id}/toggle-active", response_model=UserAdminOut)
def toggle_active(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if user_id == admin.id:
        raise HTTPException(400, "Impossible de désactiver son propre compte")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Utilisateur introuvable")
    user.is_active = not user.is_active
    db.commit()
    db.refresh(user)
    out = UserAdminOut.model_validate(user)
    out.usage_today = get_usage_today(db, user.id)
    return out


@router.get("/users/{user_id}/logs", response_model=list[UsageLogOut])
def user_logs(
    user_id: int,
    limit: int = 50,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return (
        db.query(UsageLog)
        .filter(UsageLog.user_id == user_id)
        .order_by(UsageLog.created_at.desc())
        .limit(limit)
        .all()
    )


@router.get("/stats")
def global_stats(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    total_users = db.query(func.count(User.id)).scalar()
    active_users = db.query(func.count(User.id)).filter(User.is_active == True).scalar()
    total_calls = db.query(func.count(UsageLog.id)).scalar()
    calls_today = (
        db.query(func.count(UsageLog.id))
        .filter(UsageLog.log_date == date.today())
        .scalar()
    )
    tokens_today = (
        db.query(func.coalesce(func.sum(UsageLog.tokens_used), 0))
        .filter(UsageLog.log_date == date.today())
        .scalar()
    )
    by_action = (
        db.query(UsageLog.action, func.count(UsageLog.id))
        .group_by(UsageLog.action)
        .all()
    )
    return {
        "total_users": total_users,
        "active_users": active_users,
        "total_calls": total_calls,
        "calls_today": calls_today,
        "tokens_today": tokens_today,
        "by_action": {a: c for a, c in by_action},
    }
