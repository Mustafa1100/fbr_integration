import secrets
import string
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.auth import hash_password, require_admin, require_password_already_set
from app.database import get_db
from app.insights import USER_GROWTH_GRANULARITIES
from app.insights import invoices_by_day as build_invoices_by_day
from app.insights import users_by_period as build_users_by_period
from app.models import Invoice, InvoiceItem, PlanEntry, Upload, User
from app.pagination import paginate
from app.routers.admin_plans import plan_summaries, set_plan
from app.routers.invoices import _resync_uploads, detail_out, query_invoices, summary_out
from app.routers.settings import (
    FbrSettingsRequest,
    apply_fbr_settings,
    fbr_settings_out,
    get_or_create_fbr_settings,
)
from app.routers.uploads import query_uploads, uploads_out
from app.services.plans import today_pk

router = APIRouter(
    prefix="/api/admin",
    tags=["admin"],
    # Order matters for error clarity: a non-admin gets "Admin access
    # required" rather than the password-change message. An admin account
    # still carrying its own temp password must set a real one — via
    # POST /api/auth/set-password, which lives outside this router — before
    # exercising any admin power (creating users, granting roles, setting
    # another account's FBR credentials).
    dependencies=[Depends(require_admin), Depends(require_password_already_set)],
)


def _user_out(u: User, plan: dict | None = None) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "full_name": u.full_name,
        "role": u.role,
        "is_active": u.is_active,
        "must_change_password": u.must_change_password,
        "created_at": u.created_at.isoformat(),
        # Admin-only router, so the admin note is fine here.
        "admin_note": u.admin_note or "",
        "plan": plan
        or {"status": "none", "ends_on": None, "days_left": None, "extended": False},
    }


