import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import FbrSettings, User

router = APIRouter(prefix="/api/settings", tags=["settings"])

MAX_STRNS = 50


def parse_strns(raw: str | None) -> list[dict]:
    """The stored strns JSON as a list of {"business_name", "strn"} dicts,
    tolerating a null / malformed column."""
    try:
        value = json.loads(raw or "[]")
    except (TypeError, ValueError):
        return []
    if not isinstance(value, list):
        return []
    return [
        {"business_name": str(e.get("business_name", "")), "strn": str(e.get("strn", ""))}
        for e in value
        if isinstance(e, dict)
    ]


def get_or_create_fbr_settings(db: Session, user: User) -> FbrSettings:
    fbr = db.query(FbrSettings).filter(FbrSettings.user_id == user.id).first()
    if not fbr:
        fbr = FbrSettings(user_id=user.id)
        db.add(fbr)
        db.commit()
    return fbr


def _mask(token: str) -> str | None:
    # Last 4 chars only — enough to visually confirm it's the right token
    # without re-exposing a live FBR credential through our API.
    return f"••••••••{token[-4:]}" if token else None


def fbr_settings_out(fbr: FbrSettings) -> dict:
    return {
        "fbr_env": fbr.fbr_env,
        "has_sandbox_token": bool(fbr.sandbox_token),
        "sandbox_token_preview": _mask(fbr.sandbox_token),
        "has_production_token": bool(fbr.production_token),
        "production_token_preview": _mask(fbr.production_token),
        "can_submit_production": fbr.can_submit_production,
        "seller_ntn_cnic": fbr.seller_ntn_cnic,
        "seller_ntn": fbr.seller_ntn,
        "seller_business_name": fbr.seller_business_name,
        "seller_province": fbr.seller_province,
        "seller_address": fbr.seller_address,
        "default_scenario": fbr.default_scenario,
        "strns": parse_strns(fbr.strns),
    }


class StrnEntry(BaseModel):
    business_name: str = ""
    strn: str = ""


class FbrSettingsRequest(BaseModel):
    fbr_env: str = "mock"
    # Empty string keeps the already-saved token (so it is never echoed back).
    sandbox_token: str = ""
    production_token: str = ""
    can_submit_production: bool = False
    seller_ntn_cnic: str = ""
    seller_ntn: str = ""
    seller_business_name: str = ""
    seller_province: str = "Sindh"
    seller_address: str = ""
    default_scenario: str = "SN001"
    # None = leave the saved STRNs untouched; [] = clear them.
    strns: list[StrnEntry] | None = None


def apply_fbr_settings(fbr: FbrSettings, body: FbrSettingsRequest) -> None:
    if body.fbr_env in ("mock", "sandbox", "production"):
        fbr.fbr_env = body.fbr_env
    if body.sandbox_token:
        fbr.sandbox_token = body.sandbox_token.strip()
    if body.production_token:
        fbr.production_token = body.production_token.strip()
    fbr.can_submit_production = bool(body.can_submit_production)
    fbr.seller_ntn_cnic = body.seller_ntn_cnic.strip()
    fbr.seller_ntn = body.seller_ntn.strip()
    fbr.seller_business_name = body.seller_business_name.strip()
    fbr.seller_province = body.seller_province
    fbr.seller_address = body.seller_address.strip()
    fbr.default_scenario = body.default_scenario
    if body.strns is not None:
        cleaned = [
            {"business_name": e.business_name.strip(), "strn": e.strn.strip()}
            for e in body.strns
            if e.business_name.strip() and e.strn.strip()
        ]
        fbr.strns = json.dumps(cleaned[:MAX_STRNS])


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
