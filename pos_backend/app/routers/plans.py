from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_current_admin
from app.database import get_db
from app.models import Plan
from app.serializers import plan_out

router = APIRouter(
    prefix="/api/admin/plans", tags=["plans"], dependencies=[Depends(get_current_admin)]
)


class PlanIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    price: float = Field(ge=0)


@router.get("")
def list_plans(db: Session = Depends(get_db)):
    return [plan_out(p) for p in db.query(Plan).order_by(Plan.months).all()]


@router.put("/{plan_id}")
def update_plan(plan_id: int, body: PlanIn, db: Session = Depends(get_db)):
    plan = db.get(Plan, plan_id)
    if not plan:
        raise HTTPException(404, "Plan not found")
    plan.name = body.name.strip()
    plan.price = body.price
    db.commit()
    return plan_out(plan)
