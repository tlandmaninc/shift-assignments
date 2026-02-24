"""Groq AI provider (free tier: 14,400 requests/day)."""

from .openai import OpenAIProvider


class GroqProvider(OpenAIProvider):
    """Provider for the Groq API (OpenAI-compatible)."""

    def __init__(self, api_key: str, model: str = "llama-3.3-70b-versatile"):
        super().__init__(
            api_key=api_key,
            base_url="https://api.groq.com/openai/v1",
            model=model,
            provider_type="groq",
        )
