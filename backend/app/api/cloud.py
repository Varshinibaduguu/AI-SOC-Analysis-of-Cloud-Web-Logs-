import json
from typing import Annotated, List

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import (
    CloudConnectRequest,
    CloudConnectResponse,
    CloudConnectionResponse,
    CloudLogEvent,
    CloudLogsResponse,
    CloudThreatAnalysis,
    CloudVerificationResponse,
)
from app.auth.dependencies import get_current_user
from app.db.session import AsyncSessionLocal, get_db
from app.models.user import User
from app.services.cloud_service import CloudService, aggregate_threat_analysis

router = APIRouter(prefix="/cloud", tags=["Cloud Connectivity"])
cloud_service = CloudService()


def _to_response(conn) -> CloudConnectionResponse:
    return CloudConnectionResponse(
        id=conn.id,
        connection_name=conn.connection_name,
        provider=conn.provider,
        region=conn.region,
        log_source=conn.log_source,
        log_group_name=conn.log_group_name,
        status=conn.status,
        last_error=conn.last_error,
        last_event_time=conn.last_event_time,
        created_at=conn.created_at,
    )


@router.post("/connect", response_model=CloudConnectResponse, status_code=201)
async def connect_cloud(
    data: CloudConnectRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    conn, verification = await cloud_service.create_connection(
        db,
        current_user,
        connection_name=data.connection_name,
        provider=data.provider,
        region=data.region,
        access_key_id=data.access_key_id,
        secret_access_key=data.secret_access_key,
        log_source=data.log_source,
        log_group_name=data.log_group_name,
        session_token=data.session_token,
    )
    bootstrap = await cloud_service.bootstrap_connection(db, current_user, conn.id)
    analysis_data = bootstrap.get("analysis") or {}
    return CloudConnectResponse(
        connection=_to_response(conn),
        verification=CloudVerificationResponse(**verification),
        events=[CloudLogEvent(**e) for e in bootstrap.get("events", [])],
        analysis=CloudThreatAnalysis(**analysis_data),
    )


@router.get("/connections", response_model=List[CloudConnectionResponse])
async def list_connections(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    conns = await cloud_service.list_connections(db, current_user)
    return [_to_response(c) for c in conns]


@router.delete("/connections/{connection_id}", status_code=204)
async def delete_connection(
    connection_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await cloud_service.delete_connection(db, current_user, connection_id)


@router.get("/connections/{connection_id}/logs", response_model=CloudLogsResponse)
async def fetch_cloud_logs(
    connection_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    minutes: int = Query(default=15, ge=1, le=1440),
    analyze: bool = Query(default=True),
):
    events = await cloud_service.fetch_events(
        db, current_user, connection_id, minutes=minutes
    )
    analysis = aggregate_threat_analysis(events)
    if analyze and events:
        conn = await cloud_service.get_connection(db, current_user, connection_id)
        stored = await cloud_service.analyze_and_store_events(
            db, current_user, conn, events
        )
        if stored:
            analysis = {**analysis, **stored}
    return CloudLogsResponse(
        events=[CloudLogEvent(**e) for e in events],
        count=len(events),
        analysis=analysis,
    )


@router.get("/connections/{connection_id}/stream")
async def stream_live_cloud_logs(
    connection_id: int,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
):
    """SSE stream of live cloud logs (CloudTrail / CloudWatch)."""

    async def event_generator():
        async with AsyncSessionLocal() as db:
            try:
                async for payload in cloud_service.stream_live_logs(
                    db, current_user, connection_id
                ):
                    if await request.is_disconnected():
                        break
                    yield f"data: {json.dumps(payload, default=str)}\n\n"
                    await db.commit()
            except Exception as exc:
                yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
