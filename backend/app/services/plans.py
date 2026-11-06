"""Subscription plans for business users.

A plan is one continuous chain: it starts on ``User.plan_start`` and every
entry (initial plan, renewal, extension) pushes the end date forward from
the previous end date, never from "today". So a late renewal still starts
where the plan ran out, and an extension's days carry into the next
renewal.

The end date is always worked out from the start date as
``start + all months, then + all days``. Counting months from the start
(not month-by-month) keeps month ends right: 31 Jan + 2 months is 31 Mar,
not 28 Mar.

A user is blocked from the end date onwards (dates in Pakistan time).
Accounts with no plan set, and admins, are never blocked.
"""

import calendar
from datetime import date, datetime, timedelta, timezone

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import PlanEntry, User

# Pakistan has no daylight saving, so a fixed UTC+5 offset is exact.
PKT = timezone(timedelta(hours=5))
EXPIRING_SOON_DAYS = 7
KINDS = ("initial", "renewal", "extension")
# Lets the frontend tell "plan expired" apart from any other 403.
BLOCKED_HEADER = "X-Plan-Expired"


def today_pk() -> date:
    return datetime.now(PKT).date()


def add_months(d: date, months: int) -> date:
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def fmt(d: date | None) -> str:
    return d.strftime("%d %b %Y") if d else ""


def entries_for(db: Session, user: User) -> list[PlanEntry]:
    return (
        db.query(PlanEntry)
        .filter(PlanEntry.user_id == user.id)
        .order_by(PlanEntry.id)
        .all()
    )


def chain(start: date, entries: list[PlanEntry]) -> list[tuple[PlanEntry, date, date]]:
    """Each entry with the period it covers (from, to)."""
    out = []
    months = days = 0
    prev_end = start
    for e in entries:
        months += e.months or 0
        days += e.days or 0
        end = add_months(start, months) + timedelta(days=days)
        out.append((e, prev_end, end))
        prev_end = end
    return out


def end_date(start: date | None, entries: list[PlanEntry]) -> date | None:
    if start is None or not entries:
        return None
    return chain(start, entries)[-1][2]


def status_of(user: User, entries: list[PlanEntry], today: date | None = None) -> dict:
    """What the plan looks like right now. Holds no amounts, so it is safe
    to send to the user themselves."""
    if user.role != "user" or user.plan_start is None or not entries:
        return {"status": "none", "ends_on": None, "days_left": None}
    today = today or today_pk()
    ends = end_date(user.plan_start, entries)
    days_left = (ends - today).days
    if days_left <= 0:
        status = "expired"
    elif days_left <= EXPIRING_SOON_DAYS:
        status = "expiring"
    else:
        status = "active"
    return {"status": status, "ends_on": ends.isoformat(), "days_left": days_left}


def user_plan_status(db: Session, user: User) -> dict:
    return status_of(user, entries_for(db, user))


def require_active_plan(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> User:
    """Router-wide guard: an expired business user can only use the
    dashboard (and sign in / out). Everything else is refused here."""
    if user.role != "user" or user.plan_start is None:
        return user
    plan = user_plan_status(db, user)
    if plan["status"] == "expired":
        ends = date.fromisoformat(plan["ends_on"])
        raise HTTPException(
            403,
            f"Your plan expired on {fmt(ends)}. "
            "Please contact your administrator to renew it.",
            headers={BLOCKED_HEADER: "1"},
        )
    return user
