from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Query, Session

from app.auth import get_current_user, require_password_already_set
from app.database import get_db
from app.models import Upload, User
from app.pagination import paginate
from app.routers.settings import get_or_create_fbr_settings
from app.services import csv_processor

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

UPLOAD_STATUSES = {"completed", "completed_with_errors", "failed"}


def upload_out(u: Upload) -> dict:
    return {
        "id": u.id,
        "filename": u.filename,
        "status": u.status,
        "total_rows": u.total_rows,
        "invoices_created": u.invoices_created,
        "invoices_submitted": u.invoices_submitted,
        "invoices_failed": u.invoices_failed,
        "error": u.error,
        "created_at": u.created_at.isoformat(),
    }


def query_uploads(
    db: Session, user_id: int, status: str | None = None, q: str | None = None
) -> Query:
    """Shared filter logic for a user's uploads — used by both this
    router's own /api/uploads and the admin per-user read-only view."""
    query = db.query(Upload).filter(
        Upload.user_id == user_id, Upload.is_deleted.is_(False)
    )
    if status:
        if status not in UPLOAD_STATUSES:
            raise HTTPException(
                400, f"status must be one of: {', '.join(sorted(UPLOAD_STATUSES))}"
            )
        query = query.filter(Upload.status == status)
    if q:
        query = query.filter(Upload.filename.ilike(f"%{q.strip()}%"))
    return query.order_by(Upload.id.desc())


@router.get("/template", response_class=PlainTextResponse)
def download_template(
    scenario: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The valid downloadable CSV format for tax uploads.

    With ?scenario=SN0xx, returns a single row pre-filled from FBR/PRAL's own
    official worked example for that sandbox scenario instead of the generic
    starter rows — see csv_processor.scenario_template_csv.
    """
    if scenario:
        content = csv_processor.scenario_template_csv(scenario.upper())
        if content is None:
            raise HTTPException(404, f"No official sample for scenario '{scenario}'")
        filename = f"fbr_template_{scenario.upper()}.csv"
    else:
        fbr = get_or_create_fbr_settings(db, user)
        content = csv_processor.template_csv(include_scenario=not fbr.is_production)
        filename = "fbr_invoice_template.csv"
    return PlainTextResponse(
        content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/scenario-catalog")
def scenario_catalog(user: User = Depends(get_current_user)):
    """Scenarios with an official FBR sample available for the template."""
    return csv_processor.scenario_catalog()


@router.get("")
def list_uploads(
    response: Response,
    status: str | None = None,
    q: str | None = None,
    page: int = 1,
    page_size: int = 1000,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = query_uploads(db, user.id, status=status, q=q)
    uploads = paginate(query, response, page, page_size)
    return [upload_out(u) for u in uploads]


@router.post("", status_code=201)
async def upload_csv(
    file: UploadFile,
    user: User = Depends(require_password_already_set),
    db: Session = Depends(get_db),
):
    filename_lower = (file.filename or "").lower()
    is_excel = filename_lower.endswith(".xlsx")
    if not is_excel and not filename_lower.endswith(".csv"):
        raise HTTPException(
            400, "Please upload a .csv or .xlsx file (download the template)"
        )
    raw = await file.read()
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 5 MB)")

    fbr = get_or_create_fbr_settings(db, user)
    if not fbr.is_mock and not fbr.fbr_token:
        raise HTTPException(
            400,
            "Set up your FBR integration first (token missing) or switch to mock mode.",
        )

    if is_excel:
        upload = csv_processor.process_upload_excel(db, user, fbr, file.filename, raw)
    else:
        try:
            content = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            raise HTTPException(400, "File must be UTF-8 encoded CSV")
        upload = csv_processor.process_upload(db, user, fbr, file.filename, content)
    return upload_out(upload)


@router.delete("/{upload_id}")
def delete_upload(
    upload_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Soft delete — kept in the DB with is_deleted=True."""
    upload = db.get(Upload, upload_id)
    if not upload or upload.user_id != user.id or upload.is_deleted:
        raise HTTPException(404, "Upload not found")
    upload.is_deleted = True
    db.commit()
    return {"ok": True}
