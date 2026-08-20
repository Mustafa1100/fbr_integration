"""A user's own stats — powers the user-dashboard home page (Uploads,
Invoices, submitted/failed counts, 14-day trend). Same shape of data as
the admin dashboard's /api/admin/stats, just scoped to one account instead
of every business.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user
from app.database import get_db
from app.insights import invoices_by_day
from app.models import Invoice, Upload, User

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("")
def my_stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    invoices_q = db.query(Invoice).filter(
        Invoice.user_id == user.id, Invoice.is_deleted.is_(False)
    )
    submitted = (
        invoices_q.filter(Invoice.status == "submitted")
        .options(joinedload(Invoice.items))
        .all()
    )

    return {
        "total_uploads": db.query(Upload)
        .filter(Upload.user_id == user.id, Upload.is_deleted.is_(False))
        .count(),
        "total_invoices": invoices_q.count(),
        "submitted_invoices": len(submitted),
        "failed_invoices": invoices_q.filter(Invoice.status == "failed").count(),
        "draft_invoices": invoices_q.filter(Invoice.status == "draft").count(),
        "total_sales_value": round(sum(i.grand_total for i in submitted), 2),
        "total_tax_collected": round(sum(i.total_tax for i in submitted), 2),
        "paid_tax": round(sum(i.total_tax for i in submitted if i.is_paid), 2),
        "invoices_by_day": invoices_by_day(db, Invoice.user_id == user.id),
    }
