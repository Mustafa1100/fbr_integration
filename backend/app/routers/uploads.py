from fastapi import APIRouter, Depends, Form, HTTPException, Response, UploadFile
from fastapi.responses import PlainTextResponse
from sqlalchemy import func
from sqlalchemy.orm import Query, Session

from app.auth import get_current_user, require_password_already_set
from app.database import get_db
from app.models import Customer, Invoice, Product, Upload, User
from app.pagination import paginate
from app.routers.settings import get_or_create_fbr_settings
from app.services import csv_processor, grid_upload, invoice_layout, invoice_service
from app.services.invoice_service import (
    ENV_FILTER_ALIASES,
    VALID_ENVS,
    resolve_env_filter,
)
from app.services.plans import require_active_plan


router = APIRouter(
    prefix="/api/uploads",
    tags=["uploads"],
    # An expired plan blocks everything here (see services/plans.py).
    dependencies=[Depends(require_active_plan)],
)

# "processing" = created but not fully submitted yet (a paced batch in flight,
# stopped, or interrupted) — see defer_submit on POST /api/uploads.
UPLOAD_STATUSES = {"completed", "completed_with_errors", "failed", "processing"}


def upload_out(u: Upload, invoices_deleted: int = 0) -> dict:
    return {
        "id": u.id,
        "filename": u.filename,
        "status": u.status,
        "fbr_env": u.fbr_env,
        "total_rows": u.total_rows,
        "invoices_created": u.invoices_created,
        "invoices_submitted": u.invoices_submitted,
        "invoices_failed": u.invoices_failed,
        # Soft-deleted invoices of this batch — derived, never stored, so it
        # can't drift from the invoices themselves. See uploads_out().
        "invoices_deleted": invoices_deleted,
        "error": u.error,
        "created_at": u.created_at.isoformat(),
    }


