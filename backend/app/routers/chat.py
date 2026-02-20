"""Chat API router for AI-powered data queries."""

import json
import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from ..schemas.chat import (
    ChatRequest,
    ChatResponse,
    ChatMessage,
    ChatHealthResponse,
    ConversationSummary,
    ConversationDetail,
    ConversationListResponse,
)
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


@router.get("/conversations", response_model=ConversationListResponse)
async def list_conversations():
    """List all conversations (summaries only)."""
    summaries = storage.get_conversations()
    return ConversationListResponse(
        conversations=[ConversationSummary(**s) for s in summaries]
    )


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(conversation_id: str):
    """Get full conversation with messages."""
    conv = storage.get_conversation(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return ConversationDetail(**conv)


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str):
    """Delete a conversation."""
    deleted = storage.delete_conversation(conversation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"success": True}


def _resolve_conversation(request: ChatRequest) -> tuple[str, dict]:
    """Resolve or create a conversation for the request."""
    now = datetime.now().isoformat()
    conversation_id = request.conversation_id

    if conversation_id:
        conversation = storage.get_conversation(conversation_id)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return conversation_id, conversation

    conversation_id = f"conv_{uuid.uuid4().hex[:12]}"
    title = request.message[:80].strip()
    if len(request.message) > 80:
        title += "..."
    return conversation_id, {
        "id": conversation_id,
        "title": title,
        "created_at": now,
        "updated_at": now,
        "messages": [],
    }


@router.post("/stream")
async def stream_message(request: ChatRequest):
    """Stream a chat response using Server-Sent Events."""
    conversation_id, conversation = _resolve_conversation(request)
    now = datetime.now().isoformat()

    history = [
        {"role": msg.role, "content": msg.content}
        for msg in request.conversation_history
    ]

    # Save user message to conversation
    conversation["messages"].append({
        "role": "user",
        "content": request.message,
        "timestamp": now,
    })

    async def event_stream():
        # Send conversation_id first so frontend can track it
        yield f"data: {json.dumps({'conversation_id': conversation_id})}\n\n"

        full_content = ""
        error_occurred = False

        try:
            async for chunk in chat_service.stream_chat(
                message=request.message,
                conversation_history=history,
            ):
                full_content += chunk
                yield f"data: {json.dumps({'token': chunk})}\n\n"
        except Exception as e:
            error_occurred = True
            error_msg = str(e)
            full_content = error_msg
            yield f"data: {json.dumps({'error': error_msg})}\n\n"

        # Save assistant response to conversation
        conversation["messages"].append({
            "role": "assistant",
            "content": full_content,
            "timestamp": datetime.now().isoformat(),
        })
        storage.save_conversation(conversation)

        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("", response_model=ChatResponse)
async def send_message(request: ChatRequest):
    """Send a message and get AI response (non-streaming)."""
    conversation_id, conversation = _resolve_conversation(request)
    now = datetime.now().isoformat()

    history = [
        {"role": msg.role, "content": msg.content}
        for msg in request.conversation_history
    ]

    result = await chat_service.chat(
        message=request.message,
        conversation_history=history,
    )

    conversation["messages"].append({
        "role": "user",
        "content": request.message,
        "timestamp": now,
    })

    if result["success"]:
        assistant_content = result["content"]
        response_timestamp = datetime.now().isoformat()

        conversation["messages"].append({
            "role": "assistant",
            "content": assistant_content,
            "timestamp": response_timestamp,
        })
        storage.save_conversation(conversation)

        return ChatResponse(
            success=True,
            message=ChatMessage(
                role="assistant",
                content=assistant_content,
                timestamp=response_timestamp,
            ),
            conversation_id=conversation_id,
        )
    else:
        error_content = result.get("error", "An error occurred")

        conversation["messages"].append({
            "role": "assistant",
            "content": error_content,
            "timestamp": datetime.now().isoformat(),
        })
        storage.save_conversation(conversation)

        return ChatResponse(
            success=False,
            message=ChatMessage(
                role="assistant",
                content=error_content,
                timestamp=datetime.now().isoformat(),
            ),
            conversation_id=conversation_id,
            error=error_content,
        )
