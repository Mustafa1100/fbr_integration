"""JWT auth + password hashing (stdlib PBKDF2 — no extra native deps)."""

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import User

_PBKDF2_ITERATIONS = 200_000
_bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), salt.encode(), _PBKDF2_ITERATIONS
    ).hex()
    return f"{salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, digest = stored.split("$", 1)
    except ValueError:
        return False
    candidate = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), salt.encode(), _PBKDF2_ITERATIONS
    ).hex()
    return hmac.compare_digest(candidate, digest)


def create_token(user: User) -> str:
    settings = get_settings()
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "tv": user.token_version,
        "exp": datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expire_hours),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(
            credentials.credentials, get_settings().jwt_secret, algorithms=["HS256"]
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired — sign in again")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")

    user = db.get(User, int(payload["sub"]))
    if not user or user.is_deleted:
        raise HTTPException(401, "User no longer exists")
    if payload.get("tv") != user.token_version:
        raise HTTPException(401, "Session invalidated by a password change — sign in again")
    if not user.is_active:
        raise HTTPException(403, "Account is deactivated — contact your administrator")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(403, "Admin access required")
    return user


def require_password_already_set(user: User = Depends(get_current_user)) -> User:
    """Blocks real work (submitting invoices, uploading CSVs) until a user
    has replaced their admin-issued temporary password with their own."""
    if user.must_change_password:
        raise HTTPException(
            403,
            "You must set your own password before using the app. "
            "Sign in again to be prompted.",
        )
    return user


# Password strength scoring shared by the server-side check in
# routers/auth.py (never trust the client alone) and mirrored in the
# frontend's live strength meter. A password must hit "strong" to replace a
# temporary one — 8+ chars is a hard floor; the rest raises the score.
def password_strength(password: str) -> dict:
    length_ok = len(password) >= 8
    checks = {
        "length": length_ok,
        "length_12": len(password) >= 12,
        "upper": any(c.isupper() for c in password),
        "lower": any(c.islower() for c in password),
        "digit": any(c.isdigit() for c in password),
        "special": any(not c.isalnum() for c in password),
    }
    score = sum(
        [checks["length_12"], checks["upper"], checks["lower"], checks["digit"], checks["special"]]
    )
    if not length_ok:
        label = "weak"
    elif score <= 1:
        label = "weak"
    elif score <= 3:
        label = "medium"
    else:
        label = "strong"
    return {"label": label, "score": score, "checks": checks}
