from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    """Naive UTC — the one representation every supported database stores and
    returns unchanged, so comparisons never mix aware and naive values."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Admin(Base):
    """Portal operator. Admins never sign in to the desktop app."""

    __tablename__ = "admins"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    full_name: Mapped[str] = mapped_column(String(120))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Plan(Base):
    """One of the four fixed subscription tiers. The tiers themselves are
    seeded at startup; only the name and price are editable."""

    __tablename__ = "plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    months: Mapped[int] = mapped_column(Integer, unique=True)
    name: Mapped[str] = mapped_column(String(60))
    price: Mapped[float] = mapped_column(Float, default=0.0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class Client(Base):
    """A POS owner: the desktop login plus the business profile and FBR
    settings the desktop app downloads."""

    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(primary_key=True)
    # <name>@<username_domain>, e.g. kashif@pos.compliance.pk
    username: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    # Bumped on every password reset so issued desktop tokens stop working.
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Admin-only: who to call about this account.
    contact_name: Mapped[str] = mapped_column(String(120), default="")
    contact_phone: Mapped[str] = mapped_column(String(30), default="")
    notes: Mapped[str] = mapped_column(Text, default="")

    # Printed on receipts.
    business_name: Mapped[str] = mapped_column(String(200), default="")
    ntn: Mapped[str] = mapped_column(String(20), default="")
    strn: Mapped[str] = mapped_column(String(30), default="")
    address: Mapped[str] = mapped_column(String(300), default="")
    phone: Mapped[str] = mapped_column(String(30), default="")

    # demo: the desktop sends nothing to FBR. fbr: every invoice goes to the
    # fiscal component installed on the POS computer.
    fbr_mode: Mapped[str] = mapped_column(String(10), default="demo")
    # test | live — which fiscal component (and POS ID) is installed there.
    fbr_environment: Mapped[str] = mapped_column(String(10), default="test")
    pos_id: Mapped[str] = mapped_column(String(20), default="")
    service_url: Mapped[str] = mapped_column(String(200), default="http://localhost:8524")
    usin_prefix: Mapped[str] = mapped_column(String(20), default="")
    prices_include_tax: Mapped[bool] = mapped_column(Boolean, default=False)
    default_tax_rate: Mapped[float] = mapped_column(Float, default=0.0)
    default_pct_code: Mapped[str] = mapped_column(String(8), default="")

    # The highest invoice sequence number any of this client's computers has
    # used. A replacement computer continues from here, so invoice numbers
    # (USINs) already reported to FBR are never issued twice.
    usin_seq: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Last time one of the client's computers sent its data (invoice backup).
    last_backup_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    subscriptions: Mapped[list["Subscription"]] = relationship(
        back_populates="client", cascade="all, delete-orphan", order_by="Subscription.id"
    )
    items: Mapped[list["Item"]] = relationship(
        back_populates="client", cascade="all, delete-orphan"
    )

    @property
    def current_subscription(self) -> "Subscription | None":
        """The most recently assigned plan. Only one is ever in force:
        assigning a plan ends the one before it."""
        return self.subscriptions[-1] if self.subscriptions else None

    @property
    def expires_at(self) -> datetime | None:
        current = self.current_subscription
        return current.ends_at if current else None


class Item(Base):
    """Something a client sells or charges for. The server copy is what a new
    or replacement POS computer downloads.

    Only an admin changes items: directly in the portal, or by approving a
    client's ItemRequest. The tax rate, PCT code and 3rd Schedule flag decide
    what is reported to FBR; an item added on request starts with the
    client's defaults."""

    __tablename__ = "items"
    __table_args__ = (UniqueConstraint("client_id", "code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"), index=True)
    # The client's own short code; it identifies the item across computers.
    code: Mapped[str] = mapped_column(String(50))
    name: Mapped[str] = mapped_column(String(150))
    price: Mapped[float] = mapped_column(Float, default=0.0)
    tax_rate: Mapped[float] = mapped_column(Float, default=0.0)
    pct_code: Mapped[str] = mapped_column(String(8), default="")
    third_schedule: Mapped[bool] = mapped_column(Boolean, default=False)
    # Deleted items are kept, so re-adding a code brings its tax settings back.
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    client: Mapped[Client] = relationship(back_populates="items")


