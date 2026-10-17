"""A client's backed-up invoices, for the admin portal. Read-only: invoices
are only ever written by the client's computer."""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session, selectinload

from app.auth import get_current_admin
from app.database import get_db
from app.invoices import invoice_out
from app.models import Client, Invoice, utcnow
from app.serializers import PKT_OFFSET, iso

router = APIRouter(
    prefix="/api/admin/clients/{client_id}/invoices",
    tags=["invoices"],
    dependencies=[Depends(get_current_admin)],
)

RETURN = 3


def _client(db: Session, client_id: int) -> Client:
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(404, "Client not found")
    return client


def _summary(db: Session, client: Client) -> dict:
    today = (utcnow() + PKT_OFFSET).strftime("%Y-%m-%d")
    signed = case((Invoice.invoice_type == RETURN, -Invoice.total_bill), else_=Invoice.total_bill)
    mine = Invoice.client_id == client.id
    today_row = (
        db.query(
            func.count(case((Invoice.invoice_type != RETURN, 1))),
            func.count(case((Invoice.invoice_type == RETURN, 1))),
            func.coalesce(func.sum(signed), 0),
        )
        .filter(mine, Invoice.status == "fiscalized", Invoice.created_at.like(f"{today}%"))
        .one()
    )
    by_status = dict(
        db.query(Invoice.status, func.count()).filter(mine).group_by(Invoice.status).all()
    )
    return {
        "total": sum(by_status.values()),
        "by_status": by_status,
        "today": {"sales": today_row[0], "returns": today_row[1], "net": float(today_row[2])},
        "last_invoice_at": db.query(func.max(Invoice.created_at)).filter(mine).scalar(),
        "last_backup_at": iso(client.last_backup_at),
        # Sequence numbers handed out on the computers vs invoices received.
        "usin_seq": client.usin_seq,
    }


@router.get("")
def list_invoices(
    client_id: int,
    status: Literal["", "queued", "fiscalized", "failed", "unconfirmed"] = "",
    search: str = Query("", max_length=100),
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=200),
    db: Session = Depends(get_db),
):
    client = _client(db, client_id)
    query = db.query(Invoice).filter(Invoice.client_id == client.id)
    if status:
        query = query.filter(Invoice.status == status)
    if search.strip():
        like = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Invoice.usin.ilike(like),
                Invoice.fbr_invoice_number.ilike(like),
                Invoice.buyer_name.ilike(like),
            )
        )
    total = query.count()
    rows = query.order_by(Invoice.created_at.desc(), Invoice.id.desc()).offset(offset).limit(limit).all()
    return {
        "rows": [invoice_out(r, full=False) for r in rows],
        "total": total,
        "summary": _summary(db, client),
    }


@router.get("/{invoice_id}")
def get_invoice(client_id: int, invoice_id: int, db: Session = Depends(get_db)):
    invoice = (
        db.query(Invoice)
        .options(selectinload(Invoice.lines))
        .filter(Invoice.client_id == client_id, Invoice.id == invoice_id)
        .first()
    )
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    return invoice_out(invoice)
