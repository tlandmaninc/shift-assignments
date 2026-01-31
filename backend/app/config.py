"""Application configuration using Pydantic Settings."""

from pydantic_settings import BaseSettings
from pydantic import Field, field_validator
from functools import lru_cache
from pathlib import Path


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Security
    secret_key: str = Field(..., min_length=32)

    @field_validator('secret_key')
    @classmethod
    def validate_secret_key(cls, v):
        if v == "change-this-in-production":
            raise ValueError("SECRET_KEY must be changed from default value")
        return v

    # Frontend
    frontend_url: str = "http://localhost:3000"

    # Environment
    environment: str = "development"

    # Paths
    base_dir: Path = Path(__file__).resolve().parent.parent
    data_dir: Path = base_dir / "data"

    # Google OAuth (optional)
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/google/callback"

    # AI Provider Configuration
    # Supported: gemini (recommended), ollama, groq, together, openrouter, openai
    ai_provider: str = "gemini"

    # Gemini Configuration (FREE - recommended for deployment)
    # Get your free API key at: https://aistudio.google.com/app/apikey
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"

    # Ollama Configuration (FREE - for local development)
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:3b"

    # OpenAI-compatible Configuration (for Groq, Together, OpenRouter, OpenAI)
    # Groq (FREE): https://console.groq.com
    # Together: https://api.together.xyz
    # OpenRouter: https://openrouter.ai
    openai_api_key: str = ""
    openai_base_url: str = ""
    openai_model: str = ""

    # GitHub Integration (placeholder for future use)
    github_token: str = ""
    github_repo: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

    @property
    def employees_file(self) -> Path:
        return self.data_dir / "employees.json"

    @property
    def forms_file(self) -> Path:
        return self.data_dir / "forms.json"

    @property
    def assignments_dir(self) -> Path:
        return self.data_dir / "assignments"

    @property
    def history_file(self) -> Path:
        return self.data_dir / "history.json"

    @property
    def users_file(self) -> Path:
        return self.data_dir / "users.json"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
