"""Saved buyers ("Customers") — picked on the single-invoice form to fill the
buyer fields. Only a convenience: invoices keep their own copy of the buyer
details, so editing or deleting a customer never changes an invoice."""

from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_password_already_set
from app.database import get_db
from app.fbr import client as fbr_client
from app.models import Customer, User
from app.pagination import DEFAULT_PAGE_SIZE, paginate
from app.routers.settings import get_or_create_fbr_settings
from app.services import customer_import, grid_upload
from app.services.plans import require_active_plan


router = APIRouter(
    prefix="/api/customers",
    tags=["customers"],
    # An expired plan blocks everything here (see services/plans.py).
    dependencies=[Depends(require_active_plan)],
)

REGISTRATION_TYPES = ("Registered", "Unregistered")


class CustomerRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    ntn_cnic: str = Field("", max_length=20)
    registration_type: str = "Unregistered"
    province: str = Field("", max_length=60)
    address: str = Field("", max_length=300)
    strn: str = Field("", max_length=20)


def customer_out(c: Customer) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "ntn_cnic": c.ntn_cnic or "",
        "registration_type": c.registration_type or "Unregistered",
        "province": c.province or "",
        "address": c.address or "",
        "strn": c.strn or "",
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


def _apply(c: Customer, body: CustomerRequest) -> None:
    if body.registration_type not in REGISTRATION_TYPES:
        raise HTTPException(422, "Registration type must be Registered or Unregistered.")
    name = body.name.strip()
    if not name:
        raise HTTPException(422, "Customer name is required.")
    number = body.ntn_cnic.strip()
    c.name = name
    c.ntn_cnic = number
    c.registration_type = body.registration_type
    c.province = body.province.strip()
    c.address = body.address.strip()
    c.strn = body.strn.strip()


def _check_number(body: CustomerRequest) -> None:
    """NTN / CNIC is numbers only. Names and numbers may repeat: one buyer
    (one NTN / CNIC) can trade under several company names and STRNs, and
    each is saved as its own customer."""
    raw = body.ntn_cnic.strip()
    if raw and not (raw.isascii() and raw.isdigit()):
        raise HTTPException(422, "NTN / CNIC must be numbers only, without dashes or spaces.")


def _get_owned(db: Session, user: User, customer_id: int) -> Customer:
    c = db.get(Customer, customer_id)
    if not c or c.user_id != user.id or c.is_deleted:
        raise HTTPException(404, "Customer not found")
    return c


@router.get("")
def list_customers(
    response: Response,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # The invoice form calls this without page_size and gets everything; the
    # Customers page passes page / page_size.
    query = (
        db.query(Customer)
        .filter(Customer.user_id == user.id, Customer.is_deleted.is_(False))
        .order_by(Customer.name, Customer.id)
    )
    return [customer_out(c) for c in paginate(query, response, page, page_size)]


XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@router.get("/template")
def customers_template(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Excel list for adding many customers at once (Import customers)."""
    fbr = get_or_create_fbr_settings(db, user)
    return Response(
        customer_import.template_xlsx(fbr),
        media_type=XLSX_TYPE,
        headers={"Content-Disposition": "attachment; filename=customers_template.xlsx"},
    )


async def _read_list(file: UploadFile) -> list[list[str]] | None:
    name = (file.filename or "").lower()
    raw = await file.read()
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 5 MB).")
    if name.endswith(".xlsx"):
        return grid_upload.sheet_from_excel(raw)
    if name.endswith(".csv"):
        try:
            return grid_upload.sheet_from_csv(raw.decode("utf-8-sig"))
        except UnicodeDecodeError:
            raise HTTPException(400, "The CSV file must be UTF-8 encoded. Saving it as Excel (.xlsx) also works.")
    raise HTTPException(400, "Please choose a .xlsx or .csv file (download the template).")


def _check_out(result: dict) -> dict:
    return {"ok": result["ok"], "errors": result["errors"], "summary": result["summary"]}


@router.post("/import/check")
async def check_import(
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Check a customer list without saving anything."""
    sheet = await _read_list(file)
    fbr = get_or_create_fbr_settings(db, user)
    return _check_out(customer_import.check(db, user, fbr, sheet))


@router.post("/import")
async def import_customers(
    file: UploadFile,
    user: User = Depends(require_password_already_set),
    db: Session = Depends(get_db),
):
    """Save every customer in the list — or none, if any row has a problem
    (the list is checked again here, so nothing half-saves)."""
    sheet = await _read_list(file)
    fbr = get_or_create_fbr_settings(db, user)
    result = customer_import.check(db, user, fbr, sheet)
    if not result["ok"]:
        return {**_check_out(result), "created": 0}
    created = customer_import.save(db, user, result["customers"])
    return {**_check_out(result), "created": created}


@router.get("/registration-type")
def registration_type(
    number: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """FBR's answer for an NTN (7-9 digits) or CNIC (13 digits): "Registered",
    "Unregistered", or null when it couldn't be checked (no working token,
    FBR unreachable, or not a valid number) — the user then picks by hand."""
    digits = "".join(ch for ch in number if ch.isdigit())
    if len(digits) not in (7, 8, 9, 13):
        return {"registration_type": None}
    fbr = get_or_create_fbr_settings(db, user)
    return {"registration_type": fbr_client.lookup_registration_type(digits, fbr)}


@router.post("", status_code=201)
def create_customer(
    body: CustomerRequest,
    user: User = Depends(require_password_already_set),
    db: Session = Depends(get_db),
):
    _check_number(body)
    c = Customer(user_id=user.id)
    _apply(c, body)
    db.add(c)
    db.commit()
    return customer_out(c)


@router.put("/{customer_id}")
def update_customer(
    customer_id: int,
    body: CustomerRequest,
    user: User = Depends(require_password_already_set),
    db: Session = Depends(get_db),
):
    c = _get_owned(db, user, customer_id)
    _check_number(body)
    _apply(c, body)
    db.commit()
    return customer_out(c)


@router.delete("/{customer_id}")
def delete_customer(
    customer_id: int,
    user: User = Depends(require_password_already_set),
    db: Session = Depends(get_db),
):
    # Soft delete, like products.
    c = _get_owned(db, user, customer_id)
    c.is_deleted = True
    db.commit()
    return {"ok": True}
