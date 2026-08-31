from fastapi import APIRouter, Depends, Form, HTTPException, Response, UploadFile
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Query, Session

from app.auth import get_current_user, require_password_already_set
from app.database import get_db
from app.models import Upload, User
from app.pagination import paginate
from app.routers.settings import get_or_create_fbr_settings
from app.services import csv_processor, invoice_service
from app.services.invoice_service import VALID_ENVS

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

UPLOAD_STATUSES = {"completed", "completed_with_errors", "failed"}


def upload_out(u: Upload) -> dict:
    return {
        "id": u.id,
        "filename": u.filename,
        "status": u.status,
        "fbr_env": u.fbr_env,
        "total_rows": u.total_rows,
        "invoices_created": u.invoices_created,
        "invoices_submitted": u.invoices_submitted,
        "invoices_failed": u.invoices_failed,
        "error": u.error,
        "created_at": u.created_at.isoformat(),
    }


def query_uploads(
    db: Session,
    user_id: int,
    status: str | None = None,
    q: str | None = None,
    fbr_env: str | None = None,
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
    if fbr_env:
        if fbr_env not in VALID_ENVS:
            raise HTTPException(
                400, f"fbr_env must be one of: {', '.join(VALID_ENVS)}"
            )
        query = query.filter(Upload.fbr_env == fbr_env)
    if q:
        query = query.filter(Upload.filename.ilike(f"%{q.strip()}%"))
    return query.order_by(Upload.id.desc())


@router.get("/template", response_class=PlainTextResponse)
def download_template(
    scenario: str | None = None,
    target: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The valid downloadable CSV format for tax uploads.

    With ?scenario=SN0xx, returns a single row pre-filled from FBR/PRAL's own
    official worked example for that sandbox scenario instead of the generic
    starter rows — see csv_processor.scenario_template_csv. ?target= (mock |
    sandbox | production) controls whether the scenario_id column is included.
    """
    if scenario:
        content = csv_processor.scenario_template_csv(scenario.upper())
        if content is None:
            raise HTTPException(404, f"No official sample for scenario '{scenario}'")
        filename = f"fbr_template_{scenario.upper()}.csv"
    else:
        fbr = get_or_create_fbr_settings(db, user)
        env = target or fbr.fbr_env
        content = csv_processor.template_csv(include_scenario=env != "production")
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
    fbr_env: str | None = None,
    page: int = 1,
    page_size: int = 1000,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = query_uploads(db, user.id, status=status, q=q, fbr_env=fbr_env)
    uploads = paginate(query, response, page, page_size)
    return [upload_out(u) for u in uploads]


def _resolve_target(fbr, target: str | None) -> str:
    """Pick and validate the submission environment for an upload."""
    target = (target or fbr.fbr_env or "mock").strip().lower()
    if target not in VALID_ENVS:
        raise HTTPException(400, f"target must be one of: {', '.join(VALID_ENVS)}")
    if target == "production" and not fbr.can_submit_production:
        raise HTTPException(
            403, "This account is not enabled to submit to FBR production."
        )
    if not fbr.is_mock and target != "mock":
        token = fbr.sandbox_token if target == "sandbox" else fbr.production_token
        if not token:
            raise HTTPException(
                400, f"No {target} token configured for this account."
            )
    return target


@router.post("", status_code=201)
async def upload_csv(
    file: UploadFile,
    target: str = Form(""),
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
    target_env = _resolve_target(fbr, target)

    if is_excel:
        upload = csv_processor.process_upload_excel(
            db, user, fbr, file.filename, raw, target_env=target_env
        )
    else:
        try:
            content = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            raise HTTPException(400, "File must be UTF-8 encoded CSV")
        upload = csv_processor.process_upload(
            db, user, fbr, file.filename, content, target_env=target_env
        )
    return upload_out(upload)


@router.post("/{upload_id}/promote")
def promote_upload(
    upload_id: int,
    user: User = Depends(require_password_already_set),
    db: Session = Depends(get_db),
):
    """Submit a whole tested batch to FBR production — re-submits every
    non-production invoice in the upload to production and flips the batch's
    fbr_env. Requires the account's production capability + token."""
    upload = db.get(Upload, upload_id)
    if not upload or upload.user_id != user.id or upload.is_deleted:
        raise HTTPException(404, "Upload not found")
    fbr = get_or_create_fbr_settings(db, user)
    if not fbr.can_submit_production:
        raise HTTPException(
            403, "This account is not enabled to submit to FBR production."
        )
    if not fbr.is_mock and not fbr.production_token:
        raise HTTPException(400, "No production token configured for this account.")
    if upload.fbr_env == "production":
        raise HTTPException(400, "This batch has already been submitted to FBR.")

    candidates = [
        inv
        for inv in upload.invoices
        if not inv.is_deleted and inv.fbr_env != "production"
    ]
    if not candidates:
        raise HTTPException(400, "This batch has no invoices to submit.")
    for inv in candidates:
        invoice_service.submit(db, inv, fbr, target_env="production")

    live = [inv for inv in upload.invoices if not inv.is_deleted]
    upload.invoices_submitted = sum(1 for inv in live if inv.status == "submitted")
    upload.invoices_failed = sum(1 for inv in live if inv.status == "failed")
    upload.fbr_env = "production"
    upload.status = (
        "completed" if upload.invoices_failed == 0 else "completed_with_errors"
    )
    db.commit()
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
