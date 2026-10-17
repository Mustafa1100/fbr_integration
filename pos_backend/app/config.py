from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_JWT_SECRET = "change-me-to-a-long-random-string"
_DEFAULT_ADMIN_PASSWORD = "admin123"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./pos_dev.db"

    # "development" (default) or "production" — production hides the
    # interactive API docs (/docs, /redoc, /openapi.json).
    environment: str = "development"

    jwt_secret: str = _DEFAULT_JWT_SECRET
    # Admin portal sessions.
    admin_token_hours: int = 12
    # Desktop app sessions. Long-lived on purpose: the POS must keep working
    # offline, and a reset password or deactivation still ends the session at
    # the next sync through the client's token_version / is_active.
    device_token_days: int = 400

    admin_email: str = "admin@example.com"
    admin_password: str = _DEFAULT_ADMIN_PASSWORD
    admin_name: str = "Administrator"

    # Desktop logins are <name>@<this domain>.
    username_domain: str = "pos.compliance.pk"

    # The key the desktop licence is signed with (Ed25519, PEM). Set it in
    # production; its public half is built into the desktop app
    # (pos_desktop/electron/config.js). Without it, development uses the file
    # below, created on first start.
    licence_private_key: str = ""
    licence_key_file: str = ".licence_key.pem"
    # A PC that has not reached the server for this long stops issuing
    # invoices until it connects again.
    licence_offline_days: int = 30

    cors_origins: str = "http://localhost:5174,http://127.0.0.1:5174"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() == "production"

    @model_validator(mode="after")
    def _safe_for_production(self):
        """Refuse to start in production with development defaults."""
        if not self.is_production:
            return self
        problems = []
        if self.jwt_secret == _DEFAULT_JWT_SECRET or len(self.jwt_secret) < 32:
            problems.append("JWT_SECRET must be set to a random value of at least 32 characters")
        if self.admin_password == _DEFAULT_ADMIN_PASSWORD or len(self.admin_password) < 12:
            problems.append("ADMIN_PASSWORD must be set (12+ characters)")
        if self.database_url.startswith("sqlite"):
            problems.append("DATABASE_URL must point at Postgres")
        if not self.licence_private_key.strip():
            problems.append("LICENCE_PRIVATE_KEY must be set")
        if any("localhost" in o or "127.0.0.1" in o for o in self.cors_origin_list):
            problems.append("CORS_ORIGINS must list the deployed admin portal, not localhost")
        if problems:
            raise ValueError("Unsafe production settings: " + "; ".join(problems))
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
