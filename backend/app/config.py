from pydantic_settings import BaseSettings
from functools import lru_cache
import os


class Settings(BaseSettings):
    # DATABASE_URL fournie par Supabase (format: postgresql://...)
    # Render l'injecte via les variables d'environnement du dashboard
    database_url: str = ""
    anthropic_api_key: str
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440
    default_daily_quota: int = 50
    admin_daily_quota: int = 9999
    allowed_origins: str = "http://localhost:8080"

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    def model_post_init(self, __context):
        # Supabase et certains hébergeurs utilisent postgres:// 
        # SQLAlchemy 2+ requiert postgresql://
        url = self.database_url
        if url.startswith("postgres://"):
            object.__setattr__(
                self, "database_url",
                url.replace("postgres://", "postgresql://", 1)
            )

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
