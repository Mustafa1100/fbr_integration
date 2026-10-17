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
from app.models import Admin, Client

_PBKDF2_ITERATIONS = 200_000
_bearer = HTTPBearer(auto_error=False)

# Generated passwords skip look-alike characters (0/O, 1/l/I) because they
# are read off the portal and typed into the desktop app by hand.
_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"
_LOWER = "abcdefghijkmnopqrstuvwxyz"
_DIGITS = "23456789"
_SYMBOLS = "@#$%&*+-=?"
GENERATED_PASSWORD_LENGTH = 16


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


# Checked when the account doesn't exist, so a wrong username costs the same
# time as a wrong password and doesn't reveal which usernames are real.
_DUMMY_HASH = hash_password(secrets.token_hex(16))


def check_credentials(password: str, stored: str | None) -> bool:
    return verify_password(password, stored or _DUMMY_HASH) and stored is not None


def generate_password() -> str:
    """16 random characters with at least one of each class."""
    rng = secrets.SystemRandom()
    chars = [rng.choice(pool) for pool in (_UPPER, _LOWER, _DIGITS, _SYMBOLS)]
    everything = _UPPER + _LOWER + _DIGITS + _SYMBOLS
    chars += [rng.choice(everything) for _ in range(GENERATED_PASSWORD_LENGTH - len(chars))]
    rng.shuffle(chars)
    return "".join(chars)


def _token(subject: int, kind: str, token_version: int, lifetime: timedelta) -> str:
    payload = {
        "sub": str(subject),
        "typ": kind,
        "tv": token_version,
        "exp": datetime.now(timezone.utc) + lifetime,
    }
    return jwt.encode(payload, get_settings().jwt_secret, algorithm="HS256")


def create_admin_token(admin: Admin) -> str:
    hours = get_settings().admin_token_hours
    return _token(admin.id, "admin", admin.token_version, timedelta(hours=hours))


def create_client_token(client: Client) -> str:
    days = get_settings().device_token_days
    return _token(client.id, "client", client.token_version, timedelta(days=days))


def _decode(credentials: HTTPAuthorizationCredentials | None, kind: str) -> dict:
    if credentials is None:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(
            credentials.credentials, get_settings().jwt_secret, algorithms=["HS256"]
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Session expired — sign in again")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    # A desktop token must never open the admin portal, and vice versa.
    if payload.get("typ") != kind:
        raise HTTPException(401, "Invalid token")
    return payload


def get_current_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Admin:
    payload = _decode(credentials, "admin")
    admin = db.get(Admin, int(payload["sub"]))
    if not admin or not admin.is_active or payload.get("tv") != admin.token_version:
        raise HTTPException(401, "Session is no longer valid — sign in again")
    return admin


def get_current_client(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Client:
    payload = _decode(credentials, "client")
    client = db.get(Client, int(payload["sub"]))
    if not client or payload.get("tv") != client.token_version:
        raise HTTPException(401, "This login is no longer valid — sign in again")
    if not client.is_active:
        raise HTTPException(403, "This account has been deactivated. Contact your provider.")
    return client
