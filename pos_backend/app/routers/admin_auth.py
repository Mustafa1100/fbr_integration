from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import check_credentials, create_admin_token, get_current_admin
from app.config import get_settings
from app.database import get_db
from app.models import Admin

router = APIRouter(prefix="/api/admin", tags=["admin-auth"])


class LoginIn(BaseModel):
    email: str
    password: str


def _profile(admin: Admin) -> dict:
    return {
        "email": admin.email,
        "full_name": admin.full_name,
        # Shown next to the username field when creating a client.
        "username_domain": get_settings().username_domain,
    }


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    admin = db.query(Admin).filter(Admin.email == body.email.strip().lower()).first()
    if not check_credentials(body.password, admin.password_hash if admin else None):
        raise HTTPException(401, "Invalid email or password")
    if not admin.is_active:
        raise HTTPException(403, "This admin account is deactivated")
    return {"token": create_admin_token(admin), **_profile(admin)}


@router.get("/me")
def me(admin: Admin = Depends(get_current_admin)):
    return _profile(admin)
