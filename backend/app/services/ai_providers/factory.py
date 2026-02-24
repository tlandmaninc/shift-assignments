"""Factory for creating AI providers based on configuration."""

from enum import Enum
from typing import Optional
from .base import AIProvider
from .ollama import OllamaProvider
from .gemini import GeminiProvider
from .openai import OpenAIProvider
from .groq import GroqProvider
from .together import TogetherProvider
from .openrouter import OpenRouterProvider


class AIProviderType(str, Enum):
    """Supported AI provider types."""
    GEMINI = "gemini"       # Google Gemini (free tier recommended)
    OLLAMA = "ollama"       # Local Ollama server
    OPENAI = "openai"       # OpenAI API (paid)
    GROQ = "groq"           # Groq (free tier)
    TOGETHER = "together"   # Together AI
    OPENROUTER = "openrouter"  # OpenRouter


def get_ai_provider(
    provider_type: str,
    # Gemini settings
    gemini_api_key: Optional[str] = None,
    gemini_model: str = "gemini-2.0-flash",
    # Ollama settings
    ollama_url: str = "http://localhost:11434",
    ollama_model: str = "qwen2.5:3b",
    # OpenAI settings
    openai_api_key: Optional[str] = None,
    openai_model: Optional[str] = None,
    # Groq settings
    groq_api_key: Optional[str] = None,
    groq_model: str = "llama-3.3-70b-versatile",
    # Together settings
    together_api_key: Optional[str] = None,
    together_model: str = "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
    # OpenRouter settings
    openrouter_api_key: Optional[str] = None,
    openrouter_model: str = "meta-llama/llama-3.2-3b-instruct:free",
) -> AIProvider:
    """
    Factory function to create the appropriate AI provider.

    Args:
        provider_type: One of the AIProviderType values
        gemini_api_key: API key for Google Gemini
        gemini_model: Gemini model to use
        ollama_url: URL for local Ollama server
        ollama_model: Ollama model to use
        openai_api_key: API key for OpenAI
        openai_model: Model for OpenAI
        groq_api_key: API key for Groq
        groq_model: Model for Groq
        together_api_key: API key for Together AI
        together_model: Model for Together AI
        openrouter_api_key: API key for OpenRouter
        openrouter_model: Model for OpenRouter

    Returns:
        Configured AIProvider instance
    """
    provider_type = provider_type.lower()

    if provider_type == AIProviderType.GEMINI:
        return GeminiProvider(
            api_key=gemini_api_key or "",
            model=gemini_model,
        )

    elif provider_type == AIProviderType.OLLAMA:
        return OllamaProvider(
            base_url=ollama_url,
            model=ollama_model,
        )

    elif provider_type == AIProviderType.GROQ:
        return GroqProvider(
            api_key=groq_api_key or "",
            model=groq_model,
        )

    elif provider_type == AIProviderType.TOGETHER:
        return TogetherProvider(
            api_key=together_api_key or "",
            model=together_model,
        )

    elif provider_type == AIProviderType.OPENROUTER:
        return OpenRouterProvider(
            api_key=openrouter_api_key or "",
            model=openrouter_model,
        )

    elif provider_type == AIProviderType.OPENAI:
        return OpenAIProvider(
            api_key=openai_api_key or "",
            model=openai_model or "gpt-4o-mini",
            provider_type="openai",
        )

    else:
        # Default to Gemini for free deployment
        return GeminiProvider(
            api_key=gemini_api_key or "",
            model=gemini_model,
        )


def get_available_providers() -> dict:
    """
    Return information about available providers and how to configure them.

    Returns:
        Dict with provider info including free tier details
    """
    return {
        "gemini": {
            "name": "Google Gemini",
            "free_tier": True,
            "free_limits": "15 RPM, 1M tokens/min, 1500 req/day",
            "setup_url": "https://aistudio.google.com/app/apikey",
            "env_vars": ["GEMINI_API_KEY"],
            "recommended": True,
        },
        "groq": {
            "name": "Groq",
            "free_tier": True,
            "free_limits": "14,400 requests/day, very fast",
            "setup_url": "https://console.groq.com",
            "env_vars": ["GROQ_API_KEY"],
        },
        "ollama": {
            "name": "Ollama (Local)",
            "free_tier": True,
            "free_limits": "Unlimited (runs locally)",
            "setup_url": "https://ollama.ai",
            "env_vars": ["OLLAMA_URL", "OLLAMA_MODEL"],
            "note": "Requires local installation and compute resources",
        },
        "openrouter": {
            "name": "OpenRouter",
            "free_tier": True,
            "free_limits": "Some free models available",
            "setup_url": "https://openrouter.ai",
            "env_vars": ["OPENROUTER_API_KEY"],
        },
        "together": {
            "name": "Together AI",
            "free_tier": True,
            "free_limits": "Free tier available",
            "setup_url": "https://api.together.xyz",
            "env_vars": ["TOGETHER_API_KEY"],
        },
        "openai": {
            "name": "OpenAI",
            "free_tier": False,
            "free_limits": "N/A (paid only)",
            "setup_url": "https://platform.openai.com",
            "env_vars": ["OPENAI_API_KEY"],
        },
    }