def uploads_out(db: Session, uploads: list[Upload]) -> list[dict]:
    """upload_out for a page of uploads, with each one's soft-deleted invoice
    count filled in from a single grouped query."""
    ids = [u.id for u in uploads]
    deleted: dict[int, int] = {}
    if ids:
        deleted = dict(
            db.query(Invoice.upload_id, func.count(Invoice.id))
            .filter(Invoice.upload_id.in_(ids), Invoice.is_deleted.is_(True))
            .group_by(Invoice.upload_id)
            .all()
        )
    return [upload_out(u, deleted.get(u.id, 0)) for u in uploads]


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
    if fbr_env and fbr_env != "all":
        if fbr_env not in ENV_FILTER_ALIASES:
            raise HTTPException(
                400, f"fbr_env must be one of: {', '.join(ENV_FILTER_ALIASES)}"
            )
        query = query.filter(Upload.fbr_env.in_(resolve_env_filter(fbr_env)))
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
    fbr = get_or_create_fbr_settings(db, user)
    # The user's custom fields become extra (optional) template columns.
    extra = [f["key"] for f in invoice_layout.layout_for(fbr)["custom_fields"]]
    if scenario:
        content = csv_processor.scenario_template_csv(scenario.upper(), extra)
        if content is None:
            raise HTTPException(404, f"No official sample for scenario '{scenario}'")
        filename = f"fbr_template_{scenario.upper()}.csv"
    else:
        env = target or fbr.fbr_env
        content = csv_processor.template_csv(include_scenario=env != "production", extra_columns=extra)
        filename = "fbr_invoice_template.csv"
    return PlainTextResponse(
        content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@router.get("/grid-template")
def download_grid_template(
    products: str = "",
    customers: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Excel template for the product-grid format: Date / Invoice No /
    Buyer Name, then the chosen saved products (in the order given), and
    optionally one row per saved customer."""
    ids = list(dict.fromkeys(int(x) for x in products.split(",") if x.strip().isdigit()))
    owned = {
        p.id: p
        for p in db.query(Product).filter(
            Product.user_id == user.id, Product.is_deleted.is_(False), Product.id.in_(ids)
        )
    }
    chosen = [owned[i] for i in ids if i in owned]
    if not chosen:
        raise HTTPException(400, "Choose at least one product for the template.")
    names = []
    if customers:
        names = [
            c.name
            for c in db.query(Customer)
            .filter(Customer.user_id == user.id, Customer.is_deleted.is_(False))
            .order_by(Customer.name, Customer.id)
        ]
    return Response(
        grid_upload.template_xlsx(chosen, names),
        media_type=XLSX_TYPE,
        headers={"Content-Disposition": "attachment; filename=invoice_template_products.xlsx"},
    )


@router.post("/check")
async def check_upload(
    file: UploadFile,
    target: str = Form(""),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Check a chosen file before it is uploaded — nothing is saved or sent.
    Only product-grid files are checked here; for anything else the answer
    is {"format": "standard"} and the upload works exactly as before."""
    name = (file.filename or "").lower()
    raw = await file.read()
    standard = {"format": "standard"}
    if len(raw) > 5 * 1024 * 1024:
        return standard
    if name.endswith(".xlsx"):
        sheet = grid_upload.sheet_from_excel(raw)
    elif name.endswith(".csv"):
        try:
            sheet = grid_upload.sheet_from_csv(raw.decode("utf-8-sig"))
        except UnicodeDecodeError:
            return standard
    else:
        return standard
    if not grid_upload.is_grid(sheet):
        return standard
    fbr = get_or_create_fbr_settings(db, user)
    result = grid_upload.build(db, user, fbr, sheet, (target or fbr.fbr_env or "mock").lower())
    if result.ok:
        # The same row checks the upload itself runs (e.g. custom fields).
        try:
            csv_processor.grid_rows_validated(
                result, invoice_layout.layout_for(fbr)["custom_fields"]
            )
        except csv_processor.CsvError as exc:
            result.other.append(str(exc))
    return {
        "format": "grid",
        "ok": result.ok,
        "errors": result.errors_out(),
        "summary": result.summary,
    }


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
    return uploads_out(db, uploads)


@router.get("/{upload_id}")
def get_upload(
    upload_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    upload = db.get(Upload, upload_id)
    if not upload or upload.user_id != user.id or upload.is_deleted:
        raise HTTPException(404, "Upload not found")
    return uploads_out(db, [upload])[0]


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
    defer_submit: bool = Form(False),
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
            db, user, fbr, file.filename, raw, target_env=target_env,
            submit_now=not defer_submit,
        )
    else:
        try:
            content = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            raise HTTPException(400, "File must be UTF-8 encoded CSV")
        upload = csv_processor.process_upload(
            db, user, fbr, file.filename, content, target_env=target_env,
            submit_now=not defer_submit,
        )
    return upload_out(upload)


@router.post("/{upload_id}/promote")
def promote_upload(
    upload_id: int,
    user: User = Depends(require_password_already_set),
    db: Session = Depends(get_db),
):
    """Submit a whole tested batch to FBR production — re-submits every
    invoice in the upload that passed its test to production and flips the
    batch's fbr_env once nothing test is left. A batch with failed invoices
    can't be submitted: they must be resolved (retried) or deleted first.
    Requires the account's production capability + token.

    The UI submits these one at a time with a pause instead (see
    SubmitBatchModal, mode "promote"); this all-at-once endpoint remains for
    API callers."""
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

    failed = sum(
        1 for inv in upload.invoices if not inv.is_deleted and inv.status == "failed"
    )
    if failed:
        raise HTTPException(
            400,
            f"This batch has {failed} failed invoice{'s' if failed != 1 else ''}. "
            "Resolve the failed invoices or delete them before submitting to FBR.",
        )

    # Only invoices that passed their test — anything still in draft (a paced
    # batch that was stopped) hasn't been tested and is never sent live.
    candidates = [
        inv
        for inv in upload.invoices
        if not inv.is_deleted
        and inv.fbr_env != "production"
        and inv.status == "submitted"
    ]
    if not candidates:
        raise HTTPException(400, "This batch has no test-passed invoices to submit.")
    for inv in candidates:
        invoice_service.submit(db, inv, fbr, target_env="production")

    invoice_service.sync_upload_env(db, upload)
    return uploads_out(db, [upload])[0]
