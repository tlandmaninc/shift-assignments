"""OpenRouter AI provider (some free models available)."""

from .openai import OpenAIProvider


class OpenRouterProvider(OpenAIProvider):
    """Provider for the OpenRouter API (OpenAI-compatible)."""

    def __init__(
        self,
        api_key: str,
        model: str = "meta-llama/llama-3.2-3b-instruct:free",
    ):
        super().__init__(
            api_key=api_key,
            base_url="https://openrouter.ai/api/v1",
            model=model,
            provider_type="openrouter",
        )
