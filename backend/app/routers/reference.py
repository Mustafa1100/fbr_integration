from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.fbr import reference
from app.fbr.scenarios import (
    BUSINESS_ACTIVITIES,
    SCENARIOS,
    SECTORS,
    applicable_scenarios,
)
from app.models import User
from app.routers.settings import get_or_create_fbr_settings

router = APIRouter(prefix="/api/reference", tags=["reference"])


@router.get("/provinces")
def provinces(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return reference.provinces(get_or_create_fbr_settings(db, user))


@router.get("/uoms")
def uoms(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return reference.uoms(get_or_create_fbr_settings(db, user))


@router.get("/hs-codes")
def hs_codes(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return reference.hs_codes(get_or_create_fbr_settings(db, user))


@router.get("/sale-types")
def sale_types(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return reference.sale_types(get_or_create_fbr_settings(db, user))


@router.get("/scenarios")
def scenarios():
    return [{"code": c, "description": d} for c, d in SCENARIOS.items()]


@router.get("/applicable-scenarios")
def applicable(activity: str, sector: str):
    """Scenarios a business must pass in sandbox, per PRAL spec v1.12 §10."""
    codes = applicable_scenarios(activity, sector)
    return {
        "activity": activity,
        "sector": sector,
        "scenarios": [
            {"code": c, "description": SCENARIOS.get(c, "")} for c in codes
        ],
    }


@router.get("/business-activities")
def business_activities():
    return {"activities": BUSINESS_ACTIVITIES, "sectors": SECTORS}
