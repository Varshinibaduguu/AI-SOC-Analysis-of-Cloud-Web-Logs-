import os
from functools import lru_cache
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "AI SOC ANALYSIS SYSTEM"
    debug: bool = False
    secret_key: str = "dev-secret-change-in-production"
    api_prefix: str = "/api/v1"

    database_url: str = "postgresql+asyncpg://soc_user:soc_password@localhost:5432/soc_copilot"

    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 7
    algorithm: str = "HS256"

    cors_origins: str = "http://localhost:3000"

    llm_provider: str = "openai"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-1.5-flash"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"

    embedding_provider: str = "huggingface"
    huggingface_embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"

    chroma_persist_dir: str = "./chroma_data"
    chroma_collection: str = "security_knowledge"

    upload_dir: str = "./uploads"
    max_upload_size_mb: int = 25
    allowed_extensions: str = ".pdf,.docx,.txt,.json,.csv,.log"

    rate_limit: str = "60/minute"

    # Use TF-based SimpleVectorStore instead of ChromaDB + HuggingFace (Render free tier)
    lightweight_rag: bool = False

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        """Render/Heroku provide postgres:// — SQLAlchemy async needs postgresql+asyncpg://."""
        if not isinstance(value, str):
            return value
        if value.startswith("postgres://"):
            return value.replace("postgres://", "postgresql+asyncpg://", 1)
        if value.startswith("postgresql://") and "+asyncpg" not in value:
            return value.replace("postgresql://", "postgresql+asyncpg://", 1)
        return value

    @property
    def use_lightweight_rag(self) -> bool:
        if self.lightweight_rag:
            return True
        return os.getenv("RENDER", "").lower() in ("true", "1", "yes")

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def allowed_ext_list(self) -> List[str]:
        return [e.strip().lower() for e in self.allowed_extensions.split(",") if e.strip()]

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
