"""Chat API router for AI-powered data queries."""

import asyncio
import json
import re
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
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
from .auth import get_required_user, require_employee_or_admin

router = APIRouter(prefix="/chat", tags=["chat"])
limiter = Limiter(key_func=get_remote_address)

_TOOL_CALL_RE = re.compile(r'```tool_call\s*\n?\s*\{.*?\}\s*\n?\s*```', re.DOTALL)


def _strip_tool_call_blocks(text: str) -> str:
    """Remove ```tool_call ... ``` blocks from text before streaming to user."""
    return _TOOL_CALL_RE.sub('', text).strip()

# Initialize chat service
chat_service = ChatService(storage)


def _check_conversation_access(conv: dict, user: dict) -> None:
    """Raise 403 if the user does not own the conversation (admins bypass)."""
    if user.get("role") == "admin":
        return
    if conv.get("user_id") and conv["user_id"] != user.get("id"):
        raise HTTPException(status_code=403, detail="Access denied")


def _require_ai_consent(user: dict) -> None:
    """Raise 403 if user has not given AI data processing consent."""
    user_id = user.get("id")
    if not user_id or not storage.get_ai_consent(user_id):
        raise HTTPException(
            status_code=403,
            detail="AI data processing consent required",
        )


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
@limiter.limit("30/minute")
async def list_conversations(
    request: Request,
    user: dict = Depends(get_required_user),
):
    """List conversations. Admins see all; others see only their own."""
    summaries = storage.get_conversations()
    if user.get("role") != "admin":
        user_id = user.get("id")
        summaries = [
            s for s in summaries if s.get("user_id") == user_id
        ]
    return ConversationListResponse(
        conversations=[ConversationSummary(**s) for s in summaries]
    )


@router.get(
    "/conversations/{conversation_id}",
    response_model=ConversationDetail,
)
@limiter.limit("30/minute")
async def get_conversation(
    request: Request,
    conversation_id: str,
    user: dict = Depends(get_required_user),
):
    """Get full conversation with messages."""
    conv = storage.get_conversation(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    _check_conversation_access(conv, user)
    return ConversationDetail(**conv)


@router.delete("/conversations/{conversation_id}")
@limiter.limit("20/minute")
async def delete_conversation(
    request: Request,
    conversation_id: str,
    user: dict = Depends(require_employee_or_admin),
):
    """Delete a conversation."""
    conv = storage.get_conversation(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    _check_conversation_access(conv, user)
    storage.delete_conversation(conversation_id)
    return {"success": True}


def _resolve_conversation(
    request: ChatRequest, user: dict
) -> tuple[str, dict]:
    """Resolve or create a conversation for the request."""
    now = datetime.now().isoformat()
    conversation_id = request.conversation_id

    if conversation_id:
        conversation = storage.get_conversation(conversation_id)
        if not conversation:
            raise HTTPException(
                status_code=404, detail="Conversation not found"
            )
        _check_conversation_access(conversation, user)
        return conversation_id, conversation

    conversation_id = f"conv_{uuid.uuid4().hex[:12]}"
    title = request.message[:80].strip()
    if len(request.message) > 80:
        title += "..."
    return conversation_id, {
        "id": conversation_id,
        "title": title,
        "user_id": user.get("id"),
        "created_at": now,
        "updated_at": now,
        "messages": [],
    }


@router.post("/consent")
@limiter.limit("10/minute")
async def grant_ai_consent(
    request: Request,
    user: dict = Depends(get_required_user),
):
    """Grant AI data processing consent for the current user."""
    updated = storage.set_ai_consent(user["id"], True)
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    return {"success": True}


@router.post("/stream")
@limiter.limit("20/minute")
async def stream_message(
    request: Request,
    chat_request: ChatRequest = None,
    user: dict = Depends(require_employee_or_admin),
):
    """Stream a chat response using Server-Sent Events."""
    _require_ai_consent(user)
    conversation_id, conversation = _resolve_conversation(chat_request, user)
    now = datetime.now().isoformat()

    history = [
        {"role": msg.role, "content": msg.content}
        for msg in chat_request.conversation_history
    ]

    # Save user message to conversation
    conversation["messages"].append({
        "role": "user",
        "content": chat_request.message,
        "timestamp": now,
    })

    async def _stream_words(text: str):
        """Yield text word-by-word with a small delay for a typing effect."""
        words = text.split(" ")
        for i, word in enumerate(words):
            token = word if i == 0 else " " + word
            if token:
                yield f"data: {json.dumps({'token': token})}\n\n"
                await asyncio.sleep(0.05)

    async def event_stream():
        # Send conversation_id first so frontend can track it
        yield f"data: {json.dumps({'conversation_id': conversation_id})}\n\n"

        full_content = ""
        error_occurred = False

        try:
            async for chunk in chat_service.stream_chat(
                message=chat_request.message,
                conversation_history=history,
                user=user,
            ):
                # Tool events are dicts, text chunks are strings
                if isinstance(chunk, dict):
                    tool = chunk.get('tool', '?')
                    status = chunk.get('status', '?')
                    thinking_msg = f"Tool: {tool} — {status}"
                    yield f"data: {json.dumps({'thinking': thinking_msg})}\n\n"
                    continue

                # Extract tool_call blocks as thinking before stripping
                if '```tool_call' in chunk:
                    yield f"data: {json.dumps({'thinking': chunk})}\n\n"
                    chunk = _strip_tool_call_blocks(chunk)
                    if not chunk:
                        continue

                full_content += chunk
                # Split large chunks into words for a progressive streaming effect.
                # Providers like Gemini may return the entire response in one event.
                async for event in _stream_words(chunk):
                    yield event
        except Exception as e:
            error_occurred = True
            error_msg = str(e)
            if "rate-limited" in error_msg.lower() or "429" in error_msg:
                full_content = (
                    "The AI assistant is temporarily rate-limited. "
                    "Please wait a few seconds and try again."
                )
                async for event in _stream_words(full_content):
                    yield event
            else:
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
@limiter.limit("20/minute")
async def send_message(
    request: Request,
    chat_request: ChatRequest = None,
    user: dict = Depends(require_employee_or_admin),
):
    """Send a message and get AI response (non-streaming)."""
    _require_ai_consent(user)
    conversation_id, conversation = _resolve_conversation(chat_request, user)
    now = datetime.now().isoformat()

    history = [
        {"role": msg.role, "content": msg.content}
        for msg in chat_request.conversation_history
    ]

    result = await chat_service.chat(
        message=chat_request.message,
        conversation_history=history,
        user=user,
    )

    conversation["messages"].append({
        "role": "user",
        "content": chat_request.message,
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