def _get_user_or_404(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if not user or user.is_deleted:
        raise HTTPException(404, "User not found")
    return user


_TEMP_PASSWORD_ALPHABET = string.ascii_uppercase + string.digits


def _generate_temp_password() -> str:
    """6-character alphanumeric code (uppercase + digits — no lowercase, to
    avoid case-sensitivity confusion when read aloud/typed), cryptographically
    random. Never actually usable for more than one login: must_change_password
    forces an immediate replacement with a real password. Shared by both
    account creation and admin-initiated password resets."""
    return "".join(secrets.choice(_TEMP_PASSWORD_ALPHABET) for _ in range(6))


@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    users_q = db.query(User).filter(User.is_deleted.is_(False))
    invoices_q = db.query(Invoice).filter(Invoice.is_deleted.is_(False))
    # Only quick counts here. Money totals (which add up every invoice line)
    # are slow on a big database, so they live in /stats/advanced and are
    # loaded on request.
    return {
        "total_users": users_q.count(),
        "total_admins": users_q.filter(User.role == "admin").count(),
        "total_regular_users": users_q.filter(User.role == "user").count(),
        "active_users": users_q.filter(User.is_active.is_(True)).count(),
        "total_uploads": db.query(Upload)
        .filter(Upload.is_deleted.is_(False))
        .count(),
        "total_invoices": invoices_q.count(),
        "submitted_invoices": invoices_q.filter(
            Invoice.status == "submitted"
        ).count(),
        "failed_invoices": invoices_q.filter(Invoice.status == "failed").count(),
        "draft_invoices": invoices_q.filter(Invoice.status == "draft").count(),
        "invoices_per_user": [
            {"email": email, "count": count}
            for email, count in db.query(User.email, func.count(Invoice.id))
            .join(Invoice, Invoice.user_id == User.id)
            .filter(User.is_deleted.is_(False), Invoice.is_deleted.is_(False))
            .group_by(User.email)
            .all()
        ],
        "invoices_by_day": build_invoices_by_day(db),
        **_plan_counts(db),
    }


def _plan_counts(db: Session) -> dict:
    users = (
        db.query(User)
        .filter(User.is_deleted.is_(False), User.role == "user", User.plan_start.isnot(None))
        .all()
    )
    statuses = [s["status"] for s in plan_summaries(db, users).values()]
    return {
        "plans_expiring": statuses.count("expiring"),
        "plans_expired": statuses.count("expired"),
    }


@router.get("/stats/advanced")
def advanced_stats(db: Session = Depends(get_db)):
    """Money totals of submitted invoices, per environment. Summed in the
    database (one query) instead of loading every invoice and line."""
    tax = InvoiceItem.sales_tax + InvoiceItem.further_tax + InvoiceItem.fed_payable
    rows = (
        db.query(
            Invoice.fbr_env,
            func.count(func.distinct(Invoice.id)),
            func.coalesce(func.sum(InvoiceItem.value_excl_st), 0.0),
            func.coalesce(func.sum(tax), 0.0),
            func.coalesce(func.sum(InvoiceItem.discount), 0.0),
        )
        .join(InvoiceItem, InvoiceItem.invoice_id == Invoice.id)
        .join(User, User.id == Invoice.user_id)
        .filter(
            Invoice.is_deleted.is_(False),
            Invoice.status == "submitted",
            User.is_deleted.is_(False),
        )
        .group_by(Invoice.fbr_env)
        .all()
    )
    by_env = {}
    for env, count, excl, tax_sum, discount in rows:
        by_env[env or "mock"] = {
            "invoices": count,
            "sales_value_excl": round(excl, 2),
            "tax": round(tax_sum, 2),
            "grand_total": round(excl + tax_sum - discount, 2),
        }
    return {"by_env": by_env}


IDLE_DAYS = 3
ATTENTION_LIMIT = 10


@router.get("/stats/attention")
def attention(db: Session = Depends(get_db)):
    """Users who need a look: plans ending within 7 days, plans expired,
    and active users with no invoice in the last 3 days (expired users are
    left out of that list — they can't make invoices anyway)."""
    users = (
        db.query(User)
        .filter(User.is_deleted.is_(False), User.role == "user")
        .all()
    )
    plans = plan_summaries(db, users)

    def brief(u: User, **extra) -> dict:
        return {"id": u.id, "full_name": u.full_name, "email": u.email, **extra}

    expiring = sorted(
        (u for u in users if plans[u.id]["status"] == "expiring"),
        key=lambda u: plans[u.id]["days_left"],
    )
    # Most recently expired first.
    expired = sorted(
        (u for u in users if plans[u.id]["status"] == "expired"),
        key=lambda u: plans[u.id]["days_left"],
        reverse=True,
    )

    last_invoice = dict(
        db.query(Invoice.user_id, func.max(Invoice.created_at))
        .filter(Invoice.is_deleted.is_(False))
        .group_by(Invoice.user_id)
        .all()
    )
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=IDLE_DAYS)
    idle = []
    for u in users:
        if not u.is_active or plans[u.id]["status"] == "expired":
            continue
        last = last_invoice.get(u.id)
        if last is not None and last.tzinfo is not None:
            last = last.astimezone(timezone.utc).replace(tzinfo=None)
        if last is None or last < cutoff:
            idle.append((u, last))
    # Most recently gone quiet first; never-invoiced accounts at the end.
    idle.sort(key=lambda x: (x[1] is None, -(x[1].timestamp()) if x[1] else 0))

    return {
        "idle_days": IDLE_DAYS,
        "expiring": {
            "total": len(expiring),
            "users": [brief(u, **plans[u.id]) for u in expiring[:ATTENTION_LIMIT]],
        },
        "expired": {
            "total": len(expired),
            "users": [brief(u, **plans[u.id]) for u in expired[:ATTENTION_LIMIT]],
        },
        "idle": {
            "total": len(idle),
            "users": [
                brief(u, last_invoice_at=last.isoformat() if last else None)
                for u, last in idle[:ATTENTION_LIMIT]
            ],
        },
    }


@router.get("/stats/users")
def users_stats(db: Session = Depends(get_db)):
    """Top of the admin Users page: plan fees received (revenue) and how
    many business users are in each plan status."""
    users = db.query(User).filter(User.is_deleted.is_(False), User.role == "user").all()
    plans = plan_summaries(db, users)
    statuses = [plans[u.id]["status"] for u in users]
    ids = [u.id for u in users]
    entries = db.query(PlanEntry).filter(PlanEntry.user_id.in_(ids)).all() if ids else []
    today = today_pk()

    def received(e: PlanEntry) -> date:
        return e.received_on or e.created_at.date()

    paid = [e for e in entries if (e.amount or 0) > 0]
    month = [e for e in paid if (d := received(e)).year == today.year and d.month == today.month]
    year = [e for e in paid if received(e).year == today.year]
    return {
        "total_revenue": round(sum(e.amount for e in paid), 2),
        "revenue_this_month": round(sum(e.amount for e in month), 2),
        "revenue_this_year": round(sum(e.amount for e in year), 2),
        "payments": len(paid),
        "users": len(users),
        "active_users": sum(1 for u in users if u.is_active),
        "plans": {s: statuses.count(s) for s in ("active", "expiring", "expired", "none")},
    }


