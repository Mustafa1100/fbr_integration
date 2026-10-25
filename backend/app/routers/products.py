import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_password_already_set
from app.database import get_db
from app.models import Product, User
from app.pagination import DEFAULT_PAGE_SIZE, paginate
from app.routers.settings import get_or_create_fbr_settings
from app.services import invoice_layout

router = APIRouter(prefix="/api/products", tags=["products"])


class ProductRequest(BaseModel):
    description: str = Field(min_length=1, max_length=300)
    hs_code: str = Field(min_length=1, max_length=20)
    uom: str = Field(min_length=1, max_length=60)
    pack_size: float = Field(gt=0)
    unit_price: float = Field(ge=0)
    rate: str = Field(min_length=1, max_length=20)
    sale_type: str = Field("Goods at standard rate (default)", max_length=100)
    scenario_id: str = Field("", max_length=10)
    fixed_notified_value: float = Field(0.0, ge=0)
    sro_schedule_no: str = Field("", max_length=50)
    sro_item_serial_no: str = Field("", max_length=50)
    # Per pack. None = auto-calculate for sales_tax / total_values.
    sales_tax: float | None = Field(None, ge=0)
    total_values: float | None = Field(None, ge=0)
    discount: float = Field(0.0, ge=0)
    further_tax: float = Field(0.0, ge=0)
    fed_payable: float = Field(0.0, ge=0)
    extra_tax: float = Field(0.0, ge=0)
    st_withheld: float = Field(0.0, ge=0)
    advance_tax: float = Field(0.0, ge=0)
    # Values for the user's custom fields (Settings → Invoice Settings).
    custom_fields: dict[str, Any] = {}
    # Pack pricing (only applied if the admin enabled it for this user).
    pack_name: str = Field("", max_length=30)
    pack_price: float | None = Field(None, ge=0)


CHARGE_FIELDS = (
    "sales_tax",
    "total_values",
    "discount",
    "further_tax",
    "fed_payable",
    "extra_tax",
    "st_withheld",
    "advance_tax",
)


def product_out(p: Product) -> dict:
    return {
        "id": p.id,
        "description": p.description,
        "hs_code": p.hs_code,
        "uom": p.uom,
        "pack_size": p.pack_size,
        "unit_price": p.unit_price,
        "rate": p.rate,
        "sale_type": p.sale_type,
        "scenario_id": p.scenario_id,
        "fixed_notified_value": p.fixed_notified_value,
        "sro_schedule_no": p.sro_schedule_no,
        "sro_item_serial_no": p.sro_item_serial_no,
        **{f: getattr(p, f) for f in CHARGE_FIELDS},
        "custom_fields": invoice_layout.load_values(p.custom_fields),
        "pack_name": p.pack_name or "",
        "pack_price": p.pack_price,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


def _apply(db: Session, user: User, p: Product, body: ProductRequest) -> None:
    fbr = get_or_create_fbr_settings(db, user)
    fields = invoice_layout.layout_for(fbr)["custom_fields"]
    try:
        p.custom_fields = json.dumps(invoice_layout.clean_values(fields, body.custom_fields))
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    p.description = body.description.strip()
    p.hs_code = body.hs_code.strip()
    p.uom = body.uom.strip()
    p.pack_size = body.pack_size
    p.unit_price = body.unit_price
    p.rate = body.rate.strip()
    p.sale_type = body.sale_type.strip() or "Goods at standard rate (default)"
    p.scenario_id = body.scenario_id.strip().upper()
    p.fixed_notified_value = body.fixed_notified_value
    p.sro_schedule_no = body.sro_schedule_no.strip()
    p.sro_item_serial_no = body.sro_item_serial_no.strip()
    for f in CHARGE_FIELDS:
        setattr(p, f, getattr(body, f))
    # Pack pricing only for users an admin enabled it for; otherwise the
    # request's pack fields are ignored and saved ones are left untouched.
    if fbr.pack_pricing:
        p.pack_name = body.pack_name.strip()
        p.pack_price = body.pack_price
        if p.pack_price is not None:
            # The per-UOM unit price follows from the pack price, so the two
            # never disagree (8 dp: exact to the paisa on large quantities).
            p.unit_price = round(p.pack_price / p.pack_size, 8)


def _get_owned(db: Session, user: User, product_id: int) -> Product:
    p = db.get(Product, product_id)
    if not p or p.user_id != user.id or p.is_deleted:
        raise HTTPException(404, "Product not found")
    return p


@router.get("")
def list_products(
    response: Response,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # The invoice form's product dropdown calls this without page_size and
    # gets everything; the Products page passes page / page_size.
    query = (
        db.query(Product)
        .filter(Product.user_id == user.id, Product.is_deleted.is_(False))
        .order_by(Product.description, Product.id)
    )
    return [product_out(p) for p in paginate(query, response, page, page_size)]


@router.post("", status_code=201)
def create_product(
    body: ProductRequest,
    user: User = Depends(require_password_already_set),
    db: Session = Depends(get_db),
):
    p = Product(user_id=user.id)
    _apply(db, user, p, body)
    db.add(p)
    db.commit()
    return product_out(p)


@router.put("/{product_id}")
def update_product(
    product_id: int,
    body: ProductRequest,
    user: User = Depends(require_password_already_set),
    db: Session = Depends(get_db),
):
    p = _get_owned(db, user, product_id)
    _apply(db, user, p, body)
    db.commit()
    return product_out(p)


@router.delete("/{product_id}")
def delete_product(
    product_id: int,
    user: User = Depends(require_password_already_set),
    db: Session = Depends(get_db),
):
    # Soft delete, like everything else in this app.
    p = _get_owned(db, user, product_id)
    p.is_deleted = True
    db.commit()
    return {"ok": True}
