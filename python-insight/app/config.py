from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """12-factor config: every value comes from env vars, validated at startup."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://insight:insight@localhost:5432/insight"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret: str = "change-me"
    jwt_ttl_minutes: int = 720
    cors_origins: list[str] = ["*"]
    data_dir: Path = Path("/data")

    @property
    def sync_database_url(self) -> str:
        # Celery workers and pandas use the sync driver; the API uses asyncpg.
        return self.database_url.replace("+asyncpg", "+psycopg")

    @property
    def model_path(self) -> Path:
        return self.data_dir / "models" / "churn.joblib"

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
