"""Together AI provider."""

from .openai import OpenAIProvider


class TogetherProvider(OpenAIProvider):
    """Provider for the Together AI API (OpenAI-compatible)."""

    def __init__(
        self,
        api_key: str,
        model: str = "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
    ):
        super().__init__(
            api_key=api_key,
            base_url="https://api.together.xyz/v1",
            model=model,
            provider_type="together",
        )
