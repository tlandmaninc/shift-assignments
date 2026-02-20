"""WebSocket connection manager for real-time notifications."""

import logging
from typing import Any
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections keyed by employee_id."""

    def __init__(self):
        # employee_id -> list of WebSocket connections (supports multiple tabs/devices)
        self._connections: dict[int, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, employee_id: int):
        """Accept and register a WebSocket connection."""
        await websocket.accept()
        if employee_id not in self._connections:
            self._connections[employee_id] = []
        self._connections[employee_id].append(websocket)
        logger.info(f"WebSocket connected for employee {employee_id} (total: {len(self._connections[employee_id])})")

    def disconnect(self, websocket: WebSocket, employee_id: int):
        """Remove a WebSocket connection."""
        if employee_id in self._connections:
            self._connections[employee_id] = [
                ws for ws in self._connections[employee_id] if ws is not websocket
            ]
            if not self._connections[employee_id]:
                del self._connections[employee_id]
        logger.info(f"WebSocket disconnected for employee {employee_id}")

    async def send_to_employee(self, employee_id: int, event: dict[str, Any]):
        """Send a JSON event to all connections for an employee."""
        if employee_id not in self._connections:
            return

        dead_connections = []
        for ws in self._connections[employee_id]:
            try:
                await ws.send_json(event)
            except Exception:
                dead_connections.append(ws)

        # Clean up dead connections
        for ws in dead_connections:
            self._connections[employee_id] = [
                c for c in self._connections[employee_id] if c is not ws
            ]
        if employee_id in self._connections and not self._connections[employee_id]:
            del self._connections[employee_id]

    async def broadcast(self, event: dict[str, Any]):
        """Send a JSON event to all connected employees."""
        for employee_id in list(self._connections.keys()):
            await self.send_to_employee(employee_id, event)


# Global singleton
ws_manager = ConnectionManager()
