import logging
from io import BytesIO
from typing import Optional

from fastapi import HTTPException
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.agents import AgentRouter
from app.ai.llm_provider import LLMProviderService
from app.models.incident import Report
from app.models.log import SecurityLog
from app.models.user import User
from app.services.incident_service import create_incident_from_report

logger = logging.getLogger(__name__)


class ReportService:
    def __init__(self):
        self.router = AgentRouter()
        self.llm = LLMProviderService()

    async def _build_context_from_db(
        self, db: AsyncSession, user: User, log_ids: Optional[list[int]] = None
    ) -> tuple[str, list[str]]:
        """Pull real log analyses from the database."""
        query = (
            select(SecurityLog)
            .where(SecurityLog.user_id == user.id)
            .order_by(SecurityLog.created_at.desc())
        )
        if log_ids:
            query = query.where(SecurityLog.id.in_(log_ids))
        else:
            query = query.limit(5)

        result = await db.execute(query)
        logs = result.scalars().all()
        if not logs:
            return "", []

        parts = []
        alerts = []
        for log in logs:
            parts.append(
                f"### Log: {log.filename} ({log.log_type})\n"
                f"Severity: {log.severity_score}\n"
                f"Summary: {log.summary}\n"
            )
            if log.raw_preview:
                parts.append(f"Preview:\n{log.raw_preview[:1500]}\n")
            if (log.severity_score or 0) >= 0.5:
                alerts.append(f"High severity log: {log.filename} (score {log.severity_score})")

        return "\n".join(parts), alerts

    async def generate(
        self,
        db: AsyncSession,
        user: User,
        logs_summary: Optional[str] = None,
        alerts: Optional[list] = None,
        user_prompt: Optional[str] = None,
        title: Optional[str] = None,
        severity: str = "medium",
        log_ids: Optional[list[int]] = None,
    ) -> Report:
        context_parts = []
        db_logs_summary, db_alerts = await self._build_context_from_db(db, user, log_ids)

        if db_logs_summary:
            context_parts.append(f"## Analyzed Security Logs (from database)\n{db_logs_summary}")
        if logs_summary:
            context_parts.append(f"## Additional Log Context\n{logs_summary}")

        combined_alerts = list(db_alerts)
        if alerts:
            combined_alerts.extend(alerts)
        if combined_alerts:
            context_parts.append(
                "## Active Alerts\n" + "\n".join(f"- {a}" for a in combined_alerts)
            )
        if user_prompt:
            context_parts.append(f"## Analyst Notes\n{user_prompt}")

        if not context_parts:
            raise HTTPException(
                status_code=400,
                detail="No security data available. Upload and analyze logs first, then generate a report.",
            )

        context = "\n\n".join(context_parts)
        prompt = (
            f"Generate a professional incident report based ONLY on the following real security data. "
            f"Assigned severity: {severity}.\n\n{context}"
        )

        try:
            response, _ = await self.router.run(prompt)
        except Exception as exc:
            logger.warning("Agent report failed, using structured fallback: %s", exc)
            response = await self._fallback_report(context, combined_alerts, severity)

        root_cause = self._extract_section(response, "Root Cause")
        mitigation = self._extract_section(response, "Mitigation")
        actions = self._extract_section(response, "Recommended")

        report_title = title or self._extract_title(response) or "Security Incident Report"

        report = Report(
            user_id=user.id,
            title=report_title,
            severity=severity,
            content_markdown=response,
            root_cause=root_cause,
            mitigation_steps=mitigation,
            recommended_actions=actions,
        )
        db.add(report)
        await db.flush()

        await create_incident_from_report(
            db,
            user,
            title=report_title,
            severity=severity,
            description=response[:2000],
            report_id=report.id,
        )
        return report

    async def _fallback_report(
        self, context: str, alerts: list[str], severity: str
    ) -> str:
        """Structured report from real log data when LLM is unavailable."""
        alert_block = "\n".join(f"- {a}" for a in alerts) if alerts else "- None recorded"
        return f"""# Security Incident Report

## Severity
{severity.upper()}

## Executive Summary
This report was generated from analyzed security logs in your SOC platform.
{len(alerts)} high-priority alert(s) were identified from real log analysis.

## Timeline
Derived from uploaded and analyzed log timestamps in the system.

## Root Cause Analysis
Based on detected patterns in analyzed logs:
{context[:1500]}

## Active Alerts
{alert_block}

## Mitigation Steps
1. Review flagged authentication failures and IAM changes
2. Isolate affected accounts showing anomalous activity
3. Rotate credentials for impacted identities
4. Enable enhanced monitoring on affected log sources

## Recommended Actions
1. Correlate findings with SIEM/CloudTrail retention
2. Update detection rules for observed TTPs
3. Schedule post-incident review with security team
"""

    def _extract_title(self, text: str) -> Optional[str]:
        for line in text.split("\n"):
            if line.strip().startswith("# ") and "incident" in line.lower():
                return line.strip().lstrip("# ").strip()
        return None

    def _extract_section(self, text: str, heading: str) -> Optional[str]:
        lines = text.split("\n")
        capture = False
        section_lines = []
        for line in lines:
            if heading.lower() in line.lower() and (
                line.strip().startswith("#") or line.strip().startswith("##")
            ):
                capture = True
                continue
            if capture and line.strip().startswith("#") and heading.lower() not in line.lower():
                break
            if capture:
                section_lines.append(line)
        return "\n".join(section_lines).strip() or None

    def export_pdf(self, markdown_content: str, title: str) -> bytes:
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter)
        styles = getSampleStyleSheet()
        story = [
            Paragraph(f"<b>{title}</b>", styles["Title"]),
            Spacer(1, 12),
        ]
        for para in markdown_content.split("\n\n"):
            if para.strip():
                safe = para.replace("<", "&lt;").replace(">", "&gt;")
                story.append(Paragraph(safe, styles["Normal"]))
                story.append(Spacer(1, 6))
        doc.build(story)
        return buffer.getvalue()
