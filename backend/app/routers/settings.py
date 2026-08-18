from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import FbrSettings, User

router = APIRouter(prefix="/api/settings", tags=["settings"])


def get_or_create_fbr_settings(db: Session, user: User) -> FbrSettings:
    fbr = db.query(FbrSettings).filter(FbrSettings.user_id == user.id).first()
    if not fbr:
        fbr = FbrSettings(user_id=user.id)
        db.add(fbr)
        db.commit()
    return fbr


def fbr_settings_out(fbr: FbrSettings) -> dict:
    return {
        "fbr_env": fbr.fbr_env,
        "has_token": bool(fbr.fbr_token),
        # Last 4 chars only — enough to visually confirm it's the right
        # token without re-exposing a live FBR credential through our API.
        "token_preview": f"••••••••{fbr.fbr_token[-4:]}" if fbr.fbr_token else None,
        "seller_ntn_cnic": fbr.seller_ntn_cnic,
        "seller_business_name": fbr.seller_business_name,
        "seller_province": fbr.seller_province,
        "seller_address": fbr.seller_address,
        "default_scenario": fbr.default_scenario,
    }


class FbrSettingsRequest(BaseModel):
    fbr_env: str = "mock"
    # Empty string keeps the already-saved token (so it is never echoed back).
    fbr_token: str = ""
    seller_ntn_cnic: str = ""
    seller_business_name: str = ""
    seller_province: str = "Sindh"
    seller_address: str = ""
    default_scenario: str = "SN001"


def apply_fbr_settings(fbr: FbrSettings, body: FbrSettingsRequest) -> None:
    if body.fbr_env in ("mock", "sandbox", "production"):
        fbr.fbr_env = body.fbr_env
    if body.fbr_token:
        fbr.fbr_token = body.fbr_token.strip()
    fbr.seller_ntn_cnic = body.seller_ntn_cnic.strip()
    fbr.seller_business_name = body.seller_business_name.strip()
    fbr.seller_province = body.seller_province
    fbr.seller_address = body.seller_address.strip()
    fbr.default_scenario = body.default_scenario


@router.get("/fbr")
def get_fbr_settings(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Read-only for the signed-in user — editing is an admin-only action,
    see PUT /api/admin/users/{id}/fbr-settings."""
    return fbr_settings_out(get_or_create_fbr_settings(db, user))


@router.put("/fbr")
def update_fbr_settings_retired(user: User = Depends(get_current_user)):
    """Retired: users can no longer set their own FBR/PRAL credentials —
    an administrator manages every account's environment, token, and seller
    profile from the Admin Dashboard. Still requires auth so an unauthenticated
    caller gets a 401 (via get_current_user) rather than this 403."""
    raise HTTPException(
        403, "Only an administrator can update FBR settings for your account."
    )
