import json

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import or_
from sqlalchemy.orm import Query, Session

from app.auth import get_current_user, require_password_already_set
from app.database import get_db
from app.fbr.client import error_text, is_valid
from app.models import Invoice, User
from app.pagination import paginate
from app.routers.settings import get_or_create_fbr_settings
from app.services import invoice_service
from app.services.qr import qr_data_uri

router = APIRouter(prefix="/api/invoices", tags=["invoices"])

INVOICE_STATUSES = {"draft", "submitted", "failed"}


def summary_out(inv: Invoice) -> dict:
    return {
        "id": inv.id,
        "pos_invoice_no": inv.pos_invoice_no,
        "invoice_type": inv.invoice_type,
        "invoice_date": inv.invoice_date.isoformat(),
        "buyer_name": inv.buyer_name,
        "scenario_id": inv.scenario_id,
        "status": inv.status,
        "fbr_invoice_number": inv.fbr_invoice_number,
        "total_excl": round(inv.total_excl, 2),
        "total_tax": round(inv.total_tax, 2),
        "grand_total": round(inv.grand_total, 2),
        "upload_id": inv.upload_id,
    }


def _get_owned(db: Session, user: User, invoice_id: int) -> Invoice:
    inv = db.get(Invoice, invoice_id)
    if not inv or inv.user_id != user.id or inv.is_deleted:
        raise HTTPException(404, "Invoice not found")
    return inv


def query_invoices(
    db: Session,
    user_id: int,
    upload_id: int | None = None,
    status: str | None = None,
    q: str | None = None,
) -> Query:
    """Shared filter logic for a user's invoices — used by both this
    router's own /api/invoices and the admin per-user read-only view."""
    query = db.query(Invoice).filter(
        Invoice.user_id == user_id, Invoice.is_deleted.is_(False)
    )
    if upload_id is not None:
        query = query.filter(Invoice.upload_id == upload_id)
    if status:
        if status not in INVOICE_STATUSES:
            raise HTTPException(
                400, f"status must be one of: {', '.join(sorted(INVOICE_STATUSES))}"
            )
        query = query.filter(Invoice.status == status)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(
                Invoice.pos_invoice_no.ilike(like),
                Invoice.buyer_name.ilike(like),
                Invoice.fbr_invoice_number.ilike(like),
            )
        )
    return query.order_by(Invoice.id.desc())


@router.get("")
def list_invoices(
    response: Response,
    upload_id: int | None = None,
    status: str | None = None,
    q: str | None = None,
    page: int = 1,
    page_size: int = 1000,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = query_invoices(db, user.id, upload_id=upload_id, status=status, q=q)
    invoices = paginate(query, response, page, page_size)
    return [summary_out(i) for i in invoices]


def detail_out(inv: Invoice, fbr) -> dict:
    fbr_response = json.loads(inv.fbr_response) if inv.fbr_response else None
    return {
        **summary_out(inv),
        "invoice_ref_no": inv.invoice_ref_no,
        "buyer_ntn_cnic": inv.buyer_ntn_cnic,
        "buyer_province": inv.buyer_province,
        "buyer_address": inv.buyer_address,
        "buyer_registration_type": inv.buyer_registration_type,
        "fbr_dated": inv.fbr_dated,
        "seller": {
            "ntn_cnic": fbr.seller_ntn_cnic,
            "business_name": fbr.seller_business_name,
            "province": fbr.seller_province,
            "address": fbr.seller_address,
        },
        "items": [
            {
                "product_description": it.product_description,
                "hs_code": it.hs_code,
                "rate": it.rate,
                "uom": it.uom,
                "quantity": it.quantity,
                "unit_price": it.unit_price,
                "value_excl_st": round(it.value_excl_st, 2),
                "sales_tax": round(it.sales_tax, 2),
                "total_value": round(it.total_value, 2),
                # Only meaningful (>0) for 3rd Schedule Goods — the receipt
                # uses this as the real pricing basis instead of
                # value_excl_st, which can hold a negligible FBR-workaround
                # placeholder (see csv_processor.py) rather than a real value.
                "fixed_notified_value": round(it.fixed_notified_value, 2),
            }
            for it in inv.items
        ],
        "payload": invoice_service.build_payload(inv, fbr),
        "fbr_response": fbr_response,
        "fbr_error": error_text(fbr_response)
        if fbr_response and not is_valid(fbr_response)
        else None,
        "qr": qr_data_uri(inv.fbr_invoice_number) if inv.fbr_invoice_number else None,
    }


@router.get("/{invoice_id}")
def invoice_detail(
    invoice_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    inv = _get_owned(db, user, invoice_id)
    fbr = get_or_create_fbr_settings(db, user)
    return detail_out(inv, fbr)


@router.post("/{invoice_id}/submit")
def submit_invoice(
    invoice_id: int,
    user: User = Depends(require_password_already_set),
    db: Session = Depends(get_db),
):
    """Submit (or retry) a draft/failed invoice to FBR."""
    inv = _get_owned(db, user, invoice_id)
    if inv.status == "submitted":
        raise HTTPException(400, "Invoice already submitted to FBR")
    fbr = get_or_create_fbr_settings(db, user)
    invoice_service.submit(db, inv, fbr)
    return summary_out(inv)


@router.delete("/{invoice_id}")
def delete_invoice(
    invoice_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Soft delete — kept in the DB with is_deleted=True (no real deletion)."""
    inv = _get_owned(db, user, invoice_id)
    if inv.status == "submitted":
        raise HTTPException(400, "Submitted invoices are an FBR record — cannot delete")
    inv.is_deleted = True
    db.commit()
    return {"ok": True}