@router.get("/stats/user-growth")
def user_growth(granularity: str = "day", db: Session = Depends(get_db)):
    """Accounts created per day/week/month/year — powers the admin
    dashboard's user-growth chart."""
    if granularity not in USER_GROWTH_GRANULARITIES:
        raise HTTPException(
            400, f"granularity must be one of: {', '.join(USER_GROWTH_GRANULARITIES)}"
        )
    return build_users_by_period(db, granularity)


@router.get("/users")
def list_users(
    response: Response,
    role: str | None = None,
    q: str | None = None,
    is_active: bool | None = None,
    plan: str | None = None,  # active | expiring | expired | none
    page: int = 1,
    page_size: int = 1000,
    db: Session = Depends(get_db),
):
    """Paginated, filterable account list — powers the Users/Admins tabs.

    ``page_size`` defaults high (1000) so every existing caller that just
    wants "every account" (the user picker on the admin Uploads/Invoices
    tabs, older integrations) keeps working unchanged; pass a smaller
    ``page_size`` to actually paginate. The total match count (before
    pagination) is returned via the ``X-Total-Count`` header rather than
    wrapping the body, so the response shape never changes.
    """
    query = db.query(User).filter(User.is_deleted.is_(False))
    if role:
        if role not in ("user", "admin"):
            raise HTTPException(400, "Role must be 'user' or 'admin'")
        query = query.filter(User.role == role)
    if is_active is not None:
        query = query.filter(User.is_active.is_(is_active))
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(User.full_name.ilike(like), User.email.ilike(like))
        )
    query = query.order_by(User.created_at.desc())
    if plan:
        if plan not in ("active", "expiring", "expired", "none"):
            raise HTTPException(400, "plan must be active, expiring, expired or none")
        everyone = query.all()
        plans = plan_summaries(db, everyone)
        # "active" means not blocked, so it includes plans ending soon.
        wanted = ("active", "expiring") if plan == "active" else (plan,)
        matched = [u for u in everyone if plans[u.id]["status"] in wanted]
        if page < 1 or page_size < 1:
            raise HTTPException(400, "Invalid page")
        response.headers["X-Total-Count"] = str(len(matched))
        users = matched[(page - 1) * page_size : page * page_size]
        return [_user_out(u, plans[u.id]) for u in users]
    users = paginate(query, response, page, page_size)
    plans = plan_summaries(db, users)
    return [_user_out(u, plans[u.id]) for u in users]


class CreateUserRequest(BaseModel):
    email: EmailStr
    full_name: str
    role: str = "user"
    # Business users only. start_date back-dates the account (and the
    # plan); plan_months starts the plan with initial_fee as its amount.
    start_date: date | None = None
    plan_months: int | None = None
    initial_fee: float = 0
    admin_note: str = ""


def _apply_new_account_plan(db: Session, user: User, body: CreateUserRequest, admin: User) -> None:
    if body.role != "user":
        return
    start = body.start_date or today_pk()
    if start != today_pk():
        # Midday Pakistan time, so the date shows the same everywhere.
        user.created_at = datetime.combine(start, time(7, 0), tzinfo=timezone.utc)
    user.admin_note = body.admin_note.strip()
    if body.plan_months:
        set_plan(db, user, admin, start, body.plan_months, body.initial_fee, start, "")


