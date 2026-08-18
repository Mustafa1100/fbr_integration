"""Shared invoice-trend bucketing for stats endpoints — the admin-wide
dashboard and each user's own self-service dashboard show the same kind of
14-day submitted/failed trend chart, just scoped differently. One function
so the two views can't drift apart.
"""

from collections import defaultdict
from datetime import timedelta

from sqlalchemy.orm import Session

from app.models import Invoice, _utcnow

TREND_DAYS = 14


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
