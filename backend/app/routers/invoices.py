import csv
import io
import json
import re
from typing import Any
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Query, Session

from app.auth import get_current_user, require_password_already_set
from app.database import get_db
from app.fbr.client import error_text, is_valid
from app.models import Invoice, Upload, User
from app.pagination import paginate
from app.routers.settings import get_or_create_fbr_settings, parse_strns
from app.services import csv_processor, invoice_service
from app.services.invoice_service import ENV_FILTER_ALIASES, resolve_env_filter
from app.services.qr import qr_data_uri

router = APIRouter(prefix="/api/invoices", tags=["invoices"])

INVOICE_STATUSES = {"draft", "submitted", "failed"}

TEST_ENVS = ("mock", "sandbox")
MAX_BULK_DELETE = 1000
MAX_PRINT_RECEIPTS = 200
MAX_EXPORT_ROWS = 20000
DELETE_DENIED = "Only test invoices, or live invoices that failed, can be deleted."

# Mirrors the frontend's MODE_LABELS — user-facing wording for fbr_env.
ENV_LABELS = {"mock": "Test", "sandbox": "Test", "production": "Live"}


def _user_can_delete(inv: Invoice) -> bool:
    """A test invoice can always go. A live one only if it failed — a live
    invoice FBR accepted is a real tax record and stays admin-only."""
    return inv.fbr_env in TEST_ENVS or inv.status == "failed"


def summary_out(inv: Invoice) -> dict:
    return {
        "id": inv.id,
        "pos_invoice_no": inv.pos_invoice_no,
        "invoice_type": inv.invoice_type,
        "invoice_date": inv.invoice_date.isoformat(),
        "buyer_name": inv.buyer_name,
        "scenario_id": inv.scenario_id,
        "status": inv.status,
        "fbr_env": inv.fbr_env,
        "fbr_invoice_number": inv.fbr_invoice_number,
        "total_excl": round(inv.total_excl, 2),
        "total_tax": round(inv.total_tax, 2),
        "total_discount": round(inv.total_discount, 2),
        "grand_total": round(inv.grand_total, 2),
        "upload_id": inv.upload_id,
        "is_paid": inv.is_paid,
        "paid_at": inv.paid_at.isoformat() if inv.paid_at else None,
        # §236 advance income tax — a receipt figure held on the invoice.
        "advance_tax": round(inv.advance_tax, 2),
        "advance_tax_set": inv.advance_tax_set,
    }


