from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import hash_password
from app.config import get_settings
from app.database import Base, SessionLocal, engine, run_light_migrations
from app.models import Admin, Plan
from app.routers import admin_auth, clients, invoices, item_requests, items, plans, pos

Base.metadata.create_all(bind=engine)
run_light_migrations()

# The four tiers the product is sold in. Prices start at zero and are set
# from the admin portal.
DEFAULT_PLANS = [(1, "Monthly"), (3, "Quarterly"), (6, "Bi-annual"), (12, "Yearly")]


def bootstrap() -> None:
    """Create the initial admin account and the four plans if missing."""
    cfg = get_settings()
    db = SessionLocal()
    try:
        if not db.query(Admin).first():
            db.add(
                Admin(
                    email=cfg.admin_email.lower(),
                    password_hash=hash_password(cfg.admin_password),
                    full_name=cfg.admin_name,
                )
            )
        existing = {p.months for p in db.query(Plan).all()}
        for months, name in DEFAULT_PLANS:
            if months not in existing:
                db.add(Plan(months=months, name=name, price=0))
        db.commit()
    finally:
        db.close()


bootstrap()

# Interactive docs are a reconnaissance aid for an attacker probing a live
# production API — only serve them in development.
_docs_enabled = not get_settings().is_production
app = FastAPI(
    title="Compliance Pakistan POS API",
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(admin_auth.router)
app.include_router(plans.router)
app.include_router(clients.router)
app.include_router(items.router)
app.include_router(item_requests.router)
app.include_router(invoices.router)
app.include_router(pos.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
