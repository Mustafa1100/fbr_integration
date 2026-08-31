from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    full_name: Mapped[str] = mapped_column(String(120))
    # "admin" | "user"
    role: Mapped[str] = mapped_column(String(10), default="user")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    # True for a fresh admin-issued temporary password — forces the user to
    # set their own strong password before they can use the app.
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=True)
    # Bumped on every password change; embedded in issued JWTs so a token
    # minted before a change stops working the moment the password changes,
    # even though JWTs are otherwise stateless and don't expire early.
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    fbr_settings: Mapped["FbrSettings | None"] = relationship(
        back_populates="user", uselist=False
    )


class FbrSettings(Base):
    """Per-user PRAL/FBR integration credentials and seller profile."""

    __tablename__ = "fbr_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)

    # mock | sandbox | production — the account's default submission target.
    fbr_env: Mapped[str] = mapped_column(String(12), default="mock")
    # Legacy single token — superseded by sandbox_token / production_token
    # below (kept so old rows migrate cleanly). No longer read.
    fbr_token: Mapped[str] = mapped_column(String(500), default="")
    # Bearer tokens issued via the IRIS portal — sandbox and production are
    # different tokens, and a "test then promote" account needs both at once.
    sandbox_token: Mapped[str] = mapped_column(String(500), default="")
    production_token: Mapped[str] = mapped_column(String(500), default="")
    # Whether this user may submit to FBR production at all (direct upload or
    # promoting a sandbox-tested invoice). Admin-granted.
    can_submit_production: Mapped[bool] = mapped_column(Boolean, default=False)

    # The identifier sent to FBR as sellerNTNCNIC — in practice the seller's
    # CNIC for the current accounts. seller_ntn below is a separate,
    # display-only value so a registered seller can show both NTN and CNIC
    # on the printed receipt; it is never sent to PRAL.
    seller_ntn_cnic: Mapped[str] = mapped_column(String(15), default="")
    seller_ntn: Mapped[str] = mapped_column(String(15), default="")
    seller_business_name: Mapped[str] = mapped_column(String(200), default="")
    seller_province: Mapped[str] = mapped_column(String(50), default="Sindh")
    seller_address: Mapped[str] = mapped_column(String(300), default="")
    default_scenario: Mapped[str] = mapped_column(String(10), default="SN001")

    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow
    )

    user: Mapped[User] = relationship(back_populates="fbr_settings")

    @property
    def is_mock(self) -> bool:
        return self.fbr_env == "mock"

    @property
    def is_sandbox(self) -> bool:
        return self.fbr_env in ("mock", "sandbox")

    @property
    def is_production(self) -> bool:
        return self.fbr_env == "production"


class Upload(Base):
    __tablename__ = "uploads"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    filename: Mapped[str] = mapped_column(String(300))
    # completed | completed_with_errors | failed
    status: Mapped[str] = mapped_column(String(30), default="completed")
    total_rows: Mapped[int] = mapped_column(default=0)
    invoices_created: Mapped[int] = mapped_column(default=0)
    invoices_submitted: Mapped[int] = mapped_column(default=0)
    invoices_failed: Mapped[int] = mapped_column(default=0)
    error: Mapped[str] = mapped_column(Text, default="")
    # mock | sandbox | production — where this batch was submitted.
    fbr_env: Mapped[str] = mapped_column(String(12), default="sandbox")
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    invoices: Mapped[list["Invoice"]] = relationship(back_populates="upload")