@router.post("/users", status_code=201)
def create_user(
    body: CreateUserRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if body.role not in ("user", "admin"):
        raise HTTPException(400, "Role must be 'user' or 'admin'")
    if body.role == "user":
        if body.start_date and body.start_date > today_pk():
            raise HTTPException(400, "The account start date can't be in the future.")
        if body.plan_months is not None and not 1 <= body.plan_months <= 120:
            raise HTTPException(400, "Plan length must be between 1 and 120 months.")
        if body.initial_fee < 0:
            raise HTTPException(400, "Enter a valid initial fee (0 or more).")
        if len(body.admin_note) > 2000:
            raise HTTPException(400, "Admin note is too long (max 2000 characters).")
    # The admin never types this in — a random 6-character code is generated
    # here and returned once in the response for them to hand off. It's
    # only ever valid for the one first login; must_change_password forces
    # an immediate replacement with a password of the user's own choosing.
    temp_password = _generate_temp_password()
    existing = db.query(User).filter(User.email == body.email.lower()).first()
    if existing and not existing.is_deleted:
        raise HTTPException(409, "A user with this email already exists")
    if existing:
        # Soft-deleted account with this email: restore it (rows are never
        # really deleted, and users.email is UNIQUE at the DB level).
        existing.password_hash = hash_password(temp_password)
        existing.full_name = body.full_name.strip()
        existing.role = body.role
        existing.is_active = True
        existing.is_deleted = False
        existing.must_change_password = True
        existing.token_version += 1
        if body.plan_months:
            # Re-created account: the old plan entries don't belong to
            # the new plan.
            db.query(PlanEntry).filter(PlanEntry.user_id == existing.id).delete()
            existing.plan_start = None
        _apply_new_account_plan(db, existing, body, admin)
        db.commit()
        plans = plan_summaries(db, [existing])
        return {**_user_out(existing, plans[existing.id]), "temp_password": temp_password}
    user = User(
        email=body.email.lower(),
        password_hash=hash_password(temp_password),
        full_name=body.full_name.strip(),
        role=body.role,
        # Every password an admin sets is a temporary one — the user is
        # forced to replace it with their own on first login.
        must_change_password=True,
    )
    db.add(user)
    db.flush()
    _apply_new_account_plan(db, user, body, admin)
    db.commit()
    plans = plan_summaries(db, [user])
    return {**_user_out(user, plans[user.id]), "temp_password": temp_password}


class UpdateUserRequest(BaseModel):
    full_name: str | None = None
    is_active: bool | None = None


@router.patch("/users/{user_id}")
def update_user(
    user_id: int,
    body: UpdateUserRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = _get_user_or_404(db, user_id)
    if body.full_name is not None:
        user.full_name = body.full_name.strip()
    if body.is_active is not None:
        if user.id == admin.id and not body.is_active:
            raise HTTPException(400, "You cannot deactivate your own account")
        user.is_active = body.is_active
    db.commit()
    return _user_out(user)


@router.post("/users/{user_id}/reset-password")
def reset_password(
    user_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)
):
    """Admin-initiated reset: generates a fresh temp password (same
    generator as account creation — an admin never types a password
    in). Invalidates the user's current sessions immediately; they must
    sign in with this code and set their own password before doing
    anything else."""
    user = _get_user_or_404(db, user_id)
    if user.id == admin.id:
        raise HTTPException(
            400, "You cannot reset your own password this way — it would log you out."
        )
    temp_password = _generate_temp_password()
    user.password_hash = hash_password(temp_password)
    user.must_change_password = True
    user.token_version += 1
    db.commit()
    return {**_user_out(user), "temp_password": temp_password}


@router.get("/users/{user_id}")
def get_user(user_id: int, db: Session = Depends(get_db)):
    """One account, for the admin user-profile page."""
    user = _get_user_or_404(db, user_id)
    plans = plan_summaries(db, [user])
    return {
        **_user_out(user, plans[user.id]),
        "invoice_count": db.query(Invoice)
        .filter(Invoice.user_id == user.id, Invoice.is_deleted.is_(False))
        .count(),
        "upload_count": db.query(Upload)
        .filter(Upload.user_id == user.id, Upload.is_deleted.is_(False))
        .count(),
    }


@router.get("/users/{user_id}/fbr-settings")
def get_user_fbr_settings(user_id: int, db: Session = Depends(get_db)):
    """FBR/PRAL environment, token, and seller profile for one user — admin
    only. Users can view their own settings via GET /api/settings/fbr but
    cannot change them; this is the only way to configure an account."""
    user = _get_user_or_404(db, user_id)
    return fbr_settings_out(get_or_create_fbr_settings(db, user))


@router.put("/users/{user_id}/fbr-settings")
def update_user_fbr_settings(
    user_id: int, body: FbrSettingsRequest, db: Session = Depends(get_db)
):
    user = _get_user_or_404(db, user_id)
    fbr = get_or_create_fbr_settings(db, user)
    apply_fbr_settings(fbr, body)
    db.commit()
    return fbr_settings_out(fbr)


@router.get("/users/{user_id}/uploads")
def user_uploads(
    user_id: int,
    response: Response,
    status: str | None = None,
    q: str | None = None,
    fbr_env: str | None = None,
    page: int = 1,
    page_size: int = 1000,
    db: Session = Depends(get_db),
):
    """A user's CSV upload history — admin read-only view, same data (and
    same filters/pagination) the user sees on their own Uploads page."""
    user = _get_user_or_404(db, user_id)
    query = query_uploads(db, user.id, status=status, q=q, fbr_env=fbr_env)
    uploads = paginate(query, response, page, page_size)
    return uploads_out(db, uploads)


@router.delete("/users/{user_id}/uploads/{upload_id}")
def delete_user_upload(user_id: int, upload_id: int, db: Session = Depends(get_db)):
    """Soft delete one of a user's uploads — kept in the DB with
    is_deleted=True, just hidden from their Submission History. Cascades to
    every invoice in the batch (draft, failed, and already-submitted alike),
    so the whole upload disappears from Invoices History as a unit. Nothing
    is really removed: the rows stay with is_deleted=True and the FBR
    submissions themselves are untouched."""
    user = _get_user_or_404(db, user_id)
    upload = db.get(Upload, upload_id)
    if not upload or upload.user_id != user.id or upload.is_deleted:
        raise HTTPException(404, "Upload not found")
    upload.is_deleted = True
    invoices_hidden = 0
    for inv in upload.invoices:
        if not inv.is_deleted:
            inv.is_deleted = True
            invoices_hidden += 1
    db.commit()
    return {"ok": True, "invoices_hidden": invoices_hidden}


@router.get("/users/{user_id}/invoices")
def user_invoices(
    user_id: int,
    response: Response,
    upload_id: int | None = None,
    status: str | None = None,
    q: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    fbr_env: str | None = None,
    page: int = 1,
    page_size: int = 1000,
    db: Session = Depends(get_db),
):
    """A user's invoices — admin read-only view, same data (and same
    filters/pagination) the user sees on their own Invoices page."""
    user = _get_user_or_404(db, user_id)
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


@router.get("/users/{user_id}/invoices/{invoice_id}")
def user_invoice_detail(user_id: int, invoice_id: int, db: Session = Depends(get_db)):
    user = _get_user_or_404(db, user_id)
    inv = db.get(Invoice, invoice_id)
    if not inv or inv.user_id != user.id or inv.is_deleted:
        raise HTTPException(404, "Invoice not found")
    fbr = get_or_create_fbr_settings(db, user)
    return detail_out(inv, fbr)


@router.delete("/users/{user_id}/invoices/{invoice_id}")
def delete_user_invoice(user_id: int, invoice_id: int, db: Session = Depends(get_db)):
    """Soft delete one of a user's invoices — hidden from their Invoices
    History, kept in the DB with is_deleted=True. Like deleting an upload,
    any status is allowed; an invoice already sent to FBR stays registered
    with FBR, this only hides it here."""
    user = _get_user_or_404(db, user_id)
    inv = db.get(Invoice, invoice_id)
    if not inv or inv.user_id != user.id or inv.is_deleted:
        raise HTTPException(404, "Invoice not found")
    inv.is_deleted = True
    db.commit()
    _resync_uploads(db, {inv.upload_id} if inv.upload_id else set())
    db.commit()
    return {"ok": True}


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)
):
    """Soft delete — the row is kept with is_deleted=True (no real deletion)."""
    user = _get_user_or_404(db, user_id)
    if user.id == admin.id:
        raise HTTPException(400, "You cannot delete your own account")
    user.is_deleted = True
    user.is_active = False
    db.commit()
    return {"ok": True}
