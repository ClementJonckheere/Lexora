#!/usr/bin/env python3
"""
Script d'initialisation : crée le premier compte admin.
Usage : python create_admin.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal
from app.models import User, UserRole
from app.auth import hash_password
from app.config import get_settings

settings = get_settings()


def main():
    email    = input("Email admin : ").strip()
    username = input("Username   : ").strip()
    password = input("Mot de passe (min 8 car.) : ").strip()

    if len(password) < 8:
        print("❌ Mot de passe trop court.")
        sys.exit(1)

    db = SessionLocal()
    try:
        if db.query(User).filter(User.email == email).first():
            print("❌ Email déjà utilisé.")
            sys.exit(1)

        admin = User(
            email=email,
            username=username,
            hashed_password=hash_password(password),
            role=UserRole.admin,
            daily_quota=settings.admin_daily_quota,
            is_active=True,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)
        print(f"✅ Admin créé : {admin.username} (id={admin.id})")
    finally:
        db.close()


if __name__ == "__main__":
    main()
