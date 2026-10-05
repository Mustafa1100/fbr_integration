from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

# Production domains that serve this same app and must always be able to call
# the API, regardless of what CORS_ORIGINS is set to on the host (Fly
# secrets). Keeping these in code means adding a new domain that points at
# the same deployment (e.g. a new custom domain for the same Worker) doesn't
# require touching production secrets — just a deploy.
ALWAYS_ALLOWED_ORIGINS = [
    "https://argdipos.com",
    "https://di.compliance.pk",
]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./fbr_dev.db"

    # "development" (default) or "production" — production hides the
    # interactive API docs (/docs, /redoc, /openapi.json).
    environment: str = "development"

    jwt_secret: str = "change-me-to-a-long-random-string"
    jwt_expire_hours: int = 24

    admin_email: str = "admin@example.com"
    admin_password: str = "admin123"
    admin_name: str = "Administrator"

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        configured = [o.strip() for o in self.cors_origins.split(",") if o.strip()]
        # Dedup while preserving order: configured origins first, then any
        # always-allowed ones not already present.
        merged = list(configured)
        for origin in ALWAYS_ALLOWED_ORIGINS:
            if origin not in merged:
                merged.append(origin)
        return merged

    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
