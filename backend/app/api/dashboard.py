import asyncio
import json
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import DashboardStats, IncidentResponse
from app.auth.dependencies import get_current_user
from app.db.session import AsyncSessionLocal, get_db
from app.models.incident import Incident
from app.models.user import User
from app.services.dashboard_service import compute_dashboard_stats

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    data = await compute_dashboard_stats(db, current_user)
    return DashboardStats(**data)


@router.get("/stream")
async def stream_dashboard_updates(
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
):
    """SSE stream — pushes live dashboard stats when data changes."""

    async def event_generator():
        last_payload = ""
        while True:
            if await request.is_disconnected():
                break
            async with AsyncSessionLocal() as db:
                data = await compute_dashboard_stats(db, current_user)
            payload = json.dumps(data, default=str)
            if payload != last_payload:
                last_payload = payload
                yield f"event: stats\ndata: {payload}\n\n"
            else:
                yield ": heartbeat\n\n"
            await asyncio.sleep(3)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/incidents", response_model=list[IncidentResponse])
async def list_incidents(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(Incident)
        .where(Incident.user_id == current_user.id)
        .order_by(Incident.created_at.desc())
    )
    return result.scalars().all()
