from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


_url = get_settings().database_url
engine = create_engine(
    _url,
    connect_args={"check_same_thread": False} if _url.startswith("sqlite") else {},
    pool_pre_ping=not _url.startswith("sqlite"),
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def run_light_migrations() -> None:
    """Add columns introduced after a table already existed. Not a full
    migration framework (no Alembic in this project) — just enough to add a
    NOT NULL-ish column with a safe default without dropping existing dev
    data. New rows get their default from the Python-side mapped_column
    default; existing rows get the SQL-level default below.

    The DDL here has to work across SQLite (dev) and whatever's configured
    for prod (MySQL or Postgres via DATABASE_URL) — DEFAULT FALSE/TRUE are
    understood by all three, but DEFAULT 0 on a BOOLEAN column is rejected
    by Postgres (no implicit int->bool cast), and DATETIME isn't a
    Postgres type at all (TIMESTAMP is the portable one)."""
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return  # fresh DB — create_all already gives it the current schema
    existing_columns = {c["name"] for c in inspector.get_columns("users")}
    if "must_change_password" not in existing_columns:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "ALTER TABLE users ADD COLUMN must_change_password "
                    "BOOLEAN NOT NULL DEFAULT FALSE"
                )
            )
    if "token_version" not in existing_columns:
        with engine.begin() as conn:
            conn.execute(
                text("ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0")
            )
    if "fbr_settings" in inspector.get_table_names():
        fbr_columns = {c["name"] for c in inspector.get_columns("fbr_settings")}
        if "seller_ntn" not in fbr_columns:
            with engine.begin() as conn:
                conn.execute(
                    text(
                        "ALTER TABLE fbr_settings ADD COLUMN seller_ntn "
                        "VARCHAR(15) NOT NULL DEFAULT ''"
                    )
                )
    if "invoices" in inspector.get_table_names():
        invoice_columns = {c["name"] for c in inspector.get_columns("invoices")}
        if "is_paid" not in invoice_columns:
            with engine.begin() as conn:
                conn.execute(
                    text(
                        "ALTER TABLE invoices ADD COLUMN is_paid "
                        "BOOLEAN NOT NULL DEFAULT FALSE"
                    )
                )
        if "paid_at" not in invoice_columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE invoices ADD COLUMN paid_at TIMESTAMP NULL"))
