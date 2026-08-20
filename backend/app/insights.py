"""Shared invoice-trend bucketing for stats endpoints — the admin-wide
dashboard and each user's own self-service dashboard show the same kind of
14-day submitted/failed trend chart, just scoped differently. One function
so the two views can't drift apart.
"""

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models import Invoice, User, _utcnow

TREND_DAYS = 14

USER_GROWTH_GRANULARITIES = ("day", "week", "month", "year")
_USER_GROWTH_DEFAULT_PERIODS = {"day": 30, "week": 12, "month": 12, "year": 5}


def invoices_by_day(db: Session, *filters, days: int = TREND_DAYS) -> list[dict]:
    """Daily {total, submitted, failed} invoice counts for the last `days`
    days (oldest first). Extra SQLAlchemy filter expressions scope it to
    one user; pass none for the admin-wide view."""
    since_day = _utcnow().date() - timedelta(days=days - 1)
    rows = (
        db.query(Invoice.created_at, Invoice.status)
        .filter(
            Invoice.is_deleted.is_(False),
            Invoice.created_at >= _utcnow() - timedelta(days=days),
            *filters,
        )
        .all()
    )
    by_day = defaultdict(lambda: {"total": 0, "submitted": 0, "failed": 0})
    for created_at, status in rows:
        day = created_at.date().isoformat()
        by_day[day]["total"] += 1
        if status in ("submitted", "failed"):
            by_day[day][status] += 1
    result = []
    for i in range(days):
        day = (since_day + timedelta(days=i)).isoformat()
        bucket = by_day.get(day, {"total": 0, "submitted": 0, "failed": 0})
        result.append({"date": day, **bucket})
    return result


def _week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())  # Monday-start ISO week


def _add_months(d: date, n: int) -> date:
    month_index = d.month - 1 + n
    return date(d.year + month_index // 12, month_index % 12 + 1, 1)


def _bucket_start(granularity: str, today: date, periods: int) -> date:
    if granularity == "day":
        return today - timedelta(days=periods - 1)
    if granularity == "week":
        return _week_start(today) - timedelta(weeks=periods - 1)
    if granularity == "month":
        return _add_months(today.replace(day=1), -(periods - 1))
    return date(today.year - (periods - 1), 1, 1)  # year


def _bucket_key(granularity: str, d: date) -> date:
    if granularity == "day":
        return d
    if granularity == "week":
        return _week_start(d)
    if granularity == "month":
        return d.replace(day=1)
    return date(d.year, 1, 1)  # year


def _bucket_label(granularity: str, p: date) -> str:
    if granularity in ("day", "week"):
        return p.strftime("%b %d")
    if granularity == "month":
        return p.strftime("%b %Y")
    return str(p.year)


def users_by_period(
    db: Session, granularity: str, periods: int | None = None
) -> list[dict]:
    """Account-creation counts bucketed by day/week/month/year, oldest
    first — powers the admin "users created" growth chart. Bucketed in
    Python rather than DB-specific date functions, for the same
    cross-SQLite/Postgres/MySQL portability reason as invoices_by_day."""
    if granularity not in USER_GROWTH_GRANULARITIES:
        raise ValueError(
            f"granularity must be one of {', '.join(USER_GROWTH_GRANULARITIES)}"
        )
    n = periods or _USER_GROWTH_DEFAULT_PERIODS[granularity]
    today = _utcnow().date()
    start = _bucket_start(granularity, today, n)

    rows = (
        db.query(User.created_at)
        .filter(
            User.is_deleted.is_(False),
            User.created_at >= datetime.combine(start, datetime.min.time(), tzinfo=timezone.utc),
        )
        .all()
    )
    counts: dict[date, int] = defaultdict(int)
    for (created_at,) in rows:
        counts[_bucket_key(granularity, created_at.date())] += 1

    periods_list: list[date] = []
    cur = start
    for _ in range(n):
        periods_list.append(cur)
        if granularity == "day":
            cur = cur + timedelta(days=1)
        elif granularity == "week":
            cur = cur + timedelta(weeks=1)
        elif granularity == "month":
            cur = _add_months(cur, 1)
        else:
            cur = date(cur.year + 1, 1, 1)

    return [
        {"period": p.isoformat(), "label": _bucket_label(granularity, p), "count": counts.get(p, 0)}
        for p in periods_list
    ]
