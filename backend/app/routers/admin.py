import secrets

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.auth import hash_password, require_admin, require_password_already_set
from app.database import get_db
from app.insights import USER_GROWTH_GRANULARITIES
from app.insights import invoices_by_day as build_invoices_by_day
from app.insights import users_by_period as build_users_by_period
from app.models import Invoice, Upload, User
from app.pagination import paginate
from app.routers.invoices import detail_out, query_invoices, summary_out
from app.routers.settings import (
    FbrSettingsRequest,
    apply_fbr_settings,
    fbr_settings_out,
    get_or_create_fbr_settings,
)
from app.routers.uploads import query_uploads, upload_out

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


def _user_out(u: User) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "full_name": u.full_name,
        "role": u.role,
        "is_active": u.is_active,
        "must_change_password": u.must_change_password,
        "created_at": u.created_at.isoformat(),
    }


def _get_user_or_404(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if not user or user.is_deleted:
        raise HTTPException(404, "User not found")
    return user


def _generate_temp_password() -> str:
    """6-digit numeric code, cryptographically random — short and easy to
    read aloud/type when handing it to a new user. Never actually usable
    for more than one login: must_change_password forces an immediate
    replacement with a real, strong password."""
    return f"{secrets.randbelow(1_000_000):06d}"


@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    users_q = db.query(User).filter(User.is_deleted.is_(False))
    invoices_q = db.query(Invoice).filter(Invoice.is_deleted.is_(False))
    submitted = (
        invoices_q.filter(Invoice.status == "submitted")
        .options(joinedload(Invoice.items))
        .all()
    )

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
        "total_tax_collected": round(sum(i.total_tax for i in submitted), 2),
        "paid_tax": round(sum(i.total_tax for i in submitted if i.is_paid), 2),
        "invoices_per_user": [
            {"email": email, "count": count}
            for email, count in db.query(User.email, func.count(Invoice.id))
            .join(Invoice, Invoice.user_id == User.id)
            .filter(User.is_deleted.is_(False), Invoice.is_deleted.is_(False))
            .group_by(User.email)
            .all()
        ],
        "invoices_by_day": build_invoices_by_day(db),
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
    users = paginate(query, response, page, page_size)
    return [_user_out(u) for u in users]


class CreateUserRequest(BaseModel):
    email: EmailStr
    full_name: str
    role: str = "user"


@router.post("/users", status_code=201)
def create_user(body: CreateUserRequest, db: Session = Depends(get_db)):
    if body.role not in ("user", "admin"):
        raise HTTPException(400, "Role must be 'user' or 'admin'")
    # The admin never types this in — a random 6-digit code is generated
    # here and returned once in the response for them to hand off. It's
    # only ever valid for the one first login; must_change_password forces
    # an immediate replacement with a real, strong password.
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
        db.commit()
        return {**_user_out(existing), "temp_password": temp_password}
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
    db.commit()
    return {**_user_out(user), "temp_password": temp_password}


class UpdateUserRequest(BaseModel):
    full_name: str | None = None
    password: str | None = None
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
    if body.password:
        if len(body.password) < 6:
            raise HTTPException(400, "Password must be at least 6 characters")
        user.password_hash = hash_password(body.password)
        # Any password an admin sets is a temporary one.
        user.must_change_password = True
        user.token_version += 1
    if body.is_active is not None:
        if user.id == admin.id and not body.is_active:
            raise HTTPException(400, "You cannot deactivate your own account")
        user.is_active = body.is_active
    db.commit()
    return _user_out(user)


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
    page: int = 1,
    page_size: int = 1000,
    db: Session = Depends(get_db),
):
    """A user's CSV upload history — admin read-only view, same data (and
    same filters/pagination) the user sees on their own Uploads page."""
    user = _get_user_or_404(db, user_id)
    query = query_uploads(db, user.id, status=status, q=q)
    uploads = paginate(query, response, page, page_size)
    return [upload_out(u) for u in uploads]


@router.get("/users/{user_id}/invoices")
def user_invoices(
    user_id: int,
    response: Response,
    upload_id: int | None = None,
    status: str | None = None,
    q: str | None = None,
    page: int = 1,
    page_size: int = 1000,
    db: Session = Depends(get_db),
):
    """A user's invoices — admin read-only view, same data (and same
    filters/pagination) the user sees on their own Invoices page."""
    user = _get_user_or_404(db, user_id)
    query = query_invoices(db, user.id, upload_id=upload_id, status=status, q=q)
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
