"""Chat API router for AI-powered data queries."""

from datetime import datetime
from fastapi import APIRouter
from ..schemas.chat import ChatRequest, ChatResponse, ChatMessage, ChatHealthResponse
from ..services.chat_service import ChatService
from ..storage import storage

router = APIRouter(prefix="/chat", tags=["chat"])

# Initialize chat service
chat_service = ChatService(storage)


@router.get("/health", response_model=ChatHealthResponse)
async def check_health():
    """Check if the AI provider is available and configured."""
    result = await chat_service.check_health()
    return ChatHealthResponse(
        connected=result.get("connected", False),
        model_available=result.get("model_available", False),
        model_name=result.get("model_name", "unknown"),
        provider=result.get("provider", "unknown"),
        error=result.get("error"),
        ollama_connected=result.get("ollama_connected", False),
    )


@router.post("", response_model=ChatResponse)
async def send_message(request: ChatRequest):
    """Send a message and get AI response."""
    # Convert conversation history to dict format
    history = [
        {"role": msg.role, "content": msg.content}
        for msg in request.conversation_history
    ]

    # Send to chat service
    result = await chat_service.chat(
        message=request.message,
        conversation_history=history,
    )

    if result["success"]:
        return ChatResponse(
            success=True,
            message=ChatMessage(
                role="assistant",
                content=result["content"],
                timestamp=datetime.now().isoformat(),
            ),
        )
    else:
        return ChatResponse(
            success=False,
            message=ChatMessage(
                role="assistant",
                content=result.get("error", "An error occurred"),
                timestamp=datetime.now().isoformat(),
            ),
            error=result.get("error"),
        )
