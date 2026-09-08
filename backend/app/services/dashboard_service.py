"""Real-time dashboard metrics from database — no synthetic data."""

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat import ChatSession
from app.models.document import UploadedDocument
from app.models.incident import Incident, Report
from app.models.log import SecurityLog
from app.models.user import User


def _severity_label(score: float) -> str:
    if score >= 0.8:
        return "critical"
    if score >= 0.6:
        return "high"
    if score >= 0.4:
        return "medium"
    return "low"


async def compute_dashboard_stats(db: AsyncSession, user: User) -> dict[str, Any]:
    uid = user.id
    now = datetime.now(timezone.utc)
    week_start = now - timedelta(days=6)
    week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)

    incident_count = (
        await db.execute(
            select(func.count()).select_from(Incident).where(Incident.user_id == uid)
        )
    ).scalar() or 0

    document_count = (
        await db.execute(
            select(func.count()).select_from(UploadedDocument).where(UploadedDocument.user_id == uid)
        )
    ).scalar() or 0

    log_count = (
        await db.execute(
            select(func.count()).select_from(SecurityLog).where(SecurityLog.user_id == uid)
        )
    ).scalar() or 0

    chat_count = (
        await db.execute(
            select(func.count()).select_from(ChatSession).where(ChatSession.user_id == uid)
        )
    ).scalar() or 0

    report_count = (
        await db.execute(
            select(func.count()).select_from(Report).where(Report.user_id == uid)
        )
    ).scalar() or 0

    avg_sev = (
        await db.execute(
            select(func.avg(SecurityLog.severity_score)).where(SecurityLog.user_id == uid)
        )
    ).scalar()

    # Real 7-day threat activity from logs + incidents
    all_logs = await db.execute(
        select(SecurityLog).where(
            SecurityLog.user_id == uid,
            SecurityLog.created_at >= week_start,
        )
    )
    logs_week = all_logs.scalars().all()

    all_incidents_week = await db.execute(
        select(Incident).where(
            Incident.user_id == uid,
            Incident.created_at >= week_start,
        )
    )
    incidents_week = all_incidents_week.scalars().all()

    def _utc(dt: datetime) -> datetime:
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)

    threat_activity = []
    for i in range(7):
        day_start = week_start + timedelta(days=i)
        day_end = day_start + timedelta(days=1)
        day_logs = [
            lg for lg in logs_week
            if day_start <= _utc(lg.created_at) < day_end
        ]
        day_incidents = [
            inc for inc in incidents_week
            if day_start <= _utc(inc.created_at) < day_end
        ]
        threat_activity.append({
            "date": day_start.strftime("%a"),
            "date_iso": day_start.date().isoformat(),
            "threats": len([lg for lg in day_logs if (lg.severity_score or 0) >= 0.4]),
            "incidents": len(day_incidents),
            "logs_analyzed": len(day_logs),
            "avg_severity": round(
                sum(lg.severity_score or 0 for lg in day_logs) / len(day_logs), 2
            ) if day_logs else 0.0,
        })

    # Recent incidents from DB
    recent_inc_result = await db.execute(
        select(Incident)
        .where(Incident.user_id == uid)
        .order_by(Incident.created_at.desc())
        .limit(8)
    )
    recent_incidents = [
        {
            "id": i.id,
            "title": i.title,
            "severity": i.severity,
            "status": i.status,
            "created_at": i.created_at.isoformat(),
        }
        for i in recent_inc_result.scalars().all()
    ]

    # Recent logs feed (live activity)
    recent_logs_result = await db.execute(
        select(SecurityLog)
        .where(SecurityLog.user_id == uid)
        .order_by(SecurityLog.created_at.desc())
        .limit(15)
    )
    recent_logs = []
    for log in recent_logs_result.scalars().all():
        threats = []
        try:
            anomalies = json.loads(log.anomalies_json or "[]")
            if anomalies and isinstance(anomalies[0], dict):
                threats = [
                    f.get("description", "")
                    for f in anomalies[0].get("rule_findings", [])
                ]
        except json.JSONDecodeError:
            pass
        recent_logs.append({
            "id": log.id,
            "filename": log.filename,
            "log_type": log.log_type,
            "severity_score": log.severity_score,
            "summary": (log.summary or "")[:200],
            "threats": threats[:3],
            "created_at": log.created_at.isoformat(),
        })

    # AI alerts from real high-severity logs, open incidents, recent reports
    ai_alerts = []

    high_logs = await db.execute(
        select(SecurityLog)
        .where(SecurityLog.user_id == uid, SecurityLog.severity_score >= 0.5)
        .order_by(SecurityLog.created_at.desc())
        .limit(10)
    )
    for log in high_logs.scalars().all():
        ai_alerts.append({
            "id": f"log-{log.id}",
            "type": "high_severity_log",
            "message": f"{log.filename}: {(log.summary or '')[:120]}",
            "score": log.severity_score,
            "created_at": log.created_at.isoformat(),
            "source": "log_analysis",
        })

    open_incidents = await db.execute(
        select(Incident)
        .where(Incident.user_id == uid, Incident.status == "open")
        .order_by(Incident.created_at.desc())
        .limit(5)
    )
    for inc in open_incidents.scalars().all():
        ai_alerts.append({
            "id": f"incident-{inc.id}",
            "type": "open_incident",
            "message": f"Open incident: {inc.title}",
            "score": {"critical": 0.95, "high": 0.75, "medium": 0.5, "low": 0.25}.get(
                inc.severity, 0.5
            ),
            "created_at": inc.created_at.isoformat(),
            "source": "incident",
        })

    recent_reports = await db.execute(
        select(Report)
        .where(Report.user_id == uid)
        .order_by(Report.created_at.desc())
        .limit(3)
    )
    for rep in recent_reports.scalars().all():
        ai_alerts.append({
            "id": f"report-{rep.id}",
            "type": "incident_report",
            "message": f"Report generated: {rep.title}",
            "score": {"critical": 0.9, "high": 0.7, "medium": 0.5, "low": 0.3}.get(
                rep.severity, 0.5
            ),
            "created_at": rep.created_at.isoformat(),
            "source": "report",
        })

    ai_alerts.sort(key=lambda a: a.get("created_at", ""), reverse=True)
    ai_alerts = ai_alerts[:15]

    # Risk score from real data
    high_count = len([lg for lg in logs_week if (lg.severity_score or 0) >= 0.6])
    open_count = len([i for i in recent_incidents if i.get("status") == "open"])
    risk_score = round(
        min(
            100,
            float(avg_sev or 0) * 50
            + high_count * 8
            + open_count * 10
            + incident_count * 3,
        ),
        1,
    )

    return {
        "incident_count": incident_count,
        "document_count": document_count,
        "log_count": log_count,
        "chat_session_count": chat_count,
        "report_count": report_count,
        "avg_severity_score": round(float(avg_sev or 0), 2),
        "recent_incidents": recent_incidents,
        "recent_logs": recent_logs,
        "threat_activity": threat_activity,
        "risk_score": risk_score,
        "ai_alerts": ai_alerts,
        "updated_at": now.isoformat(),
    }
