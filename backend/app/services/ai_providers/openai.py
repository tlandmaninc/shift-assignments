"""OpenAI-compatible API provider."""

import json
import httpx
from collections.abc import AsyncGenerator
from typing import Optional
from .base import AIProvider, AIResponse


class OpenAIProvider(AIProvider):
    """
    Provider for OpenAI-compatible APIs.

    Serves as a base class for subclasses targeting specific
    OpenAI-compatible services (Groq, Together, OpenRouter, etc.).
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.openai.com/v1",
        model: str = "gpt-4o-mini",
        provider_type: str = "openai",
    ):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.provider_type = provider_type

    @property
    def provider_name(self) -> str:
        return f"openai-compatible ({self.provider_type})"

    @property
    def model_name(self) -> str:
        return self.model

    async def check_health(self) -> dict:
        """Check if the OpenAI-compatible API is accessible."""
        if not self.api_key:
            return {
                "connected": False,
                "model_available": False,
                "model_name": self.model,
                "provider": self.provider_name,
                "error": f"API key not configured for {self.provider_type}",
            }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/models",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    timeout=10.0,
                )

                if response.status_code == 200:
                    models_data = response.json()
                    available = models_data.get("data", [])
                    model_ids = [m.get("id", "") for m in available]

                    model_available = self.model in model_ids or len(model_ids) > 0

                    return {
                        "connected": True,
                        "model_available": model_available,
                        "model_name": self.model,
                        "provider": self.provider_name,
                        "error": None,
                    }
                elif response.status_code == 401:
                    return {
                        "connected": False,
                        "model_available": False,
                        "model_name": self.model,
                        "provider": self.provider_name,
                        "error": "Invalid API key",
                    }
                else:
                    return {
                        "connected": False,
                        "model_available": False,
                        "model_name": self.model,
                        "provider": self.provider_name,
                        "error": f"API returned status {response.status_code}",
                    }

        except httpx.TimeoutException:
            return {
                "connected": False,
                "model_available": False,
                "model_name": self.model,
                "provider": self.provider_name,
                "error": "Connection timed out",
            }
        except Exception as e:
            return {
                "connected": False,
                "model_available": False,
                "model_name": self.model,
                "provider": self.provider_name,
                "error": str(e),
            }

    async def stream_chat(
        self,
        messages: list[dict],
        system_prompt: Optional[str] = None,
        max_tokens: int = 512,
    ) -> AsyncGenerator[str, None]:
        """Stream chat response from OpenAI-compatible API."""
        if not self.api_key:
            raise RuntimeError(f"API key not configured for {self.provider_type}")

        all_messages = []
        if system_prompt:
            all_messages.append({"role": "system", "content": system_prompt})
        all_messages.extend(messages)

        async with httpx.AsyncClient() as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.model,
                    "messages": all_messages,
                    "max_tokens": max_tokens,
                    "temperature": 0.7,
                    "stream": True,
                },
                timeout=60.0,
            ) as response:
                if response.status_code != 200:
                    body = await response.aread()
                    raise RuntimeError(f"API error ({response.status_code}): {body.decode()[:200]}")

                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data_str = line[6:]
                    if data_str == "[DONE]":
                        break
                    try:
                        data = json.loads(data_str)
                    except json.JSONDecodeError:
                        continue
                    content = data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                    if content:
                        yield content

    async def chat(
        self,
        messages: list[dict],
        system_prompt: Optional[str] = None,
        max_tokens: int = 512,
    ) -> AIResponse:
        """Send chat request to OpenAI-compatible API."""
        if not self.api_key:
            return AIResponse(
                success=False,
                content=None,
                error=f"API key not configured for {self.provider_type}",
                provider=self.provider_name,
                model=self.model,
            )

        try:
            # Build messages with optional system prompt
            all_messages = []
            if system_prompt:
                all_messages.append({"role": "system", "content": system_prompt})
            all_messages.extend(messages)

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "messages": all_messages,
                        "max_tokens": max_tokens,
                        "temperature": 0.7,
                    },
                    timeout=60.0,
                )

                if response.status_code != 200:
                    error_data = response.json()
                    error_msg = error_data.get("error", {}).get("message", response.text)
                    return AIResponse(
                        success=False,
                        content=None,
                        error=f"API error: {error_msg}",
                        provider=self.provider_name,
                        model=self.model,
                    )

                result = response.json()
                choices = result.get("choices", [])

                if not choices:
                    return AIResponse(
                        success=False,
                        content=None,
                        error="No response generated",
                        provider=self.provider_name,
                        model=self.model,
                    )

                content = choices[0].get("message", {}).get("content", "")

                return AIResponse(
                    success=True,
                    content=content,
                    provider=self.provider_name,
                    model=self.model,
                )

        except httpx.TimeoutException:
            return AIResponse(
                success=False,
                content=None,
                error="Request timed out. Try again.",
                provider=self.provider_name,
                model=self.model,
            )
        except Exception as e:
            return AIResponse(
                success=False,
                content=None,
                error=self._format_error(e),
                provider=self.provider_name,
                model=self.model,
            )
