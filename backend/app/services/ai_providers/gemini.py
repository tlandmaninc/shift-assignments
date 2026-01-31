"""Google Gemini AI provider using the free API tier."""

import httpx
from typing import Optional
from .base import AIProvider, AIResponse


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
        "gemini-2.0-flash": "gemini-2.0-flash",  # Latest, fastest
        "gemini-1.5-flash": "gemini-1.5-flash",  # Fast and capable
        "gemini-1.5-pro": "gemini-1.5-pro",      # Most capable
        "gemini-pro": "gemini-pro",              # Legacy
    }

    def __init__(
        self,
        api_key: str,
        model: str = "gemini-2.0-flash",
    ):
        self.api_key = api_key
        self.model = self.MODELS.get(model, model)
        self.base_url = "https://generativelanguage.googleapis.com/v1beta"

    @property
    def provider_name(self) -> str:
        return "gemini"

    @property
    def model_name(self) -> str:
        return self.model

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

    async def chat(
        self,
        messages: list[dict],
        system_prompt: Optional[str] = None,
        max_tokens: int = 512,
    ) -> AIResponse:
        """Send chat request to Gemini API."""
        if not self.api_key:
            return AIResponse(
                success=False,
                content=None,
                error="GEMINI_API_KEY not configured",
                provider=self.provider_name,
                model=self.model,
            )

        try:
            contents, system_instruction = self._convert_messages_to_gemini_format(
                messages, system_prompt
            )

            # Build request body
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
                    f"{self.base_url}/models/{self.model}:generateContent",
                    params={"key": self.api_key},
                    json=request_body,
                    timeout=60.0,
                )

                if response.status_code != 200:
                    error_detail = response.json().get("error", {}).get("message", response.text)
                    return AIResponse(
                        success=False,
                        content=None,
                        error=f"Gemini API error: {error_detail}",
                        provider=self.provider_name,
                        model=self.model,
                    )

                result = response.json()

                # Extract text from response
                candidates = result.get("candidates", [])
                if not candidates:
                    return AIResponse(
                        success=False,
                        content=None,
                        error="No response generated",
                        provider=self.provider_name,
                        model=self.model,
                    )

                content_parts = candidates[0].get("content", {}).get("parts", [])
                text_content = "".join(
                    part.get("text", "") for part in content_parts
                )

                return AIResponse(
                    success=True,
                    content=text_content,
                    provider=self.provider_name,
                    model=self.model,
                )

        except httpx.TimeoutException:
            return AIResponse(
                success=False,
                content=None,
                error="Request to Gemini timed out. Try again.",
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
