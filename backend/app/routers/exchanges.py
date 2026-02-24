"""Exchange router for shift swap requests and WebSocket notifications."""

import asyncio
import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect

from ..services.auth_service import verify_token
from ..services.exchange_service import exchange_service
from ..services.ws_manager import ws_manager
from ..storage import storage
from ..schemas.exchange import (
    ShiftExchangeCreate,
    ShiftExchangeResponse,
    ShiftExchangeAction,
)
from .auth import require_employee, require_employee_or_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/exchanges", tags=["exchanges"])


@router.get("/my-shifts")
async def get_my_shifts(
    month_year: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    user: dict = Depends(require_employee),
):
    """Get the authenticated employee's shifts for a given month."""
    employee_id = user["employee_id"]
    shifts = exchange_service.get_employee_shifts(employee_id, month_year)
    return {"shifts": shifts, "month_year": month_year}


@router.get("/schedule")
async def get_month_schedule(
    month_year: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    user: dict = Depends(require_employee),
):
    """Get the full month schedule with all employees' assignments.

    Returns a dict of date -> list of assignment entries for calendar rendering.
    """
    employee_id = user["employee_id"]
    schedule = exchange_service.get_month_schedule(employee_id, month_year)
    return schedule


@router.get("/eligible/{shift_date}")
async def get_eligible_partners(
    shift_date: str,
    user: dict = Depends(require_employee),
):
    """Find eligible swap partners for a given shift date."""
    month_year = shift_date[:7]
    employee_id = user["employee_id"]

    partners = exchange_service.find_eligible_partners(
        requester_employee_id=employee_id,
        requester_date=shift_date,
        month_year=month_year,
    )
    return {"partners": partners, "shift_date": shift_date}


@router.post("/", response_model=ShiftExchangeResponse)
async def create_exchange(
    body: ShiftExchangeCreate,
    user: dict = Depends(require_employee),
):
    """Create a new shift exchange request."""
    employee_id = user["employee_id"]

    try:
        exchange = await exchange_service.create_exchange(
            requester_employee_id=employee_id,
            requester_date=body.requester_date,
            target_employee_id=body.target_employee_id,
            target_date=body.target_date,
            reason=body.reason,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Notify target via WebSocket
    await ws_manager.send_to_employee(body.target_employee_id, {
        "type": "exchange_request",
        "exchange": exchange,
        "message": f"{exchange['requester_employee_name']} wants to swap shifts with you",
    })

    return ShiftExchangeResponse(**exchange)


@router.get("/")
async def list_exchanges(
    month_year: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$"),
    status: Optional[str] = None,
    user: dict = Depends(require_employee_or_admin),
):
    """List exchanges. Employees see only their own; admins see all."""
    is_admin = user.get("role") == "admin"
    employee_id = user.get("employee_id")

    if is_admin:
        exchanges = storage.get_exchanges(
            month_year=month_year, status=status
        )
    elif employee_id:
        exchanges = storage.get_exchanges(
            month_year=month_year,
            employee_id=employee_id,
            status=status,
        )
    else:
        exchanges = []

    return {"exchanges": exchanges}


@router.get("/{exchange_id}")
async def get_exchange(
    exchange_id: int,
    user: dict = Depends(require_employee_or_admin),
):
    """Get a single exchange by ID."""
    exchange = storage.get_exchange(exchange_id)
    if not exchange:
        raise HTTPException(status_code=404, detail="Exchange not found")

    # Employees can only see their own exchanges
    employee_id = user.get("employee_id")
    is_admin = user.get("role") == "admin"
    if not is_admin and employee_id:
        if (
            exchange["requester_employee_id"] != employee_id
            and exchange["target_employee_id"] != employee_id
        ):
            raise HTTPException(status_code=403, detail="Access denied")

    return exchange


@router.post("/{exchange_id}/respond", response_model=ShiftExchangeResponse)
async def respond_to_exchange(
    exchange_id: int,
    body: ShiftExchangeAction,
    user: dict = Depends(require_employee),
):
    """Accept or decline an exchange request (target employee only)."""
    employee_id = user["employee_id"]

    try:
        exchange = await exchange_service.respond_to_exchange(
            exchange_id=exchange_id,
            action=body.action,
            responding_employee_id=employee_id,
            decline_reason=body.decline_reason,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Notify requester via WebSocket
    event_type = f"exchange_{exchange['status']}"
    await ws_manager.send_to_employee(exchange["requester_employee_id"], {
        "type": event_type,
        "exchange": exchange,
        "message": (
            f"{exchange['target_employee_name']} {exchange['status']} your swap request"
        ),
    })

    # If accepted, also notify both parties of assignment update
    if exchange["status"] == "accepted":
        for emp_id in [exchange["requester_employee_id"], exchange["target_employee_id"]]:
            await ws_manager.send_to_employee(emp_id, {
                "type": "assignment_updated",
                "month_year": exchange["month_year"],
                "message": "Your shift schedule has been updated",
            })

    return ShiftExchangeResponse(**exchange)


@router.post("/{exchange_id}/cancel", response_model=ShiftExchangeResponse)
async def cancel_exchange(
    exchange_id: int,
    user: dict = Depends(require_employee),
):
    """Cancel a pending exchange request (requester only)."""
    employee_id = user["employee_id"]

    try:
        exchange = await exchange_service.cancel_exchange(exchange_id, employee_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Notify target that the request was cancelled
    await ws_manager.send_to_employee(exchange["target_employee_id"], {
        "type": "exchange_cancelled",
        "exchange": exchange,
        "message": f"{exchange['requester_employee_name']} cancelled their swap request",
    })

    return ShiftExchangeResponse(**exchange)


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time exchange notifications."""
    await websocket.accept()

    # Two-phase auth: wait for auth message instead of token in URL
    try:
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=5)
    except (asyncio.TimeoutError, WebSocketDisconnect):
        await websocket.close(code=4001, reason="Auth timeout")
        return

    try:
        auth_msg = json.loads(raw)
    except (ValueError, TypeError):
        await websocket.close(code=4001, reason="Invalid auth message")
        return

    if auth_msg.get("type") != "auth" or not auth_msg.get("token"):
        await websocket.close(code=4001, reason="Missing token")
        return

    payload = verify_token(auth_msg["token"], token_type="access")
    if not payload:
        await websocket.close(code=4001, reason="Invalid token")
        return

    employee_id = payload.get("employee_id")
    if not employee_id:
        await websocket.close(code=4003, reason="No employee linked")
        return

    # Re-validate that user still has this employee link
    ws_user = storage.get_auth_user(payload.get("sub"))
    if not ws_user or ws_user.get("employee_id") != employee_id:
        await websocket.close(code=4003, reason="Employee link revoked")
        return

    client_ip = websocket.client.host if websocket.client else "unknown"
    accepted = await ws_manager.connect(websocket, employee_id, client_ip)
    if not accepted:
        await websocket.close(code=4429, reason="Connection limit exceeded")
        return

    try:
        while True:
            data = await asyncio.wait_for(
                websocket.receive_text(), timeout=35
            )
            if data == "ping":
                if not ws_manager.check_message_rate(websocket):
                    await websocket.close(
                        code=4429, reason="Message rate limit exceeded"
                    )
                    break
                await websocket.send_text("pong")
    except (WebSocketDisconnect, asyncio.TimeoutError, Exception):
        pass
    finally:
        ws_manager.disconnect(websocket, employee_id)
