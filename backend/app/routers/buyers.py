from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.fbr import reference
from app.models import Buyer
from app.templating import templates

router = APIRouter(prefix="/buyers")


@router.get("")
def list_buyers(request: Request, db: Session = Depends(get_db)):
    buyers = db.query(Buyer).order_by(Buyer.business_name).all()
    return templates.TemplateResponse(request, "buyers.html", {"buyers": buyers})


@router.get("/new")
def new_buyer_form(request: Request):
    return templates.TemplateResponse(
        request,
        "buyer_form.html",
        {"buyer": None, "provinces": reference.provinces()},
    )


@router.post("/new")
def create_buyer(
    db: Session = Depends(get_db),
    ntn_cnic: str = Form(...),
    business_name: str = Form(...),
    province: str = Form(...),
    address: str = Form(...),
    registration_type: str = Form("Unregistered"),
):
    buyer = Buyer(
        ntn_cnic=ntn_cnic.strip(),
        business_name=business_name.strip(),
        province=province,
        address=address.strip(),
        registration_type=registration_type,
    )
    db.add(buyer)
    db.commit()
    return RedirectResponse("/buyers", status_code=303)


@router.get("/{buyer_id}/edit")
def edit_buyer_form(buyer_id: int, request: Request, db: Session = Depends(get_db)):
    buyer = db.get(Buyer, buyer_id)
    return templates.TemplateResponse(
        request,
        "buyer_form.html",
        {"buyer": buyer, "provinces": reference.provinces()},
    )


@router.post("/{buyer_id}/edit")
def update_buyer(
    buyer_id: int,
    db: Session = Depends(get_db),
    ntn_cnic: str = Form(...),
    business_name: str = Form(...),
    province: str = Form(...),
    address: str = Form(...),
    registration_type: str = Form("Unregistered"),
):
    buyer = db.get(Buyer, buyer_id)
    buyer.ntn_cnic = ntn_cnic.strip()
    buyer.business_name = business_name.strip()
    buyer.province = province
    buyer.address = address.strip()
    buyer.registration_type = registration_type
    db.commit()
    return RedirectResponse("/buyers", status_code=303)
