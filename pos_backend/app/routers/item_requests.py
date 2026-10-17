"""Clients' requests to add, change or delete items, decided by an admin."""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app import live
from app.auth import get_current_admin
from app.database import get_db
from app.models import Admin, Item, ItemRequest, utcnow
from app.serializers import request_out

router = APIRouter(
    prefix="/api/admin/item-requests",
    tags=["item-requests"],
    dependencies=[Depends(get_current_admin)],
)


class DecisionIn(BaseModel):
    note: str = Field(default="", max_length=300)
    # Approving an add or edit sets the item's tax treatment at the same time.
    # Left out, a new item takes the client's defaults and an edited item
    # keeps what it has.
    tax_rate: float | None = Field(default=None, ge=0, le=100)
    pct_code: str | None = Field(default=None, max_length=8)
    third_schedule: bool | None = None

    @field_validator("pct_code")
    @classmethod
    def _strip(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


@router.get("")
def list_requests(
    status: Literal["pending", "approved", "rejected", "withdrawn", ""] = "pending",
    client_id: int | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(ItemRequest)
    if status:
        query = query.filter(ItemRequest.status == status)
    if client_id is not None:
        query = query.filter(ItemRequest.client_id == client_id)
    # Oldest pending first: the queue is worked through in order.
    order = ItemRequest.created_at.asc() if status == "pending" else ItemRequest.created_at.desc()
    return [request_out(r, with_client=True) for r in query.order_by(order).limit(500).all()]


def _pending(db: Session, request_id: int) -> ItemRequest:
    req = db.get(ItemRequest, request_id)
    if not req:
        raise HTTPException(404, "Request not found")
    if req.status != "pending":
        raise HTTPException(409, f"This request has already been {req.status}")
    return req


def _decide(req: ItemRequest, status: str, admin: Admin, note: str) -> None:
    req.status = status
    req.admin_note = note.strip()
    req.decided_at = utcnow()
    req.decided_by = admin.email


@router.post("/{request_id}/approve")
def approve(
    request_id: int,
    body: DecisionIn = DecisionIn(),
    db: Session = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    """Applies the request. The client's computer picks it up at its next sync."""
    req = _pending(db, request_id)
    client = req.client
    if req.action == "add":
        existing = next((i for i in client.items if i.code == req.code), None)
        if existing is not None and not existing.is_deleted:
            _decide(req, "rejected", admin, f'An item with the code "{req.code}" already exists.')
            db.commit()
            raise HTTPException(409, "An item with this code exists now, so the request was closed")
        # A deleted item with this code comes back, keeping its tax settings;
        # a brand-new one starts with the client's defaults.
        item = existing or Item(
            code=req.code,
            tax_rate=client.default_tax_rate,
            pct_code=client.default_pct_code,
        )
        if existing is None:
            client.items.append(item)
        item.name = req.name
        item.price = req.price
        item.is_deleted = False
        db.flush()
        req.item_id = item.id
    else:
        item = req.item
        if item is None or item.is_deleted:
            _decide(req, "rejected", admin, "This item no longer exists.")
            db.commit()
            raise HTTPException(409, "The item no longer exists, so the request was closed")
        if req.action == "delete":
            item.is_deleted = True
        else:
            item.name = req.name
            item.price = req.price
    if req.action != "delete":
        # The admin's values win; without them, the client's suggestion.
        tax_rate = body.tax_rate if body.tax_rate is not None else req.proposed_tax_rate
        pct_code = body.pct_code if body.pct_code is not None else req.proposed_pct_code
        if tax_rate is not None:
            item.tax_rate = tax_rate
        if pct_code is not None:
            item.pct_code = pct_code
        if body.third_schedule is not None:
            item.third_schedule = body.third_schedule
    _decide(req, "approved", admin, body.note)
    db.commit()
    live.publish(req.client_id)
    return request_out(req, with_client=True)


@router.post("/{request_id}/reject")
def reject(
    request_id: int,
    body: DecisionIn = DecisionIn(),
    db: Session = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    req = _pending(db, request_id)
    _decide(req, "rejected", admin, body.note)
    db.commit()
    live.publish(req.client_id)
    return request_out(req, with_client=True)