class ItemRequest(Base):
    """A client's request to add, change or delete one of their items. The
    desktop never changes the catalog itself; every change is a request an
    admin approves.

    status: pending -> approved | rejected, or withdrawn when a newer request
    for the same item code replaces it."""

    __tablename__ = "item_requests"
    __table_args__ = (UniqueConstraint("client_id", "uid"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"), index=True)
    # Made on the desktop, so a request re-sent after a dropped connection is
    # recognised instead of filed twice.
    uid: Mapped[str] = mapped_column(String(64))
    # The item concerned; empty for an add until it is approved.
    item_id: Mapped[int | None] = mapped_column(ForeignKey("items.id"), nullable=True)
    code: Mapped[str] = mapped_column(String(50))
    # add | edit | delete
    action: Mapped[str] = mapped_column(String(10))
    # For an add or edit: the name and price asked for.
    name: Mapped[str] = mapped_column(String(150), default="")
    price: Mapped[float] = mapped_column(Float, default=0.0)
    # The client's suggestion for how the item is reported to FBR. Only a
    # suggestion: the admin confirms or changes it when approving.
    proposed_tax_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    proposed_pct_code: Mapped[str | None] = mapped_column(String(8), nullable=True)
    status: Mapped[str] = mapped_column(String(12), default="pending", index=True)
    # Shown to the client, e.g. why a request was turned down.
    admin_note: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    decided_by: Mapped[str] = mapped_column(String(200), default="")

    client: Mapped[Client] = relationship()
    item: Mapped[Item | None] = relationship()


class Invoice(Base):
    """The server's copy of an invoice made on one of the client's computers,
    so the history survives a lost or replaced computer and the provider can
    see the client's sales. The computer is the source: this copy is only
    ever written by its uploads.

    Times are the invoice's own, as printed on the receipt (Pakistan time,
    "YYYY-MM-DD HH:MM:SS"); received_at/updated_at are server times (UTC)."""

    __tablename__ = "invoices"
    __table_args__ = (UniqueConstraint("client_id", "usin"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"), index=True)
    usin: Mapped[str] = mapped_column(String(50))
    ref_usin: Mapped[str] = mapped_column(String(50), default="")
    # 1 sale, 3 return (credit note)
    invoice_type: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[str] = mapped_column(String(19), index=True)
    buyer_name: Mapped[str] = mapped_column(String(150), default="")
    buyer_ntn: Mapped[str] = mapped_column(String(20), default="")
    buyer_cnic: Mapped[str] = mapped_column(String(20), default="")
    buyer_phone: Mapped[str] = mapped_column(String(30), default="")
    payment_mode: Mapped[int] = mapped_column(Integer, default=1)
    total_quantity: Mapped[float] = mapped_column(Float, default=0.0)
    total_sale_value: Mapped[float] = mapped_column(Float, default=0.0)
    total_tax: Mapped[float] = mapped_column(Float, default=0.0)
    total_discount: Mapped[float] = mapped_column(Float, default=0.0)
    total_further_tax: Mapped[float] = mapped_column(Float, default=0.0)
    total_bill: Mapped[float] = mapped_column(Float, default=0.0)
    # queued | fiscalized | failed | unconfirmed, as on the computer.
    status: Mapped[str] = mapped_column(String(12), index=True)
    fbr_invoice_number: Mapped[str] = mapped_column(String(100), default="")
    fbr_code: Mapped[str] = mapped_column(String(10), default="")
    fbr_response: Mapped[str] = mapped_column(Text, default="")
    fiscalized_at: Mapped[str] = mapped_column(String(19), default="")
    pos_id: Mapped[str] = mapped_column(String(20), default="")
    # demo | fbr
    mode: Mapped[str] = mapped_column(String(10), default="")
    environment: Mapped[str] = mapped_column(String(10), default="")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str] = mapped_column(Text, default="")
    received_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    lines: Mapped[list["InvoiceLine"]] = relationship(
        back_populates="invoice", cascade="all, delete-orphan", order_by="InvoiceLine.id"
    )


class InvoiceLine(Base):
    __tablename__ = "invoice_lines"

    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"), index=True)
    item_code: Mapped[str] = mapped_column(String(50))
    item_name: Mapped[str] = mapped_column(String(150))
    pct_code: Mapped[str] = mapped_column(String(8), default="")
    quantity: Mapped[float] = mapped_column(Float, default=0.0)
    unit_price: Mapped[float] = mapped_column(Float, default=0.0)
    tax_rate: Mapped[float] = mapped_column(Float, default=0.0)
    sale_value: Mapped[float] = mapped_column(Float, default=0.0)
    discount: Mapped[float] = mapped_column(Float, default=0.0)
    further_tax: Mapped[float] = mapped_column(Float, default=0.0)
    tax_charged: Mapped[float] = mapped_column(Float, default=0.0)
    total_amount: Mapped[float] = mapped_column(Float, default=0.0)
    invoice_type: Mapped[int] = mapped_column(Integer, default=1)

    invoice: Mapped[Invoice] = relationship(back_populates="lines")


class Subscription(Base):
    """One purchased period. The plan's name and price are copied in, so later
    price changes never rewrite what a client was actually charged."""

    __tablename__ = "subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"), index=True)
    plan_months: Mapped[int] = mapped_column(Integer)
    plan_name: Mapped[str] = mapped_column(String(60))
    price: Mapped[float] = mapped_column(Float, default=0.0)
    starts_at: Mapped[datetime] = mapped_column(DateTime)
    # When the plan would run out on its own.
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    # Set when it was stopped early: cancelled by an admin, or replaced by a
    # newly assigned plan.
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # "" | cancelled | replaced
    end_reason: Mapped[str] = mapped_column(String(12), default="")
    note: Mapped[str] = mapped_column(String(300), default="")
    created_by: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    client: Mapped[Client] = relationship(back_populates="subscriptions")

    @property
    def ends_at(self) -> datetime:
        """When access actually stops: the expiry, or earlier if ended."""
        if self.ended_at is not None and self.ended_at < self.expires_at:
            return self.ended_at
        return self.expires_at
