from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./fbr_dev.db"

    jwt_secret: str = "change-me-to-a-long-random-string"
    jwt_expire_hours: int = 24

    admin_email: str = "admin@example.com"
    admin_password: str = "admin123"
    admin_name: str = "Administrator"

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
