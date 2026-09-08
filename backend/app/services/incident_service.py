"""Create and manage incidents from real security events."""

import json
import logging
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.incident import Incident
from app.models.log import SecurityLog
from app.models.user import User

logger = logging.getLogger(__name__)


def _score_to_severity(score: float) -> str:
    if score >= 0.8:
        return "critical"
    if score >= 0.6:
        return "high"
    if score >= 0.4:
        return "medium"
    return "low"


async def create_incident_from_log(
    db: AsyncSession,
    user: User,
    log_entry: SecurityLog,
    threats: list[str],
) -> Optional[Incident]:
    """Auto-create an open incident when log severity is significant."""
    score = log_entry.severity_score or 0.0
    if score < 0.5 and not threats:
        return None

    severity = _score_to_severity(score)
    title = f"Log alert: {log_entry.filename}"
    description = log_entry.summary or ""
    if threats:
        description += "\n\nDetected threats:\n" + "\n".join(f"- {t}" for t in threats)

    timeline = json.dumps([
        {
            "time": log_entry.created_at.isoformat(),
            "event": f"Log analyzed ({log_entry.log_type})",
            "severity": severity,
        }
    ])

    incident = Incident(
        user_id=user.id,
        title=title,
        severity=severity,
        status="open",
        description=description.strip(),
        timeline_json=timeline,
        affected_systems=json.dumps([log_entry.log_type]),
    )
    db.add(incident)
    await db.flush()
    logger.info("Created incident %s from log %s", incident.id, log_entry.id)
    return incident


async def create_incident_from_report(
    db: AsyncSession,
    user: User,
    title: str,
    severity: str,
    description: str,
    report_id: int,
) -> Incident:
    incident = Incident(
        user_id=user.id,
        title=title,
        severity=severity,
        status="open",
        description=description[:4000],
        timeline_json=json.dumps([
            {
                "time": "",
                "event": f"Incident report #{report_id} generated",
                "severity": severity,
            }
        ]),
    )
    db.add(incident)
    await db.flush()
    return incident
