"""WebSocket connection manager for real-time notifications."""

import logging
import time
from typing import Any
from fastapi import WebSocket

logger = logging.getLogger(__name__)

MAX_CONNECTIONS_PER_EMPLOYEE = 3
MAX_CONNECTIONS_PER_IP = 10
MAX_CONNECTIONS_GLOBAL = 200
MAX_MESSAGES_PER_MINUTE = 30


class ConnectionManager:
    """Manages WebSocket connections keyed by employee_id."""

    def __init__(self):
        # employee_id -> list of WebSocket connections
        self._connections: dict[int, list[WebSocket]] = {}
        # IP -> count of active connections
        self._ip_connections: dict[str, int] = {}
        # websocket -> IP address (for cleanup on disconnect)
        self._ws_ip: dict[WebSocket, str] = {}
        # websocket -> list of message timestamps (for rate limiting)
        self._message_timestamps: dict[WebSocket, list[float]] = {}
        self._total_connections = 0

    def _get_total_connections(self) -> int:
        return self._total_connections

    async def connect(
        self, websocket: WebSocket, employee_id: int, client_ip: str
    ) -> bool:
        """Register a WebSocket connection. Returns False if rejected."""
        # Global cap
        if self._total_connections >= MAX_CONNECTIONS_GLOBAL:
            logger.warning("Global WebSocket connection limit reached")
            return False

        # Per-IP cap
        ip_count = self._ip_connections.get(client_ip, 0)
        if ip_count >= MAX_CONNECTIONS_PER_IP:
            logger.warning(
                f"IP {client_ip} exceeded connection limit"
            )
            return False

        # Per-employee cap
        emp_conns = self._connections.get(employee_id, [])
        if len(emp_conns) >= MAX_CONNECTIONS_PER_EMPLOYEE:
            logger.warning(
                f"Employee {employee_id} exceeded connection limit"
            )
            return False

        # Register connection
        if employee_id not in self._connections:
            self._connections[employee_id] = []
        self._connections[employee_id].append(websocket)
        self._ip_connections[client_ip] = ip_count + 1
        self._ws_ip[websocket] = client_ip
        self._message_timestamps[websocket] = []
        self._total_connections += 1

        logger.info(
            f"WebSocket connected: employee={employee_id}, "
            f"ip={client_ip}, total={self._total_connections}"
        )
        return True

    def disconnect(self, websocket: WebSocket, employee_id: int):
        """Remove a WebSocket connection."""
        if employee_id in self._connections:
            self._connections[employee_id] = [
                ws for ws in self._connections[employee_id]
                if ws is not websocket
            ]
            if not self._connections[employee_id]:
                del self._connections[employee_id]

        # Clean up IP tracking
        client_ip = self._ws_ip.pop(websocket, None)
        if client_ip and client_ip in self._ip_connections:
            self._ip_connections[client_ip] -= 1
            if self._ip_connections[client_ip] <= 0:
                del self._ip_connections[client_ip]

        # Clean up message tracking
        self._message_timestamps.pop(websocket, None)
        self._total_connections = max(0, self._total_connections - 1)

        logger.info(
            f"WebSocket disconnected: employee={employee_id}, "
            f"total={self._total_connections}"
        )

    def check_message_rate(self, websocket: WebSocket) -> bool:
        """Check if a message is within rate limits. Returns False if exceeded."""
        now = time.monotonic()
        cutoff = now - 60.0

        timestamps = self._message_timestamps.get(websocket, [])
        # Remove timestamps older than 1 minute
        timestamps = [t for t in timestamps if t > cutoff]
        timestamps.append(now)
        self._message_timestamps[websocket] = timestamps

        return len(timestamps) <= MAX_MESSAGES_PER_MINUTE

    async def send_to_employee(
        self, employee_id: int, event: dict[str, Any]
    ):
        """Send a JSON event to all connections for an employee."""
        if employee_id not in self._connections:
            return

        dead_connections = []
        for ws in self._connections[employee_id]:
            try:
                await ws.send_json(event)
            except Exception:
                dead_connections.append(ws)

        for ws in dead_connections:
            self.disconnect(ws, employee_id)

    async def broadcast(self, event: dict[str, Any]):
        """Send a JSON event to all connected employees."""
        for employee_id in list(self._connections.keys()):
            await self.send_to_employee(employee_id, event)


# Global singleton
ws_manager = ConnectionManager()
