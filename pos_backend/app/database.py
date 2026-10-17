from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


def _normalise(url: str) -> str:
    """Accept a Postgres URL as hosts give it (Neon: postgresql://...?sslmode=
    require) and use the psycopg 3 driver the app ships with."""
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


_url = _normalise(get_settings().database_url)
if _url.startswith("sqlite"):
    engine = create_engine(_url, connect_args={"check_same_thread": False})
else:
    engine = create_engine(
        _url,
        # Neon suspends an idle database and closes its connections: test a
        # connection before use and replace old ones.
        pool_pre_ping=True,
        pool_recycle=300,
        pool_size=5,
        max_overflow=5,
        # Neon's pooled endpoint (host with "-pooler") is PgBouncer in
        # transaction mode, where server-side prepared statements break.
        connect_args={"prepare_threshold": None} if "-pooler" in _url else {},
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
    migration framework — just enough to add a column with a safe default
    without dropping existing data. New tables come from create_all."""
    inspector = inspect(engine)
    if "clients" not in inspector.get_table_names():
        return  # fresh DB — create_all already gives it the current schema
    client_columns = {c["name"] for c in inspector.get_columns("clients")}
    if "usin_seq" not in client_columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE clients ADD COLUMN usin_seq INTEGER NOT NULL DEFAULT 0"))
    if "last_backup_at" not in client_columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE clients ADD COLUMN last_backup_at TIMESTAMP NULL"))
    if "subscriptions" in inspector.get_table_names():
        subscription_columns = {c["name"] for c in inspector.get_columns("subscriptions")}
        with engine.begin() as conn:
            if "ended_at" not in subscription_columns:
                conn.execute(text("ALTER TABLE subscriptions ADD COLUMN ended_at TIMESTAMP NULL"))
            if "end_reason" not in subscription_columns:
                conn.execute(text("ALTER TABLE subscriptions ADD COLUMN end_reason VARCHAR(12) NOT NULL DEFAULT ''"))
    if "item_requests" in inspector.get_table_names():
        request_columns = {c["name"] for c in inspector.get_columns("item_requests")}
        with engine.begin() as conn:
            if "proposed_tax_rate" not in request_columns:
                conn.execute(text("ALTER TABLE item_requests ADD COLUMN proposed_tax_rate FLOAT NULL"))
            if "proposed_pct_code" not in request_columns:
                conn.execute(text("ALTER TABLE item_requests ADD COLUMN proposed_pct_code VARCHAR(8) NULL"))
