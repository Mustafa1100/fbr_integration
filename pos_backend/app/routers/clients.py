import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import generate_password, get_current_admin, hash_password
from app import live
from app.config import get_settings
from app.database import get_db
from app.models import Admin, Client, ItemRequest, Plan, Subscription, utcnow
from app.serializers import (
    add_months,
    client_detail,
    client_summary,
    subscription_status,
)

router = APIRouter(
    prefix="/api/admin", tags=["clients"], dependencies=[Depends(get_current_admin)]
)

# The part before the @ of a desktop login.
_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{1,39}$")


class ConfigIn(BaseModel):
    """Business profile and FBR settings pushed to the desktop app."""

    business_name: str = Field(default="", max_length=200)
    ntn: str = Field(default="", max_length=20)
    strn: str = Field(default="", max_length=30)
    address: str = Field(default="", max_length=300)
    phone: str = Field(default="", max_length=30)
    mode: Literal["demo", "fbr"] = "demo"
    environment: Literal["test", "live"] = "test"
    pos_id: str = Field(default="", max_length=20)
    service_url: str = Field(default="http://localhost:8524", max_length=200)
    usin_prefix: str = Field(default="", max_length=20)
    prices_include_tax: bool = False
    default_tax_rate: float = Field(default=0, ge=0, le=100)
    # FBR's PCTCode field is 8 characters.
    default_pct_code: str = Field(default="", max_length=8)

    @field_validator(
        "business_name", "ntn", "strn", "address", "phone", "pos_id", "service_url",
        "usin_prefix", "default_pct_code",
    )
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="after")
    def _check(self):
        if self.pos_id and not self.pos_id.isdigit():
            raise ValueError("POS ID must contain digits only")
        if self.mode == "fbr" and not self.pos_id:
            raise ValueError("Enter the POS ID before switching the mode to FBR")
        if not re.match(r"^https?://", self.service_url):
            raise ValueError("Fiscal service address must start with http:// or https://")
        return self


class AccountIn(BaseModel):
    contact_name: str = Field(default="", max_length=120)
    contact_phone: str = Field(default="", max_length=30)
    notes: str = Field(default="", max_length=2000)


class ClientCreate(AccountIn):
    name: str
    config: ConfigIn = ConfigIn()
    # The plan the client starts on. The portal always sends one.
    plan_id: int | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        value = value.strip().lower()
        if not _NAME_RE.match(value):
            raise ValueError(
                "Username must be 2-40 characters: lowercase letters, digits, dot, "
                "dash or underscore, starting with a letter or digit"
            )
        return value


class ClientUpdate(AccountIn):
    is_active: bool = True
    config: ConfigIn


class SubscriptionIn(BaseModel):
    plan_id: int
    note: str = Field(default="", max_length=300)


def _get(db: Session, client_id: int) -> Client:
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(404, "Client not found")
    return client


def _apply_config(client: Client, config: ConfigIn) -> None:
    client.business_name = config.business_name
    client.ntn = config.ntn
    client.strn = config.strn
    client.address = config.address
    client.phone = config.phone
    client.fbr_mode = config.mode
    client.fbr_environment = config.environment
    client.pos_id = config.pos_id
    client.service_url = config.service_url
    client.usin_prefix = config.usin_prefix
    client.prices_include_tax = config.prices_include_tax
    client.default_tax_rate = config.default_tax_rate
    client.default_pct_code = config.default_pct_code


@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    counts = {"none": 0, "active": 0, "expiring": 0, "expired": 0, "cancelled": 0}
    clients = db.query(Client).all()
    for client in clients:
        counts[subscription_status(client)] += 1
    expiring = [c for c in clients if subscription_status(c) == "expiring"]
    return {
        "clients": len(clients),
        "pending_item_requests": db.query(ItemRequest).filter(ItemRequest.status == "pending").count(),
        "deactivated": sum(1 for c in clients if not c.is_active),
        "no_plan": counts["none"],
        "active": counts["active"] + counts["expiring"],
        "expiring": counts["expiring"],
        "expired": counts["expired"] + counts["cancelled"],
        "expiring_clients": [client_summary(c) for c in sorted(expiring, key=lambda c: c.expires_at)],
    }


