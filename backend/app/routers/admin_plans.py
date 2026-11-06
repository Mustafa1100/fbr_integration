"""Admin-only subscription plan management for business users.

Set plan, renew (months + amount), extend (free days), edit or delete any
entry, change the start date and the admin note. Every change is written to
plan_logs. Nothing here is reachable by a business user, so amounts and the
admin note never leave the admin side.
"""

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import require_admin, require_password_already_set
from app.database import get_db
from app.models import PlanEntry, PlanLog, User
from app.services.plans import chain, entries_for, fmt, status_of, today_pk

router = APIRouter(
    prefix="/api/admin/users",
    tags=["admin-plans"],
    dependencies=[Depends(require_admin), Depends(require_password_already_set)],
)

MAX_MONTHS = 120
MAX_DAYS = 366
MAX_AMOUNT = 1_000_000_000
MAX_NOTE = 2000
KIND_LABEL = {"initial": "Initial plan", "renewal": "Renewal", "extension": "Extension"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _money(v: float) -> str:
    return f"PKR {v:,.0f}" if float(v).is_integer() else f"PKR {v:,.2f}"


def _span(e) -> str:
    if e.kind == "extension":
        return f"{e.days} day{'s' if e.days != 1 else ''}"
    return f"{e.months} month{'s' if e.months != 1 else ''}"


def log(db: Session, user: User, admin: User | None, action: str, detail: str) -> None:
    db.add(
        PlanLog(
            user_id=user.id,
            admin_id=admin.id if admin else None,
            action=action,
            detail=detail,
        )
    )


def check_entry(kind: str, months: int, days: int, amount: float, note: str) -> None:
    if kind in ("initial", "renewal"):
        if not 1 <= months <= MAX_MONTHS:
            raise HTTPException(400, f"Months must be between 1 and {MAX_MONTHS}.")
        if days:
            raise HTTPException(400, "A plan or renewal is in months — use Extend for days.")
    elif kind == "extension":
        if not 1 <= days <= MAX_DAYS:
            raise HTTPException(400, f"Extension days must be between 1 and {MAX_DAYS}.")
        if months:
            raise HTTPException(400, "An extension is in days — use Renew for months.")
        if amount:
            raise HTTPException(400, "An extension is free — it has no amount.")
    else:
        raise HTTPException(400, "Unknown entry type.")
    if amount < 0 or amount > MAX_AMOUNT:
        raise HTTPException(400, "Enter a valid amount (0 or more).")
    if len(note) > MAX_NOTE:
        raise HTTPException(400, f"Note is too long (max {MAX_NOTE} characters).")


def check_start(start: date) -> None:
    if start > today_pk():
        raise HTTPException(400, "The start date can't be in the future.")
    if start.year < 2000:
        raise HTTPException(400, "Enter a valid start date.")


def set_plan(
    db: Session,
    user: User,
    admin: User | None,
    start: date,
    months: int,
    amount: float,
    received_on: date | None,
    note: str,
) -> None:
    """Start a plan on an account that has none (no commit)."""
    check_start(start)
    check_entry("initial", months, 0, amount, note)
    user.plan_start = start
    db.add(
        PlanEntry(
            user_id=user.id,
            kind="initial",
            months=months,
            amount=amount,
            received_on=received_on or start,
            note=note.strip(),
            created_by=admin.id if admin else None,
        )
    )
    log(
        db,
        user,
        admin,
        "plan_set",
        f"Plan set: starts {fmt(start)}, {months} month{'s' if months != 1 else ''}, "
        f"initial fee {_money(amount)}.",
    )


def plan_summaries(db: Session, users: list[User]) -> dict[int, dict]:
    """Plan status for many users with one query (users list, stats)."""
    ids = [u.id for u in users]
    by_user: dict[int, list[PlanEntry]] = {i: [] for i in ids}
    if ids:
        for e in (
            db.query(PlanEntry)
            .filter(PlanEntry.user_id.in_(ids))
            .order_by(PlanEntry.id)
            .all()
        ):
            by_user[e.user_id].append(e)
    today = today_pk()
    out = {}
    for u in users:
        entries = by_user[u.id]
        s = status_of(u, entries, today)
        # "extended" = the current period ends with free extension days.
        s["extended"] = bool(entries) and entries[-1].kind == "extension"
        out[u.id] = s
    return out


def _target(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if not user or user.is_deleted:
        raise HTTPException(404, "User not found")
    if user.role != "user":
        raise HTTPException(400, "Plans are only for business users, not admins.")
    return user


def plan_detail(db: Session, user: User) -> dict:
    entries = entries_for(db, user)
    names = {
        u.id: u.full_name
        for u in db.query(User)
        .filter(
            User.id.in_(
                {e.created_by for e in entries if e.created_by}
                | {
                    a
                    for (a,) in db.query(PlanLog.admin_id)
                    .filter(PlanLog.user_id == user.id)
                    .all()
                    if a
                }
            )
        )
        .all()
    }
    rows = []
    if user.plan_start and entries:
        for e, frm, to in chain(user.plan_start, entries):
            rows.append(
                {
                    "id": e.id,
                    "kind": e.kind,
                    "months": e.months,
                    "days": e.days,
                    "amount": e.amount,
                    "received_on": e.received_on.isoformat() if e.received_on else None,
                    "note": e.note,
                    "from": frm.isoformat(),
                    "to": to.isoformat(),
                    "created_by": names.get(e.created_by, ""),
                    "created_at": e.created_at.isoformat(),
                    "updated_at": e.updated_at.isoformat() if e.updated_at else None,
                }
            )
    logs = (
        db.query(PlanLog)
        .filter(PlanLog.user_id == user.id)
        .order_by(PlanLog.id.desc())
        .all()
    )
    return {
        "user_id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "created_at": user.created_at.isoformat(),
        "plan_start": user.plan_start.isoformat() if user.plan_start else None,
        "admin_note": user.admin_note or "",
        **status_of(user, entries),
        "entries": rows,
        "total_received": round(sum(e.amount or 0 for e in entries), 2),
        "log": [
            {
                "action": l.action,
                "detail": l.detail,
                "admin": names.get(l.admin_id, ""),
                "created_at": l.created_at.isoformat(),
            }
            for l in logs
        ],
    }


@router.get("/{user_id}/plan")
def get_plan(user_id: int, db: Session = Depends(get_db)):
    return plan_detail(db, _target(db, user_id))


class SetPlanRequest(BaseModel):
    start_date: date
    months: int
    amount: float = 0
    received_on: date | None = None
    note: str = ""


@router.post("/{user_id}/plan")
def create_plan(
    user_id: int,
    body: SetPlanRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = _target(db, user_id)
    if entries_for(db, user):
        raise HTTPException(409, "This user already has a plan. Use Renew, Extend or Edit.")
    set_plan(db, user, admin, body.start_date, body.months, body.amount, body.received_on, body.note)
    db.commit()
    return plan_detail(db, user)


class UpdatePlanRequest(BaseModel):
    start_date: date | None = None
    admin_note: str | None = None


@router.patch("/{user_id}/plan")
def update_plan(
    user_id: int,
    body: UpdatePlanRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = _target(db, user_id)
    if body.start_date is not None and body.start_date != user.plan_start:
        if not entries_for(db, user):
            raise HTTPException(400, "Set a plan first.")
        check_start(body.start_date)
        log(
            db,
            user,
            admin,
            "start_changed",
            f"Start date changed from {fmt(user.plan_start)} to {fmt(body.start_date)}.",
        )
        user.plan_start = body.start_date
    if body.admin_note is not None:
        note = body.admin_note.strip()
        if len(note) > MAX_NOTE:
            raise HTTPException(400, f"Note is too long (max {MAX_NOTE} characters).")
        if note != (user.admin_note or ""):
            old = user.admin_note or "(empty)"
            log(db, user, admin, "note_changed", f"Admin note changed. Before: {old}")
            user.admin_note = note
    db.commit()
    return plan_detail(db, user)


class EntryRequest(BaseModel):
    kind: str = "renewal"  # renewal | extension
    months: int = 0
    days: int = 0
    amount: float = 0
    received_on: date | None = None
    note: str = ""


@router.post("/{user_id}/plan/entries")
def add_entry(
    user_id: int,
    body: EntryRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = _target(db, user_id)
    entries = entries_for(db, user)
    if not entries or user.plan_start is None:
        raise HTTPException(400, "Set a plan first.")
    if body.kind not in ("renewal", "extension"):
        raise HTTPException(400, "Choose a renewal or an extension.")
    check_entry(body.kind, body.months, body.days, body.amount, body.note)
    entry = PlanEntry(
        user_id=user.id,
        kind=body.kind,
        months=body.months,
        days=body.days,
        amount=body.amount,
        received_on=(body.received_on or today_pk()) if body.kind == "renewal" else body.received_on,
        note=body.note.strip(),
        created_by=admin.id,
    )
    db.add(entry)
    db.flush()
    new_end = chain(user.plan_start, entries + [entry])[-1][2]
    if body.kind == "renewal":
        detail = f"Renewed {_span(entry)} for {_money(entry.amount)}. Plan now ends {fmt(new_end)}."
    else:
        detail = f"Extended {_span(entry)}. Plan now ends {fmt(new_end)}."
    log(db, user, admin, body.kind, detail)
    db.commit()
    return plan_detail(db, user)


class EditEntryRequest(BaseModel):
    months: int | None = None
    days: int | None = None
    amount: float | None = None
    received_on: date | None = None
    note: str | None = None


def _entry(db: Session, user: User, entry_id: int) -> PlanEntry:
    e = db.get(PlanEntry, entry_id)
    if not e or e.user_id != user.id:
        raise HTTPException(404, "Entry not found")
    return e


@router.patch("/{user_id}/plan/entries/{entry_id}")
def edit_entry(
    user_id: int,
    entry_id: int,
    body: EditEntryRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = _target(db, user_id)
    e = _entry(db, user, entry_id)
    before = f"{_span(e)}, {_money(e.amount)}, received {fmt(e.received_on) or '-'}"
    months = e.months if body.months is None else body.months
    days = e.days if body.days is None else body.days
    amount = e.amount if body.amount is None else body.amount
    note = e.note if body.note is None else body.note.strip()
    check_entry(e.kind, months, days, amount, note)
    e.months, e.days, e.amount, e.note = months, days, amount, note
    if body.received_on is not None:
        e.received_on = body.received_on
    e.updated_at = _now()
    after = f"{_span(e)}, {_money(e.amount)}, received {fmt(e.received_on) or '-'}"
    log(db, user, admin, "entry_edited", f"{KIND_LABEL[e.kind]} edited. Before: {before}. After: {after}.")
    db.commit()
    return plan_detail(db, user)


@router.delete("/{user_id}/plan/entries/{entry_id}")
def delete_entry(
    user_id: int,
    entry_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = _target(db, user_id)
    e = _entry(db, user, entry_id)
    detail = (
        f"{KIND_LABEL[e.kind]} deleted ({_span(e)}, {_money(e.amount)}, "
        f"received {fmt(e.received_on) or '-'})."
    )
    db.delete(e)
    db.flush()
    if not entries_for(db, user):
        # Nothing left in the chain: the account goes back to "no plan set".
        user.plan_start = None
        detail += " No entries left, so the plan was removed."
    log(db, user, admin, "entry_deleted", detail)
    db.commit()
    return plan_detail(db, user)
