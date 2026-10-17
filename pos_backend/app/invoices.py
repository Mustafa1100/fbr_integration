"""The server's copy of each client's invoices: stored from the desktop's
uploads, sent back to a replacement computer, and shown in the portal."""

from typing import Literal

from pydantic import BaseModel, Field, ValidationError, field_validator
from sqlalchemy.orm import Session

from app.models import Client, Invoice, InvoiceLine

# Invoice times as the desktop writes them: "2026-10-15 03:08:36".
_TIME = r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$"
# Statuses a computer reports. "fiscalized" is final: FBR's component gave
# the invoice a number, so nothing may turn it back into something else.
FINAL = "fiscalized"


class LineIn(BaseModel):
    item_code: str = Field(max_length=50)
    item_name: str = Field(max_length=150)
    pct_code: str = Field(default="", max_length=8)
    quantity: float = 0
    unit_price: float = 0
    tax_rate: float = 0
    sale_value: float = 0
    discount: float = 0
    further_tax: float = 0
    tax_charged: float = 0
    total_amount: float = 0
    invoice_type: int = 1


class InvoiceIn(BaseModel):
    usin: str = Field(min_length=1, max_length=50)
    ref_usin: str = Field(default="", max_length=50)
    invoice_type: int = 1
    created_at: str = Field(pattern=_TIME)
    buyer_name: str = Field(default="", max_length=150)
    buyer_ntn: str = Field(default="", max_length=20)
    buyer_cnic: str = Field(default="", max_length=20)
    buyer_phone: str = Field(default="", max_length=30)
    payment_mode: int = 1
    total_quantity: float = 0
    total_sale_value: float = 0
    total_tax: float = 0
    total_discount: float = 0
    total_further_tax: float = 0
    total_bill: float = 0
    status: Literal["queued", "fiscalized", "failed", "unconfirmed"]
    fbr_invoice_number: str = Field(default="", max_length=100)
    fbr_code: str = Field(default="", max_length=10)
    fbr_response: str = ""
    fiscalized_at: str = Field(default="", max_length=19)
    pos_id: str = Field(default="", max_length=20)
    mode: str = Field(default="", max_length=10)
    environment: str = Field(default="", max_length=10)
    attempts: int = 0
    last_error: str = ""
    items: list[LineIn] = Field(default_factory=list, max_length=500)

    @field_validator("fbr_response", "last_error")
    @classmethod
    def _trim(cls, value: str) -> str:
        return value[:4000]


INVOICE_FIELDS = [f for f in InvoiceIn.model_fields if f != "items"]
LINE_FIELDS = list(LineIn.model_fields)


def store_uploads(db: Session, client: Client, uploads: list[dict]) -> tuple[list[str], list[dict]]:
    """Saves the invoices a computer sent. Sending the same invoice again is
    harmless. One bad invoice never blocks the rest: it is reported back and
    skipped. Returns (saved USINs, errors)."""
    saved: list[str] = []
    errors: list[dict] = []
    parsed: dict[str, InvoiceIn] = {}
    for raw in uploads:
        try:
            invoice = InvoiceIn.model_validate(raw)
        except ValidationError as err:
            usin = raw.get("usin") if isinstance(raw, dict) else None
            errors.append({"usin": str(usin or ""), "error": err.errors()[0]["msg"]})
            continue
        parsed[invoice.usin] = invoice  # the later copy in one batch wins
    if not parsed:
        return saved, errors

    existing = {
        inv.usin: inv
        for inv in db.query(Invoice).filter(
            Invoice.client_id == client.id, Invoice.usin.in_(list(parsed))
        )
    }
    for usin, incoming in parsed.items():
        row = existing.get(usin)
        if row is not None and row.status == FINAL and incoming.status != FINAL:
            # An older copy arriving late, or a second computer that never
            # heard back from FBR's component: keep the accepted invoice.
            saved.append(usin)
            continue
        if row is None:
            row = Invoice(client_id=client.id, usin=usin)
            db.add(row)
        for field in INVOICE_FIELDS:
            setattr(row, field, getattr(incoming, field))
        row.lines = [
            InvoiceLine(**{f: getattr(line, f) for f in LINE_FIELDS}) for line in incoming.items
        ]
        saved.append(usin)
    return saved, errors


def invoice_out(invoice: Invoice, full: bool = True) -> dict:
    """full: with the lines and FBR's raw reply (restore, detail view);
    otherwise a light row for lists."""
    out = {field: getattr(invoice, field) for field in INVOICE_FIELDS}
    out["id"] = invoice.id
    if full:
        out["items"] = [{f: getattr(line, f) for f in LINE_FIELDS} for line in invoice.lines]
    else:
        del out["fbr_response"]
    return out
