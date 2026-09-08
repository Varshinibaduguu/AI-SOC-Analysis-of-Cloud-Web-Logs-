import json
from typing import Annotated, List

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import LogAnalysisResponse
from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.models.log import SecurityLog
from app.models.user import User
from app.services.upload_service import UploadService

router = APIRouter(prefix="/logs", tags=["Log Analysis"])
upload_service = UploadService()


@router.post("/analyze", response_model=LogAnalysisResponse, status_code=201)
async def analyze_log(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
    log_type: str = Form(default="generic"),
):
    entry = await upload_service.analyze_log(db, current_user, file, log_type)
    anomalies = json.loads(entry.anomalies_json or "[]")
    threats = []
    if anomalies and isinstance(anomalies[0], dict):
        rf = anomalies[0].get("rule_findings", [])
        threats = [f.get("description", "") for f in rf]
    return LogAnalysisResponse(
        id=entry.id,
        filename=entry.filename,
        log_type=entry.log_type,
        summary=entry.summary or "",
        severity_score=entry.severity_score or 0.0,
        anomalies=anomalies,
        threats=threats,
        created_at=entry.created_at,
    )


@router.get("/", response_model=List[LogAnalysisResponse])
async def list_logs(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(SecurityLog)
        .where(SecurityLog.user_id == current_user.id)
        .order_by(SecurityLog.created_at.desc())
        .limit(50)
    )
    logs = result.scalars().all()
    responses = []
    for entry in logs:
        anomalies = json.loads(entry.anomalies_json or "[]")
        threats = []
        if anomalies and isinstance(anomalies[0], dict):
            rf = anomalies[0].get("rule_findings", [])
            threats = [f.get("description", "") for f in rf]
        responses.append(
            LogAnalysisResponse(
                id=entry.id,
                filename=entry.filename,
                log_type=entry.log_type,
                summary=entry.summary or "",
                severity_score=entry.severity_score or 0.0,
                anomalies=anomalies,
                threats=threats,
                created_at=entry.created_at,
            )
        )
    return responses
