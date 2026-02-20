"""Ollama AI provider for local LLM inference."""

import json
import httpx
from collections.abc import AsyncGenerator
from typing import Optional
from .base import AIProvider, AIResponse


class OllamaProvider(AIProvider):
    """Provider for Ollama local LLM server."""

    def __init__(self, base_url: str = "http://localhost:11434", model: str = "qwen2.5:3b"):
        self.base_url = base_url.rstrip("/")
        self.model = model

    @property
    def provider_name(self) -> str:
        return "ollama"

    @property
    def model_name(self) -> str:
        return self.model

    async def check_health(self) -> dict:
        """Check if Ollama is running and model is available."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/api/tags",
                    timeout=5.0
                )

                if response.status_code != 200:
                    return {
                        "connected": False,
                        "model_available": False,
                        "model_name": self.model,
                        "provider": self.provider_name,
                        "error": f"Ollama returned status {response.status_code}",
                    }

                models = response.json().get("models", [])
                model_names = [m.get("name", "") for m in models]

                model_available = any(
                    self.model in name or name.startswith(self.model.split(":")[0])
                    for name in model_names
                )

                return {
                    "connected": True,
                    "model_available": model_available,
                    "model_name": self.model,
                    "provider": self.provider_name,
                    "available_models": model_names,
                    "error": None if model_available else f"Model {self.model} not found",
                }

        except httpx.ConnectError:
            return {
                "connected": False,
                "model_available": False,
                "model_name": self.model,
                "provider": self.provider_name,
                "error": "Cannot connect to Ollama. Is it running? Start with: ollama serve",
            }
        except httpx.TimeoutException:
            return {
                "connected": False,
                "model_available": False,
                "model_name": self.model,
                "provider": self.provider_name,
                "error": "Connection to Ollama timed out",
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
        """Stream chat response from Ollama."""
        all_messages = []
        if system_prompt:
            all_messages.append({"role": "system", "content": system_prompt})
        all_messages.extend(messages)

        async with httpx.AsyncClient() as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/api/chat",
                json={
                    "model": self.model,
                    "messages": all_messages,
                    "stream": True,
                    "options": {"num_predict": max_tokens},
                    "think": False,
                },
                timeout=180.0,
            ) as response:
                if response.status_code != 200:
                    body = await response.aread()
                    raise RuntimeError(f"Ollama error ({response.status_code}): {body.decode()[:200]}")

                async for line in response.aiter_lines():
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    content = data.get("message", {}).get("content", "")
                    if content:
                        yield content
                    if data.get("done"):
                        break

    async def chat(
        self,
        messages: list[dict],
        system_prompt: Optional[str] = None,
        max_tokens: int = 512,
    ) -> AIResponse:
        """Send chat request to Ollama."""
        try:
            # Build messages with optional system prompt
            all_messages = []
            if system_prompt:
                all_messages.append({"role": "system", "content": system_prompt})
            all_messages.extend(messages)

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/api/chat",
                    json={
                        "model": self.model,
                        "messages": all_messages,
                        "stream": False,
                        "options": {
                            "num_predict": max_tokens,
                        },
                        "think": False,
                    },
                    timeout=180.0,
                )

                if response.status_code != 200:
                    return AIResponse(
                        success=False,
                        content=None,
                        error=f"Ollama returned status {response.status_code}: {response.text}",
                        provider=self.provider_name,
                        model=self.model,
                    )

                result = response.json()
                content = result.get("message", {}).get("content", "")

                return AIResponse(
                    success=True,
                    content=content,
                    provider=self.provider_name,
                    model=self.model,
                )

        except httpx.ConnectError:
            return AIResponse(
                success=False,
                content=None,
                error="Cannot connect to Ollama. Please ensure Ollama is running.",
                provider=self.provider_name,
                model=self.model,
            )
        except httpx.TimeoutException:
            return AIResponse(
                success=False,
                content=None,
                error="Request timed out. Try a simpler question.",
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
