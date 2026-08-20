from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import hash_password
from app.config import get_settings
from app.database import Base, SessionLocal, engine, run_light_migrations
from app.models import User
from app.routers import admin, auth, invoices, reference, settings, stats, uploads

Base.metadata.create_all(bind=engine)
run_light_migrations()


def bootstrap_admin() -> None:
    """Create the initial admin account if no admin exists yet."""
    cfg = get_settings()
    db = SessionLocal()
    try:
        has_admin = (
            db.query(User)
            .filter(User.role == "admin", User.is_deleted.is_(False))
            .first()
        )
        if not has_admin:
            db.add(
                User(
                    email=cfg.admin_email.lower(),
                    password_hash=hash_password(cfg.admin_password),
                    full_name=cfg.admin_name,
                    role="admin",
                    # The bootstrap admin's password is a real configured
                    # value (ADMIN_PASSWORD), not a temp one to be replaced.
                    must_change_password=False,
                )
            )
            db.commit()
    finally:
        db.close()


bootstrap_admin()

# Interactive docs are a reconnaissance aid for an attacker probing a live
# production API — only serve them in development.
_docs_enabled = not get_settings().is_production
app = FastAPI(
    title="FBR Digital Invoicing API",
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
    # X-Total-Count powers pagination on the admin Users/Admins lists — not
    # one of the handful of "safe" headers browsers expose to JS by default.
    expose_headers=["X-Total-Count"],
)

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(settings.router)
app.include_router(uploads.router)
app.include_router(invoices.router)
app.include_router(reference.router)
app.include_router(stats.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
