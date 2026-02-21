"""Tests for the chat router."""

import pytest
from unittest.mock import patch, AsyncMock, MagicMock


class TestChatSendMessage:
    def test_post_chat_returns_response(self, client):
        """POST /api/chat returns a ChatResponse with mocked AI provider."""
        mock_result = {
            "success": True,
            "content": "Hello! I can help with scheduling.",
            "error": None,
            "provider": "mock",
            "model": "mock-model",
        }
        with patch("app.routers.chat.chat_service") as mock_svc:
            mock_svc.chat = AsyncMock(return_value=mock_result)
            # Mock _resolve_conversation by patching storage
            with patch("app.routers.chat.storage") as mock_storage:
                mock_storage.get_conversation.return_value = None
                mock_storage.save_conversation.return_value = {}
                resp = client.post(
                    "/api/chat",
                    json={"message": "Hello"},
                )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "conversation_id" in data
        assert data["message"]["role"] == "assistant"

    def test_post_chat_error(self, client):
        """POST /api/chat returns success=False on AI error."""
        mock_result = {
            "success": False,
            "content": None,
            "error": "Provider unavailable",
            "provider": "mock",
            "model": "mock-model",
        }
        with patch("app.routers.chat.chat_service") as mock_svc:
            mock_svc.chat = AsyncMock(return_value=mock_result)
            with patch("app.routers.chat.storage") as mock_storage:
                mock_storage.get_conversation.return_value = None
                mock_storage.save_conversation.return_value = {}
                resp = client.post(
                    "/api/chat",
                    json={"message": "Hello"},
                )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False


class TestChatHealth:
    def test_health_check(self, client):
        """GET /api/chat/health returns health status."""
        mock_health = {
            "connected": True,
            "model_available": True,
            "model_name": "test-model",
            "provider": "test",
            "error": None,
            "ollama_connected": False,
        }
        with patch("app.routers.chat.chat_service") as mock_svc:
            mock_svc.check_health = AsyncMock(return_value=mock_health)
            resp = client.get("/api/chat/health")
        assert resp.status_code == 200
        data = resp.json()
        assert "connected" in data
        assert "provider" in data


class TestConversations:
    def test_list_conversations(self, client):
        """GET /api/chat/conversations returns list."""
        with patch("app.routers.chat.storage") as mock_storage:
            mock_storage.get_conversations.return_value = [
                {
                    "id": "conv_abc",
                    "title": "Test",
                    "created_at": "2026-02-20T00:00:00",
                    "updated_at": "2026-02-20T00:00:00",
                    "message_count": 2,
                },
            ]
            resp = client.get("/api/chat/conversations")
        assert resp.status_code == 200
        data = resp.json()
        assert "conversations" in data

    def test_get_conversation_not_found(self, client):
        """GET /api/chat/conversations/{id} returns 404."""
        with patch("app.routers.chat.storage") as mock_storage:
            mock_storage.get_conversation.return_value = None
            resp = client.get("/api/chat/conversations/nonexistent")
        assert resp.status_code == 404

    def test_delete_conversation(self, client):
        """DELETE /api/chat/conversations/{id} returns success."""
        with patch("app.routers.chat.storage") as mock_storage:
            mock_storage.delete_conversation.return_value = True
            resp = client.delete("/api/chat/conversations/conv_abc")
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    def test_delete_conversation_not_found(self, client):
        """DELETE /api/chat/conversations/{id} returns 404."""
        with patch("app.routers.chat.storage") as mock_storage:
            mock_storage.delete_conversation.return_value = False
            resp = client.delete("/api/chat/conversations/nonexistent")
        assert resp.status_code == 404
