"""Application configuration using Pydantic Settings."""

from pydantic_settings import BaseSettings
from pydantic import ConfigDict, Field, field_validator
from functools import lru_cache
from pathlib import Path


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Security
    secret_key: str = Field(..., min_length=32)
    jwt_signing_key: str = ""
    encryption_key: str = ""

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

    # Google Form Template (optional)
    # Create a template form in Google Forms with the header image configured,
    # then set this to the form ID (from the URL: docs.google.com/forms/d/{FORM_ID}/edit)
    google_form_template_id: str = ""

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

    # OpenAI Configuration
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    # Groq Configuration (FREE - https://console.groq.com)
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"

    # Together AI Configuration (https://api.together.xyz)
    together_api_key: str = ""
    together_model: str = "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo"

    # OpenRouter Configuration (https://openrouter.ai)
    openrouter_api_key: str = ""
    openrouter_model: str = "meta-llama/llama-3.2-3b-instruct:free"

    # Firebase Authentication (for phone OTP)
    firebase_project_id: str = ""
    firebase_service_account_json_base64: str = ""

    # GitHub Integration (placeholder for future use)
    github_token: str = ""
    github_repo: str = ""

    model_config = ConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

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

    @property
    def exchanges_file(self) -> Path:
        return self.data_dir / "exchanges.json"

    @property
    def chat_history_file(self) -> Path:
        return self.data_dir / "chat_history.json"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