@router.get("/clients")
def list_clients(search: str = "", db: Session = Depends(get_db)):
    query = db.query(Client)
    if search.strip():
        like = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Client.username.ilike(like),
                Client.business_name.ilike(like),
                Client.contact_name.ilike(like),
            )
        )
    return [client_summary(c) for c in query.order_by(Client.id.desc()).all()]


@router.post("/clients", status_code=201)
def create_client(
    body: ClientCreate,
    db: Session = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    username = f"{body.name}@{get_settings().username_domain}"
    if db.query(Client).filter(Client.username == username).first():
        raise HTTPException(409, f"{username} is already taken")
    password = generate_password()
    client = Client(
        username=username,
        password_hash=hash_password(password),
        contact_name=body.contact_name.strip(),
        contact_phone=body.contact_phone.strip(),
        notes=body.notes.strip(),
    )
    _apply_config(client, body.config)
    if body.plan_id is not None:
        plan = db.get(Plan, body.plan_id)
        if not plan:
            raise HTTPException(404, "Plan not found")
        _start_plan(client, plan, admin)
    db.add(client)
    db.commit()
    # The only time the password is readable: it is stored hashed.
    return {"client": client_detail(client), "password": password}


@router.get("/clients/{client_id}")
def get_client(client_id: int, db: Session = Depends(get_db)):
    return client_detail(_get(db, client_id))


@router.put("/clients/{client_id}")
def update_client(client_id: int, body: ClientUpdate, db: Session = Depends(get_db)):
    client = _get(db, client_id)
    client.contact_name = body.contact_name.strip()
    client.contact_phone = body.contact_phone.strip()
    client.notes = body.notes.strip()
    client.is_active = body.is_active
    _apply_config(client, body.config)
    db.commit()
    live.publish(client.id)
    return client_detail(client)


@router.post("/clients/{client_id}/reset-password")
def reset_password(client_id: int, db: Session = Depends(get_db)):
    """Issue a new generated password. The desktop app is signed out at its
    next sync and has to log in with the new one."""
    client = _get(db, client_id)
    password = generate_password()
    client.password_hash = hash_password(password)
    client.token_version += 1
    db.commit()
    live.publish(client.id)
    return {"username": client.username, "password": password}


def _running(client: Client) -> Subscription | None:
    current = client.current_subscription
    if current is not None and current.end_reason == "" and current.ends_at > utcnow():
        return current
    return None


def _start_plan(client: Client, plan: Plan, admin: Admin, note: str = "") -> None:
    """Put a client on a plan from now. Only one plan is ever in force: while
    one is running, it has to be cancelled before another can start."""
    running = _running(client)
    if running is not None:
        raise HTTPException(
            409,
            f"The {running.plan_name} plan is still running. Cancel it first, then assign the new plan.",
        )
    now = utcnow()
    client.subscriptions.append(
        Subscription(
            plan_months=plan.months,
            plan_name=plan.name,
            price=plan.price,
            starts_at=now,
            expires_at=add_months(now, plan.months),
            note=note.strip(),
            created_by=admin.email,
        )
    )


@router.post("/clients/{client_id}/subscriptions", status_code=201)
def add_subscription(
    client_id: int,
    body: SubscriptionIn,
    db: Session = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    """Assign a plan, starting today. Refused while a plan is running: that
    one has to be cancelled first."""
    client = _get(db, client_id)
    plan = db.get(Plan, body.plan_id)
    if not plan:
        raise HTTPException(404, "Plan not found")
    _start_plan(client, plan, admin, body.note)
    db.commit()
    live.publish(client.id)
    return client_detail(client)


@router.post("/clients/{client_id}/subscriptions/cancel")
def cancel_subscription(
    client_id: int,
    db: Session = Depends(get_db),
    admin: Admin = Depends(get_current_admin),
):
    """Stop the current plan now. The desktop app locks at its next refresh,
    within a few minutes while it is online."""
    client = _get(db, client_id)
    current = _running(client)
    if current is None:
        raise HTTPException(400, "This client has no running subscription to cancel")
    current.ended_at = utcnow()
    current.end_reason = "cancelled"
    current.note = (current.note + f" Cancelled by {admin.email}.").strip()
    db.commit()
    live.publish(client.id)
    return client_detail(client)