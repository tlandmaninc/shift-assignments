"""Base class for AI providers."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass
class AIResponse:
    """Standardized response from any AI provider."""
    success: bool
    content: Optional[str]
    error: Optional[str] = None
    provider: str = "unknown"
    model: str = "unknown"


class AIProvider(ABC):
    """Abstract base class for AI providers."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Return the provider name."""
        pass

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Return the model name being used."""
        pass

    @abstractmethod
    async def check_health(self) -> dict:
        """
        Check if the provider is available and configured.

        Returns:
            dict with keys:
                - connected: bool
                - model_available: bool
                - model_name: str
                - provider: str
                - error: Optional[str]
        """
        pass

    @abstractmethod
    async def chat(
        self,
        messages: list[dict],
        system_prompt: Optional[str] = None,
        max_tokens: int = 512,
    ) -> AIResponse:
        """
        Send a chat request to the AI provider.

        Args:
            messages: List of message dicts with 'role' and 'content' keys
            system_prompt: Optional system prompt to prepend
            max_tokens: Maximum tokens in response

        Returns:
            AIResponse with the result
        """
        pass

    def _format_error(self, error: Exception) -> str:
        """Format exception into user-friendly error message."""
        error_type = type(error).__name__
        return f"{self.provider_name} error ({error_type}): {str(error)}"