class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    upload_id: Mapped[int | None] = mapped_column(
        ForeignKey("uploads.id"), nullable=True
    )
    # Receipt/invoice number from the customer's POS system (groups CSV rows).
    pos_invoice_no: Mapped[str] = mapped_column(String(60), default="")

    invoice_type: Mapped[str] = mapped_column(String(20), default="Sale Invoice")
    invoice_date: Mapped[date] = mapped_column(Date, default=date.today)
    invoice_ref_no: Mapped[str] = mapped_column(String(60), default="")
    scenario_id: Mapped[str] = mapped_column(String(10), default="SN001")
    # mock | sandbox | production — the env this invoice was last submitted
    # to. Flips to "production" when a sandbox invoice is promoted.
    fbr_env: Mapped[str] = mapped_column(String(12), default="sandbox")

    buyer_ntn_cnic: Mapped[str] = mapped_column(String(15), default="")
    buyer_name: Mapped[str] = mapped_column(String(200), default="")
    buyer_province: Mapped[str] = mapped_column(String(50), default="")
    buyer_address: Mapped[str] = mapped_column(String(300), default="")
    # "Registered" | "Unregistered"
    buyer_registration_type: Mapped[str] = mapped_column(
        String(20), default="Unregistered"
    )

    # draft → submitted | failed
    status: Mapped[str] = mapped_column(String(20), default="draft")
    fbr_invoice_number: Mapped[str] = mapped_column(String(60), default="")
    fbr_dated: Mapped[str] = mapped_column(String(40), default="")
    fbr_response: Mapped[str] = mapped_column(Text, default="")

    # Whether the buyer has actually paid this invoice — separate from FBR
    # submission status, which only reflects tax-authority registration.
    is_paid: Mapped[bool] = mapped_column(Boolean, default=False)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow
    )

    upload: Mapped[Upload | None] = relationship(back_populates="invoices")
    items: Mapped[list["InvoiceItem"]] = relationship(
        back_populates="invoice", cascade="all, delete-orphan"
    )

    @property
    def total_excl(self) -> float:
        return sum(i.value_excl_st for i in self.items)

    @property
    def total_tax(self) -> float:
        return sum(i.sales_tax + i.further_tax + i.fed_payable for i in self.items)

    @property
    def grand_total(self) -> float:
        return sum(i.total_value for i in self.items)


class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"))

    hs_code: Mapped[str] = mapped_column(String(20), default="0101.2100")
    product_description: Mapped[str] = mapped_column(String(300))
    # FBR expects the rate as a string, e.g. "18%" or "Exempt".
    rate: Mapped[str] = mapped_column(String(20), default="18%")
    uom: Mapped[str] = mapped_column(String(60), default="Numbers, pieces, units")
    quantity: Mapped[float] = mapped_column(Float, default=1.0)
    unit_price: Mapped[float] = mapped_column(Float, default=0.0)
    value_excl_st: Mapped[float] = mapped_column(Float, default=0.0)
    sales_tax: Mapped[float] = mapped_column(Float, default=0.0)
    st_withheld: Mapped[float] = mapped_column(Float, default=0.0)
    further_tax: Mapped[float] = mapped_column(Float, default=0.0)
    fed_payable: Mapped[float] = mapped_column(Float, default=0.0)
    discount: Mapped[float] = mapped_column(Float, default=0.0)
    fixed_notified_value: Mapped[float] = mapped_column(Float, default=0.0)
    # Spec v1.12: Number (Decimal), optional.
    extra_tax: Mapped[float] = mapped_column(Float, default=0.0)
    # PRAL "totalValues": the whole-line total incl. taxes, less discount.
    # 0 means "derive it" — build_payload falls back to the computed
    # total_value property below. A provider whose upstream system already
    # produced an exact figure can pin it via the CSV total_values column.
    total_values: Mapped[float] = mapped_column(Float, default=0.0)
    sale_type: Mapped[str] = mapped_column(
        String(100), default="Goods at standard rate (default)"
    )
    sro_schedule_no: Mapped[str] = mapped_column(String(50), default="")
    sro_item_serial_no: Mapped[str] = mapped_column(String(50), default="")

    invoice: Mapped[Invoice] = relationship(back_populates="items")

    @property
    def total_value(self) -> float:
        return (
            self.value_excl_st
            + self.sales_tax
            + self.further_tax
            + self.fed_payable
            - self.discount
        )