def _submit_result(inv: Invoice, response: dict) -> dict:
    """The invoice summary plus whether a failure was worth retrying: a failure
    that says nothing about the invoice itself (FBR busy / rate-limited /
    unreachable). The batch UI backs off and retries those."""
    return {
        **summary_out(inv),
        "transient": bool(response.get("transient")) and inv.status == "failed",
        "retry_after": response.get("retry_after"),
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
    date_from: date | None = None,
    date_to: date | None = None,
    fbr_env: str | None = None,
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
    if fbr_env and fbr_env != "all":
        if fbr_env not in ENV_FILTER_ALIASES:
            raise HTTPException(
                400, f"fbr_env must be one of: {', '.join(ENV_FILTER_ALIASES)}"
            )
        query = query.filter(Invoice.fbr_env.in_(resolve_env_filter(fbr_env)))
    if date_from is not None:
        query = query.filter(Invoice.invoice_date >= date_from)
    if date_to is not None:
        query = query.filter(Invoice.invoice_date <= date_to)
    if q and q.strip():
        term = q.strip()
        like = f"%{term}%"
        matches = [
            Invoice.pos_invoice_no.ilike(like),
            Invoice.buyer_name.ilike(like),  # customer name
            # Any part of the number, including its start: FBR numbers begin with
            # the seller's own NTN/CNIC ("<seller id>DI<suffix>"), so typing the
            # first digits finds them just like typing the whole number.
            Invoice.fbr_invoice_number.ilike(like),
            Invoice.buyer_ntn_cnic.ilike(like),  # buyer CNIC / NTN
        ]
        # CNIC / NTN numbers are typed with or without dashes and spaces
        # ("12345-1234567-1" vs "1234512345671") and stored however they were
        # uploaded — so also compare with those stripped from both sides.
        compact = re.sub(r"[\s-]", "", term)
        if compact:
            stripped = func.replace(func.replace(Invoice.buyer_ntn_cnic, "-", ""), " ", "")
            matches.append(stripped.ilike(f"%{compact}%"))
        query = query.filter(or_(*matches))
    return query.order_by(Invoice.id.desc())


@router.get("")
def list_invoices(
    response: Response,
    upload_id: int | None = None,
    status: str | None = None,
    q: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    fbr_env: str | None = None,
    page: int = 1,
    page_size: int = 1000,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = query_invoices(
        db,
        user.id,
        upload_id=upload_id,
        status=status,
        q=q,
        date_from=date_from,
        date_to=date_to,
        fbr_env=fbr_env,
    )
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
            "ntn": fbr.seller_ntn,
            "business_name": fbr.seller_business_name,
            "province": fbr.seller_province,
            "address": fbr.seller_address,
            # The owning user's account email — shown as the seller's
            # contact on the receipt, not sent to FBR.
            "email": fbr.user.email,
            # Sales Tax Registration Numbers — receipt display only. One
            # shows automatically; with several the user picks on the view.
            "strns": parse_strns(fbr.strns),
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
                "st_withheld": round(float(it.st_withheld or 0), 2),
                # extra_tax is a Float on the model but predates that on some
                # dev DBs (VARCHAR column, no SQLite migration) — coerce like
                # build_payload already does rather than round() a str.
                "extra_tax": round(float(it.extra_tax or 0), 2),
                "further_tax": round(float(it.further_tax or 0), 2),
                "fed_payable": round(float(it.fed_payable or 0), 2),
                "discount": round(float(it.discount or 0), 2),
                "total_value": round(it.total_values or it.total_value, 2),
                # Only meaningful (>0) for 3rd Schedule Goods — the receipt
                # uses this as the real pricing basis instead of
                # value_excl_st, which can hold a negligible FBR-workaround
                # placeholder (see csv_processor.py) rather than a real value.
                "fixed_notified_value": round(it.fixed_notified_value, 2),
                # Not shown on the receipt — carried so an invoice can be edited.
                "sale_type": it.sale_type,
                "sro_schedule_no": it.sro_schedule_no,
                "sro_item_serial_no": it.sro_item_serial_no,
            }
            for it in inv.items
        ],
        # Preview the payload as it went to (or would go to) this invoice's
        # own environment, not the account's current default.
        "payload": invoice_service.build_payload(
            inv, invoice_service.EffectiveFbr(fbr, inv.fbr_env)
        ),
        "fbr_response": fbr_response,
        "fbr_error": error_text(fbr_response)
        if fbr_response and not is_valid(fbr_response)
        else None,
        "qr": qr_data_uri(inv.fbr_invoice_number) if inv.fbr_invoice_number else None,
    }


