"""Chat service for AI-powered data queries via multiple AI providers.

Supports:
- Gemini (recommended for free deployment)
- Ollama (for local development)
- Groq, Together, OpenRouter (free tiers)
- OpenAI (paid)
"""

from collections.abc import AsyncGenerator
from datetime import datetime
from typing import Optional
from ..storage import Storage
from ..config import settings
from .ai_providers import get_ai_provider, AIProvider


class ChatService:
    """Service for handling AI chat interactions with multiple provider support."""

    def __init__(self, storage: Storage):
        self.storage = storage
        self._provider: Optional[AIProvider] = None

    @property
    def provider(self) -> AIProvider:
        """Lazy-load the AI provider based on settings."""
        if self._provider is None:
            self._provider = get_ai_provider(
                provider_type=settings.ai_provider,
                gemini_api_key=settings.gemini_api_key,
                gemini_model=settings.gemini_model,
                ollama_url=settings.ollama_url,
                ollama_model=settings.ollama_model,
                openai_api_key=settings.openai_api_key,
                openai_base_url=settings.openai_base_url or None,
                openai_model=settings.openai_model or None,
            )
        return self._provider

    def reset_provider(self):
        """Reset provider to pick up config changes."""
        self._provider = None

    def _format_employees(self, employees: list[dict]) -> str:
        """Format employee data for context."""
        if not employees:
            return "No employees found."

        active = [e for e in employees if e.get("is_active", True)]
        lines = []
        for emp in active:
            status = "new employee" if emp.get("is_new", True) else "experienced"
            lines.append(f"- {emp['name']} ({status})")

        return "\n".join(lines)

    def _format_assignments(self, assignments: list[dict], limit: int = 50) -> str:
        """Format recent assignments for context."""
        if not assignments:
            return "No assignments found."

        # Sort by date descending and limit
        sorted_assignments = sorted(
            assignments,
            key=lambda x: x.get("date", ""),
            reverse=True
        )[:limit]

        lines = []
        for a in sorted_assignments:
            date_str = a.get("date", "unknown")
            emp = a.get("employee_name", "unknown")
            lines.append(f"- {date_str}: {emp}")

        return "\n".join(lines)

    def _format_monthly_summaries(self, summaries: list[dict]) -> str:
        """Format monthly summaries for context."""
        if not summaries:
            return "No monthly data available."

        lines = []
        for s in summaries[:12]:  # Last 12 months
            lines.append(
                f"- {s['month_year']}: {s['total_shifts']} shifts, "
                f"{s['employees_count']} employees"
            )

        return "\n".join(lines)

    def _format_employee_stats(self, stats: list[dict]) -> str:
        """Format employee statistics for context."""
        if not stats:
            return "No employee statistics available."

        # Sort by total shifts descending
        sorted_stats = sorted(
            stats,
            key=lambda x: x.get("total_shifts", 0),
            reverse=True
        )

        lines = []
        for s in sorted_stats:
            last_shift = s.get("last_shift_date", "never")
            lines.append(
                f"- {s['name']}: {s['total_shifts']} total shifts, "
                f"active {s['months_active']} months, last shift: {last_shift}"
            )

        return "\n".join(lines)

    def _calculate_fairness_metrics(self, stats: list[dict]) -> dict:
        """Calculate fairness metrics from employee stats."""
        if not stats:
            return {"fairness_score": 0, "average": 0, "std_dev": 0}

        shifts = [s.get("total_shifts", 0) for s in stats if s.get("total_shifts", 0) > 0]
        if not shifts:
            return {"fairness_score": 100, "average": 0, "std_dev": 0}

        avg = sum(shifts) / len(shifts)
        variance = sum((x - avg) ** 2 for x in shifts) / len(shifts)
        std_dev = variance ** 0.5

        # Fairness score: 100 - (coefficient of variation * 100)
        # CV = std_dev / mean, lower is more fair
        if avg > 0:
            cv = std_dev / avg
            fairness_score = max(0, min(100, 100 - (cv * 100)))
        else:
            fairness_score = 100

        return {
            "fairness_score": round(fairness_score, 1),
            "average_shifts": round(avg, 1),
            "std_deviation": round(std_dev, 2),
            "min_shifts": min(shifts),
            "max_shifts": max(shifts),
        }

    def _build_data_context(self) -> str:
        """Build compact context from data sources."""
        employee_stats = self.storage.get_employee_stats(active_only=True)
        fairness = self._calculate_fairness_metrics(employee_stats)
        assignments = self.storage.get_assignments()

        # Only include top 10 employees by shift count
        sorted_stats = sorted(
            employee_stats,
            key=lambda x: x.get("total_shifts", 0),
            reverse=True
        )[:10]

        emp_lines = [f"- {s['name']}: {s['total_shifts']} shifts" for s in sorted_stats]

        # Only include last 10 assignments
        recent = sorted(assignments, key=lambda x: x.get("date", ""), reverse=True)[:10]
        assign_lines = [f"- {a['date']}: {a['employee_name']}" for a in recent]

        context = f"""Date: {datetime.now().strftime("%Y-%m-%d")}

Employees (by shifts):
{chr(10).join(emp_lines)}

Recent assignments:
{chr(10).join(assign_lines)}

Fairness: {fairness['fairness_score']}%, Avg: {fairness['average_shifts']} shifts"""
        return context

    def _build_system_prompt(self, context: str) -> str:
        """Build system prompt with context."""
        return f"""You are a shift scheduling assistant. Answer briefly using this data:

{context}

Be concise. Answer in 1-2 sentences."""

    async def check_health(self) -> dict:
        """Check if the AI provider is available and configured."""
        result = await self.provider.check_health()

        # Add backwards-compatible fields for existing frontend
        return {
            "connected": result.get("connected", False),
            "model_available": result.get("model_available", False),
            "model_name": result.get("model_name", "unknown"),
            "provider": result.get("provider", self.provider.provider_name),
            "error": result.get("error"),
            # Legacy fields for backwards compatibility
            "ollama_connected": result.get("connected", False),
            "available_models": result.get("available_models", []),
        }

    def _build_messages(
        self,
        message: str,
        conversation_history: Optional[list[dict]] = None,
    ) -> list[dict]:
        """Build messages array from history and current message."""
        messages = []
        if conversation_history:
            for msg in conversation_history:
                messages.append({
                    "role": msg.get("role", "user"),
                    "content": msg.get("content", ""),
                })
        messages.append({"role": "user", "content": message})
        return messages

    async def chat(
        self,
        message: str,
        conversation_history: Optional[list[dict]] = None
    ) -> dict:
        """Send message to AI provider and get response."""
        context = self._build_data_context()
        system_prompt = self._build_system_prompt(context)
        messages = self._build_messages(message, conversation_history)

        result = await self.provider.chat(
            messages=messages,
            system_prompt=system_prompt,
            max_tokens=512,
        )

        return {
            "success": result.success,
            "content": result.content,
            "error": result.error,
            "provider": result.provider,
            "model": result.model,
        }

    async def stream_chat(
        self,
        message: str,
        conversation_history: Optional[list[dict]] = None,
    ) -> AsyncGenerator[str, None]:
        """Stream chat response as async generator of text chunks."""
        context = self._build_data_context()
        system_prompt = self._build_system_prompt(context)
        messages = self._build_messages(message, conversation_history)

        async for chunk in self.provider.stream_chat(
            messages=messages,
            system_prompt=system_prompt,
            max_tokens=512,
        ):
            yield chunk
