from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, UserRole
from ..schemas import UserRegister, UserLogin, Token, UserOut, QuotaStatus
from ..auth import hash_password, verify_password, create_access_token, get_current_user
from ..quota import quota_status
from ..config import get_settings

router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()


@router.post("/register", response_model=UserOut, status_code=201)
def register(payload: UserRegister, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(400, "Email déjà utilisé")
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(400, "Nom d'utilisateur déjà pris")

    user = User(
        email=payload.email,
        username=payload.username,
        hashed_password=hash_password(payload.password),
        daily_quota=settings.default_daily_quota,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(401, "Email ou mot de passe incorrect")
    if not user.is_active:
        raise HTTPException(403, "Compte désactivé")

    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token)


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/quota", response_model=QuotaStatus)
def my_quota(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return quota_status(db, current_user)


@router.post("/create-first-admin", response_model=UserOut, status_code=201)
def create_first_admin(payload: UserRegister, db: Session = Depends(get_db)):
    """
    Crée le premier compte admin si aucun admin n'existe encore.
    Cette route se désactive automatiquement dès qu'un admin existe.
    """
    existing_admin = db.query(User).filter(User.role == UserRole.admin).first()
    if existing_admin:
        raise HTTPException(403, "Un admin existe déjà. Utilisez /register.")

    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(400, "Email déjà utilisé")

    admin = User(
        email=payload.email,
        username=payload.username,
        hashed_password=hash_password(payload.password),
        role=UserRole.admin,
        daily_quota=settings.admin_daily_quota,
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return admin
