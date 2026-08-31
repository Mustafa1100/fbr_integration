"""A user's own stats — powers the user-dashboard home page (Uploads,
Invoices, submitted/failed counts, 14-day trend). Same shape of data as
the admin dashboard's /api/admin/stats, just scoped to one account instead
of every business.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user
from app.database import get_db
from app.insights import invoices_by_day
from app.models import Invoice, Upload, User
from app.services.invoice_service import ENV_FILTER_ALIASES, resolve_env_filter

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("")
def my_stats(
    fbr_env: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Scoped to one account. ?fbr_env=test|live (or all) splits the numbers
    by whether the invoice was a test run or a real FBR submission."""
    env_values = None
    if fbr_env and fbr_env != "all":
        if fbr_env not in ENV_FILTER_ALIASES:
            raise HTTPException(
                400, f"fbr_env must be one of: {', '.join(ENV_FILTER_ALIASES)}"
            )
        env_values = resolve_env_filter(fbr_env)

    invoices_q = db.query(Invoice).filter(
        Invoice.user_id == user.id, Invoice.is_deleted.is_(False)
    )
    uploads_q = db.query(Upload).filter(
        Upload.user_id == user.id, Upload.is_deleted.is_(False)
    )
    day_filters = [Invoice.user_id == user.id]
    if env_values is not None:
        invoices_q = invoices_q.filter(Invoice.fbr_env.in_(env_values))
        uploads_q = uploads_q.filter(Upload.fbr_env.in_(env_values))
        day_filters.append(Invoice.fbr_env.in_(env_values))

    submitted = (
        invoices_q.filter(Invoice.status == "submitted")
        .options(joinedload(Invoice.items))
        .all()
    )

    return {
        "total_uploads": uploads_q.count(),
        "total_invoices": invoices_q.count(),
        "submitted_invoices": len(submitted),
        "failed_invoices": invoices_q.filter(Invoice.status == "failed").count(),
        "draft_invoices": invoices_q.filter(Invoice.status == "draft").count(),
        "total_sales_value": round(sum(i.grand_total for i in submitted), 2),
        "total_tax_collected": round(sum(i.total_tax for i in submitted), 2),
        "paid_tax": round(sum(i.total_tax for i in submitted if i.is_paid), 2),
        "invoices_by_day": invoices_by_day(db, *day_filters),
    }