@router.get("/receipts")
def receipts_for_printing(
    upload_id: int | None = None,
    q: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    fbr_env: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The full receipts of every *submitted* invoice matching these filters
    (the same ones as the list) — what the "print receipts" page renders, in
    one request instead of one per invoice, so a customer's whole history can
    be printed / saved as a single PDF. Oldest first. Capped at
    MAX_PRINT_RECEIPTS; ``total`` says how many matched so the page can warn
    when it was cut short. Registered before /{invoice_id} on purpose."""
    query = query_invoices(
        db,
        user.id,
        upload_id=upload_id,
        status="submitted",
        q=q,
        date_from=date_from,
        date_to=date_to,
        fbr_env=fbr_env,
    )
    total = query.count()
    # Matches that are NOT printable (failed / draft: no FBR number, no QR), so
    # the page can say why it came up short — or empty.
    not_submitted = (
        query_invoices(
            db,
            user.id,
            upload_id=upload_id,
            q=q,
            date_from=date_from,
            date_to=date_to,
            fbr_env=fbr_env,
        ).count()
        - total
    )
    invoices = (
        query.order_by(None)
        .order_by(Invoice.invoice_date, Invoice.id)
        .limit(MAX_PRINT_RECEIPTS)
        .all()
    )
    fbr = get_or_create_fbr_settings(db, user)
    # A receipt doesn't need the FBR request/response JSON — leave it out, it
    # is by far the heaviest part of an invoice's detail.
    receipts = [
        {k: v for k, v in detail_out(inv, fbr).items() if k not in ("payload", "fbr_response")}
        for inv in invoices
    ]
    return {
        "total": total,
        "not_submitted": not_submitted,
        "limit": MAX_PRINT_RECEIPTS,
        "invoices": receipts,
    }


@router.get("/export")
def export_invoices(
    upload_id: int | None = None,
    status: str | None = None,
    q: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    fbr_env: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The current Invoices History filters as a downloadable CSV (opens
    directly in Excel) — the same rows and columns the table shows, but
    unpaginated. Capped at MAX_EXPORT_ROWS. Registered before /{invoice_id}
    on purpose."""
    query = query_invoices(
        db,
        user.id,
        upload_id=upload_id,
        status=status,
        q=q,
        date_from=date_from,
        date_to=date_to,
        fbr_env=fbr_env,
    )
    invoices = (
        query.order_by(None)
        .order_by(Invoice.invoice_date, Invoice.id)
        .limit(MAX_EXPORT_ROWS)
        .all()
    )

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "FBR Invoice No.",
            "POS No.",
            "Mode",
            "Date",
            "Buyer",
            "Buyer CNIC/NTN",
            "HS Code(s)",
            "Excl. ST",
            "Discount",
            "Sales Tax",
            "Advance Tax",
            "Total",
        ]
    )
    for inv in invoices:
        # Matches the receipt: grand total (item totals) plus advance tax, a
        # separate §236 receipt figure not carried in any item's total_value.
        total = inv.grand_total + inv.advance_tax
        # An invoice can have several product lines, each its own HS code —
        # list every distinct one in appearance order, since a CSV row is
        # per-invoice, not per-line.
        hs_codes = "; ".join(dict.fromkeys(it.hs_code for it in inv.items if it.hs_code))
        writer.writerow(
            [
                inv.fbr_invoice_number or "",
                inv.pos_invoice_no,
                ENV_LABELS.get(inv.fbr_env, inv.fbr_env),
                inv.invoice_date.isoformat(),
                inv.buyer_name,
                inv.buyer_ntn_cnic,
                hs_codes,
                round(inv.total_excl, 2),
                round(inv.total_discount, 2),
                round(inv.total_tax, 2),
                round(inv.advance_tax, 2),
                round(total, 2),
            ]
        )
    # A UTF-8 BOM so Excel (rather than just any CSV reader) renders non-ASCII
    # buyer names correctly instead of mangling them.
    content = "﻿" + buf.getvalue()
    filename = f"invoices_export_{date.today().isoformat()}.csv"
    return PlainTextResponse(
        content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


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
    """Retry a draft/failed invoice — against its own environment, not the
    account's current default."""
    inv = _get_owned(db, user, invoice_id)
    if inv.status == "submitted":
        raise HTTPException(400, "Invoice already submitted to FBR")
    fbr = get_or_create_fbr_settings(db, user)
    response = invoice_service.submit(db, inv, fbr, target_env=inv.fbr_env)
    if inv.upload_id:
        upload = db.get(Upload, inv.upload_id)
        if upload and not upload.is_deleted:
            invoice_service.sync_upload_env(db, upload)
    return _submit_result(inv, response)


class InvoiceEditRequest(BaseModel):
    """The manual-invoice form's data: the invoice-level fields, plus one dict per
    product line — both keyed by the CSV column names, so it goes through the
    same validation and calculations as an uploaded row."""

    header: dict[str, Any]
    items: list[dict[str, Any]]


def _cell(value: Any) -> str:
    return "" if value is None else str(value).strip()


@router.put("/{invoice_id}")
def edit_invoice(
    invoice_id: int,
    body: InvoiceEditRequest,
    user: User = Depends(require_password_already_set),
    db: Session = Depends(get_db),
):
    """Fix a failed (or unsubmitted) invoice in place: replace its buyer details
    and product lines, recomputing every amount exactly as the CSV upload does.
    It does not resubmit — the invoice stays failed until POST /{id}/submit, so
    the old FBR error isn't mistaken for the new result. The FBR environment,
    status and upload link are left alone."""
    inv = _get_owned(db, user, invoice_id)
    if inv.status == "submitted":
        raise HTTPException(400, "A submitted invoice can't be edited.")
    if not body.items:
        raise HTTPException(400, "Add at least one product.")

    # The same row shape a CSV upload produces: every line repeats the invoice
    # fields. Only known columns are taken; the required ones default to blank
    # so a missing value reads "'hs_code' is required", not a missing-column error.
    known = set(csv_processor.ALL_COLUMNS)
    rows = []
    for item in body.items:
        row = {c: "" for c in csv_processor.REQUIRED_COLUMNS}
        row.update({k: _cell(v) for k, v in {**body.header, **item}.items() if k in known})
        rows.append(row)
    try:
        rows = csv_processor.validate_rows(rows)
    except csv_processor.CsvError as exc:
        # The validator words this for files ("Row 2"); here it is a product line.
        raise HTTPException(400, str(exc).replace("Row ", "Product ", 1))

    fbr = get_or_create_fbr_settings(db, user)
    csv_processor.rewrite_invoice(inv, rows, fbr)
    db.commit()
    return detail_out(inv, fbr)


@router.post("/{invoice_id}/promote")
def promote_invoice(
    invoice_id: int,
    user: User = Depends(require_password_already_set),
    db: Session = Depends(get_db),
):
    """Promote a sandbox-tested invoice to FBR production — re-submits the
    same record to production and flips its fbr_env. Requires the account's
    production capability + token, and a clean sandbox submission first."""
    inv = _get_owned(db, user, invoice_id)
    fbr = get_or_create_fbr_settings(db, user)
    if not fbr.can_submit_production:
        raise HTTPException(
            403, "This account is not enabled to submit to FBR production."
        )
    if not fbr.is_mock and not fbr.production_token:
        raise HTTPException(400, "No production token configured for this account.")
    if inv.fbr_env == "production":
        raise HTTPException(400, "This invoice is already a production invoice.")
    if inv.status != "submitted":
        raise HTTPException(
            400, "Test this invoice in sandbox first — it hasn't been submitted cleanly."
        )
    response = invoice_service.submit(db, inv, fbr, target_env="production")
    if inv.upload_id:
        upload = db.get(Upload, inv.upload_id)
        if upload and not upload.is_deleted:
            invoice_service.sync_upload_env(db, upload)
    return _submit_result(inv, response)


class MarkPaidRequest(BaseModel):
    is_paid: bool


@router.patch("/{invoice_id}/paid")
def mark_invoice_paid(
    invoice_id: int,
    body: MarkPaidRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Track whether the buyer has actually paid — independent of FBR
    submission status. Only meaningful once an invoice is a real,
    FBR-registered record; a draft/failed or test invoice was never issued."""
    inv = _get_owned(db, user, invoice_id)
    if inv.status != "submitted":
        raise HTTPException(400, "Only a submitted invoice can be marked as paid")
    if inv.fbr_env != "production":
        raise HTTPException(
            400, "This is a test invoice — only a live FBR invoice can be marked as paid."
        )
    inv.is_paid = body.is_paid
    inv.paid_at = datetime.now(timezone.utc) if body.is_paid else None
    db.commit()
    return summary_out(inv)


class AdvanceTaxRequest(BaseModel):
    advance_tax: float


@router.patch("/{invoice_id}/advance-tax")
def set_invoice_advance_tax(
    invoice_id: int,
    body: AdvanceTaxRequest,
    user: User = Depends(require_password_already_set),
    db: Session = Depends(get_db),
):
    """One-time back-fill of the §236 advance income tax on an older
    invoice — a receipt figure, set once and not changeable afterwards.
    Invoices created via CSV/manual already carry it from creation."""
    inv = _get_owned(db, user, invoice_id)
    if inv.advance_tax_set:
        raise HTTPException(400, "Advance tax is already set for this invoice.")
    if body.advance_tax < 0:
        raise HTTPException(400, "Advance tax cannot be negative.")
    inv.advance_tax = round(body.advance_tax, 2)
    inv.advance_tax_set = True
    db.commit()
    return summary_out(inv)


def _resync_uploads(db: Session, upload_ids) -> None:
    """Roll deletions back up to the batches they came from, so Submission
    History doesn't keep counting (or offering to retry) invoices that are
    gone."""
    for upload_id in upload_ids:
        upload = db.get(Upload, upload_id)
        if upload and not upload.is_deleted:
            invoice_service.sync_upload_env(db, upload)


@router.delete("/{invoice_id}")
def delete_invoice(
    invoice_id: int,
    user: User = Depends(require_password_already_set),
    db: Session = Depends(get_db),
):
    """Remove one of the user's own invoices from their history (soft
    delete). Test invoices, or live ones that failed — see _user_can_delete."""
    inv = _get_owned(db, user, invoice_id)
    if not _user_can_delete(inv):
        raise HTTPException(403, DELETE_DENIED)
    inv.is_deleted = True
    db.commit()
    _resync_uploads(db, {inv.upload_id} if inv.upload_id else set())
    return {"ok": True}


class BulkDeleteRequest(BaseModel):
    ids: list[int]


@router.post("/bulk-delete")
def bulk_delete_invoices(
    body: BulkDeleteRequest,
    user: User = Depends(require_password_already_set),
    db: Session = Depends(get_db),
):
    """Delete several of the user's own invoices at once — the same rules as
    the single delete (soft delete; test invoices, or live ones that failed).
    An id that can't be deleted (an accepted live invoice, or one that isn't
    theirs / is already gone) is skipped and reported; the rest still go
    through."""
    ids = list(dict.fromkeys(body.ids))  # de-duplicate, keep order
    if not ids:
        raise HTTPException(400, "Select at least one invoice to delete.")
    if len(ids) > MAX_BULK_DELETE:
        raise HTTPException(
            400, f"You can delete at most {MAX_BULK_DELETE} invoices at a time."
        )

    owned = {
        inv.id: inv
        for inv in db.query(Invoice).filter(
            Invoice.id.in_(ids),
            Invoice.user_id == user.id,
            Invoice.is_deleted.is_(False),
        )
    }
    deleted, skipped, upload_ids = [], [], set()
    for invoice_id in ids:
        inv = owned.get(invoice_id)
        if inv is None:
            skipped.append({"id": invoice_id, "reason": "Invoice not found."})
        elif not _user_can_delete(inv):
            skipped.append({"id": invoice_id, "reason": DELETE_DENIED})
        else:
            inv.is_deleted = True
            deleted.append(invoice_id)
            if inv.upload_id:
                upload_ids.add(inv.upload_id)
    db.commit()
    _resync_uploads(db, upload_ids)
    return {"deleted": deleted, "skipped": skipped}
