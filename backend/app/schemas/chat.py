"""Pydantic schemas for chat API."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    """Single chat message."""
    role: str = Field(..., pattern="^(user|assistant|system)$")
    content: str = Field(..., min_length=1, max_length=10000)
    timestamp: Optional[str] = None


class ChatRequest(BaseModel):
    """Request to send a chat message."""
    message: str = Field(..., min_length=1, max_length=2000)
    conversation_history: list[ChatMessage] = []


class ChatResponse(BaseModel):
    """Response from chat endpoint."""
    success: bool
    message: ChatMessage
    error: Optional[str] = None


class ChatHealthResponse(BaseModel):
    """Response from health check endpoint."""
    model_config = {"protected_namespaces": ()}

    connected: bool = False
    model_available: bool = False
    model_name: str = "unknown"
    provider: str = "unknown"
    error: Optional[str] = None
    # Legacy field for backwards compatibility
    ollama_connected: bool = False
