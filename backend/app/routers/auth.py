from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.auth import (
    MIN_PASSWORD_LENGTH,
    create_token,
    get_current_user,
    hash_password,
    password_strength,
    verify_password,
)
from app.database import get_db
from app.models import User

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _session_out(user: User) -> dict:
    return {
        "token": create_token(user),
        "role": user.role,
        "full_name": user.full_name,
        "email": user.email,
        "must_change_password": user.must_change_password,
    }


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


@router.post("/login")
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = (
        db.query(User)
        .filter(User.email == body.email.lower(), User.is_deleted.is_(False))
        .first()
    )
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
    if not user.is_active:
        raise HTTPException(403, "Account is deactivated — contact your administrator")
    return _session_out(user)


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "must_change_password": user.must_change_password,
    }


class PasswordStrengthRequest(BaseModel):
    password: str


@router.post("/password-strength")
def check_password_strength(body: PasswordStrengthRequest):
    """Server-side mirror of the frontend's live strength meter — used so
    the meter's judgment of "strong enough" always matches what the set-
    password endpoint will actually accept. POST with a body (not a query
    string) so the candidate password never lands in server/proxy access
    logs or browser history."""
    return password_strength(body.password)


class SetPasswordRequest(BaseModel):
    new_password: str
    confirm_password: str


@router.post("/set-password")
def set_password(
    body: SetPasswordRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Replaces a temporary (admin-issued) password with one the user chose
    themselves. Requires the current session token — proof they successfully
    authenticated with the temp password — not the old password itself."""
    if body.new_password != body.confirm_password:
        raise HTTPException(400, "Passwords do not match")
    if not password_strength(body.new_password)["ok"]:
        raise HTTPException(
            400, f"Password must be at least {MIN_PASSWORD_LENGTH} characters."
        )
    user.password_hash = hash_password(body.new_password)
    user.must_change_password = False
    # Invalidate every token issued before this change (including the one
    # used to make this very request) — the response below mints a fresh one.
    user.token_version += 1
    db.commit()
    return _session_out(user)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str


@router.post("/change-password")
def change_password(
    body: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Self-service password change from the Settings page — unlike
    set-password (proven by token possession alone, for the first-login
    temp-password swap), this requires the current password itself.

    A wrong current_password is a 400, not 401: the caller's bearer token
    is perfectly valid (they *are* authenticated) — 401 is reserved for
    token-level auth failures because the frontend's fetch wrapper treats
    any 401 on an authenticated request as an expired session and force
    logs the user out, which would be wrong here."""
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    if body.new_password != body.confirm_password:
        raise HTTPException(400, "New passwords do not match")
    if not password_strength(body.new_password)["ok"]:
        raise HTTPException(
            400, f"Password must be at least {MIN_PASSWORD_LENGTH} characters."
        )
    user.password_hash = hash_password(body.new_password)
    user.token_version += 1
    db.commit()
    return _session_out(user)
