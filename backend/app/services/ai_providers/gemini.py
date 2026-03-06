"""Google Gemini AI provider using the free API tier."""

import json
import time
import httpx
from collections.abc import AsyncGenerator
from typing import Optional
from .base import AIProvider, AIResponse

# Cooldown in seconds before retrying a model after a 429.
# Gemini free-tier per-minute limits reset quickly; 60s is enough.
_DEFAULT_COOLDOWN_SECONDS = 60


class GeminiProvider(AIProvider):
    """
    Provider for Google Gemini API (free tier).

    Free tier limits (as of 2024):
    - 15 requests per minute
    - 1 million tokens per minute
    - 1500 requests per day

    Get your free API key at: https://aistudio.google.com/app/apikey
    """

    # Available free models
    MODELS = {
        "gemini-2.5-flash": "gemini-2.5-flash",  # Latest, fastest, thinking model
        "gemini-2.5-pro": "gemini-2.5-pro",      # Most capable
        "gemini-2.0-flash": "gemini-2.0-flash",  # Fast and capable
        "gemini-2.0-flash-lite": "gemini-2.0-flash-lite",  # Lightweight fallback
        "gemini-pro": "gemini-pro",              # Legacy
    }

    # Ordered fallback chain for daily quota exhaustion
    FALLBACK_CHAIN = [
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
    ]

    def __init__(
        self,
        api_key: str,
        model: str = "gemini-2.0-flash",
        cooldown_seconds: int = _DEFAULT_COOLDOWN_SECONDS,
    ):
        self.api_key = api_key
        self.model = self.MODELS.get(model, model)
        self.base_url = "https://generativelanguage.googleapis.com/v1beta"
        self._cooldown_seconds = cooldown_seconds
        # Maps model name -> monotonic timestamp when it was rate-limited.
        # Entries auto-expire after _cooldown_seconds.
        self._rate_limited_until: dict[str, float] = {}

    @property
    def provider_name(self) -> str:
        return "gemini"

    @property
    def model_name(self) -> str:
        return self.model

    @staticmethod
    def _is_quota_error(error_msg: str) -> bool:
        """Detect HTTP 429 quota/rate-limit errors."""
        return "429" in error_msg

    def _mark_rate_limited(self, model: str) -> None:
        """Record that a model hit a 429; it will be skipped until cooldown expires."""
        self._rate_limited_until[model] = time.monotonic() + self._cooldown_seconds

    def _is_cooled_down(self, model: str) -> bool:
        """Return True if the model is available (not rate-limited or cooldown expired)."""
        deadline = self._rate_limited_until.get(model)
        if deadline is None:
            return True
        if time.monotonic() >= deadline:
            del self._rate_limited_until[model]
            return True
        return False

    def _clear_rate_limit(self, model: str) -> None:
        """Clear cooldown for a model after a successful request."""
        self._rate_limited_until.pop(model, None)

    def _build_model_sequence(self) -> list[str]:
        """Return the ordered list of models to try, skipping cooled-down ones."""
        if self.model in self.FALLBACK_CHAIN:
            start = self.FALLBACK_CHAIN.index(self.model)
            chain = self.FALLBACK_CHAIN[start:]
        else:
            chain = [self.model]
        return [m for m in chain if self._is_cooled_down(m)]

    async def check_health(self) -> dict:
        """Check if Gemini API is accessible with the provided key."""
        if not self.api_key:
            return {
                "connected": False,
                "model_available": False,
                "model_name": self.model,
                "provider": self.provider_name,
                "error": "GEMINI_API_KEY not configured. Get one at https://aistudio.google.com/app/apikey",
            }

        try:
            async with httpx.AsyncClient() as client:
                # Test with a minimal request
                response = await client.get(
                    f"{self.base_url}/models/{self.model}",
                    params={"key": self.api_key},
                    timeout=10.0,
                )

                if response.status_code == 200:
                    return {
                        "connected": True,
                        "model_available": True,
                        "model_name": self.model,
                        "provider": self.provider_name,
                        "error": None,
                    }
                elif response.status_code == 400:
                    return {
                        "connected": True,
                        "model_available": False,
                        "model_name": self.model,
                        "provider": self.provider_name,
                        "error": f"Invalid API key or model: {self.model}",
                    }
                elif response.status_code == 403:
                    return {
                        "connected": True,
                        "model_available": False,
                        "model_name": self.model,
                        "provider": self.provider_name,
                        "error": "API key lacks permission. Check your Google AI Studio settings.",
                    }
                else:
                    return {
                        "connected": False,
                        "model_available": False,
                        "model_name": self.model,
                        "provider": self.provider_name,
                        "error": f"Gemini API returned status {response.status_code}",
                    }

        except httpx.TimeoutException:
            return {
                "connected": False,
                "model_available": False,
                "model_name": self.model,
                "provider": self.provider_name,
                "error": "Connection to Gemini API timed out",
            }
        except Exception as e:
            return {
                "connected": False,
                "model_available": False,
                "model_name": self.model,
                "provider": self.provider_name,
                "error": str(e),
            }

    def _convert_messages_to_gemini_format(
        self,
        messages: list[dict],
        system_prompt: Optional[str] = None,
    ) -> tuple[list[dict], Optional[dict]]:
        """
        Convert OpenAI-style messages to Gemini format.

        Gemini uses a different format:
        - 'contents' array with 'role' (user/model) and 'parts'
        - System instruction is separate
        """
        contents = []
        system_instruction = None

        if system_prompt:
            system_instruction = {"parts": [{"text": system_prompt}]}

        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")

            # Map roles: assistant -> model, user stays user
            gemini_role = "model" if role == "assistant" else "user"

            # Skip system messages (handled separately)
            if role == "system":
                if not system_instruction:
                    system_instruction = {"parts": [{"text": content}]}
                continue

            contents.append({
                "role": gemini_role,
                "parts": [{"text": content}]
            })

        return contents, system_instruction

    async def _chat_with_model(
        self,
        model: str,
        messages: list[dict],
        system_prompt: Optional[str] = None,
        max_tokens: int = 512,
    ) -> AIResponse:
        """Send a single non-streaming request to the specified model."""
        contents, system_instruction = self._convert_messages_to_gemini_format(
            messages, system_prompt
        )

        request_body = {
            "contents": contents,
            "generationConfig": {
                "maxOutputTokens": max_tokens,
                "temperature": 0.7,
            },
        }
        if system_instruction:
            request_body["systemInstruction"] = system_instruction

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/models/{model}:generateContent",
                params={"key": self.api_key},
                json=request_body,
                timeout=60.0,
            )

            if response.status_code != 200:
                error_detail = response.json().get("error", {}).get("message", response.text)
                return AIResponse(
                    success=False,
                    content=None,
                    error=f"Gemini API error ({response.status_code}): {error_detail}",
                    provider=self.provider_name,
                    model=model,
                )

            result = response.json()
            candidates = result.get("candidates", [])
            if not candidates:
                return AIResponse(
                    success=False,
                    content=None,
                    error="No response generated",
                    provider=self.provider_name,
                    model=model,
                )

            content_parts = candidates[0].get("content", {}).get("parts", [])
            text_content = "".join(
                part.get("text", "") for part in content_parts
            )

            return AIResponse(
                success=True,
                content=text_content,
                provider=self.provider_name,
                model=model,
            )

    async def stream_chat(
        self,
        messages: list[dict],
        system_prompt: Optional[str] = None,
        max_tokens: int = 512,
    ) -> AsyncGenerator[str, None]:
        """Stream chat response from Gemini using SSE, with model fallback on quota errors."""
        if not self.api_key:
            raise RuntimeError("GEMINI_API_KEY not configured")

        contents, system_instruction = self._convert_messages_to_gemini_format(
            messages, system_prompt
        )
        request_body = {
            "contents": contents,
            "generationConfig": {
                "maxOutputTokens": max_tokens,
                "temperature": 0.7,
            },
        }
        if system_instruction:
            request_body["systemInstruction"] = system_instruction

        models_to_try = self._build_model_sequence()
        last_error = None

        for model in models_to_try:
            got_429 = False
            try:
                async with httpx.AsyncClient() as client:
                    async with client.stream(
                        "POST",
                        f"{self.base_url}/models/{model}:streamGenerateContent",
                        params={"key": self.api_key, "alt": "sse"},
                        json=request_body,
                        timeout=60.0,
                    ) as response:
                        if response.status_code != 200:
                            body = await response.aread()
                            error_msg = f"Gemini API error ({response.status_code}): {body.decode()[:200]}"
                            if self._is_quota_error(error_msg):
                                got_429 = True
                                last_error = error_msg
                            else:
                                raise RuntimeError(error_msg)
                        else:
                            self._clear_rate_limit(model)
                            self.model = model
                            async for line in response.aiter_lines():
                                if not line.startswith("data: "):
                                    continue
                                try:
                                    data = json.loads(line[6:])
                                except json.JSONDecodeError:
                                    continue
                                candidates = data.get("candidates", [])
                                if candidates:
                                    parts = candidates[0].get("content", {}).get("parts", [])
                                    for part in parts:
                                        text = part.get("text", "")
                                        if text:
                                            yield text
                            return  # streaming complete, exit generator
            except RuntimeError:
                raise  # non-429 errors propagate immediately

            if got_429:
                self._mark_rate_limited(model)
                continue

        raise RuntimeError(
            "All Gemini models are temporarily rate-limited. "
            f"Please wait about {self._cooldown_seconds} seconds and try again. "
            f"Last error: {last_error}"
        )

    async def chat(
        self,
        messages: list[dict],
        system_prompt: Optional[str] = None,
        max_tokens: int = 512,
    ) -> AIResponse:
        """Send chat request to Gemini API, with automatic model fallback on quota errors."""
        if not self.api_key:
            return AIResponse(
                success=False,
                content=None,
                error="GEMINI_API_KEY not configured",
                provider=self.provider_name,
                model=self.model,
            )

        models_to_try = self._build_model_sequence()
        last_error = None

        for model in models_to_try:
            try:
                result = await self._chat_with_model(model, messages, system_prompt, max_tokens)
            except httpx.TimeoutException:
                return AIResponse(
                    success=False,
                    content=None,
                    error="Request to Gemini timed out. Try again.",
                    provider=self.provider_name,
                    model=model,
                )
            except Exception as e:
                return AIResponse(
                    success=False,
                    content=None,
                    error=self._format_error(e),
                    provider=self.provider_name,
                    model=model,
                )

            if result.success:
                self._clear_rate_limit(model)
                self.model = model
                return result

            if self._is_quota_error(result.error or ""):
                self._mark_rate_limited(model)
                last_error = result.error
                continue  # try next model

            return result  # non-429 failure, return immediately

        # All fallback models temporarily rate-limited
        return AIResponse(
            success=False,
            content=None,
            error=(
                "All Gemini models are temporarily rate-limited. "
                f"Please wait about {self._cooldown_seconds} seconds and try again."
            ),
            provider=self.provider_name,
            model=self.model,
        )
