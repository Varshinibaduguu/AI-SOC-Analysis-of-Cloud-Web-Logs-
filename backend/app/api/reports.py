from typing import Annotated, List

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import ReportGenerateRequest, ReportResponse
from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.models.incident import Report
from app.models.user import User
from app.services.report_service import ReportService

router = APIRouter(prefix="/reports", tags=["Incident Reports"])
report_service = ReportService()


@router.get("/context")
async def get_report_context(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Return real analyzed logs available for report generation."""
    from sqlalchemy import select
    from app.models.log import SecurityLog

    result = await db.execute(
        select(SecurityLog)
        .where(SecurityLog.user_id == current_user.id)
        .order_by(SecurityLog.created_at.desc())
        .limit(20)
    )
    logs = result.scalars().all()
    return {
        "logs": [
            {
                "id": lg.id,
                "filename": lg.filename,
                "log_type": lg.log_type,
                "severity_score": lg.severity_score,
                "summary": (lg.summary or "")[:300],
                "created_at": lg.created_at.isoformat(),
            }
            for lg in logs
        ],
        "can_generate": len(logs) > 0,
    }


@router.post("/generate", response_model=ReportResponse, status_code=201)
async def generate_report(
    data: ReportGenerateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    report = await report_service.generate(
        db,
        current_user,
        logs_summary=data.logs_summary,
        alerts=data.alerts,
        user_prompt=data.user_prompt,
        title=data.title,
        severity=data.severity,
        log_ids=data.log_ids,
    )
    return report


@router.get("/", response_model=List[ReportResponse])
async def list_reports(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(Report)
        .where(Report.user_id == current_user.id)
        .order_by(Report.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{report_id}", response_model=ReportResponse)
async def get_report(
    report_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(Report).where(Report.id == report_id, Report.user_id == current_user.id)
    )
    report = result.scalar_one_or_none()
    if not report:
        from fastapi import HTTPException
        raise HTTPException(404, "Report not found")
    return report


@router.get("/{report_id}/export/pdf")
async def export_pdf(
    report_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(Report).where(Report.id == report_id, Report.user_id == current_user.id)
    )
    report = result.scalar_one_or_none()
    if not report:
        from fastapi import HTTPException
        raise HTTPException(404, "Report not found")
    pdf_bytes = report_service.export_pdf(report.content_markdown, report.title)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="report-{report_id}.pdf"'},
    )


@router.get("/{report_id}/export/markdown")
async def export_markdown(
    report_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(Report).where(Report.id == report_id, Report.user_id == current_user.id)
    )
    report = result.scalar_one_or_none()
    if not report:
        from fastapi import HTTPException
        raise HTTPException(404, "Report not found")
    return Response(
        content=report.content_markdown,
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="report-{report_id}.md"'},
    )
