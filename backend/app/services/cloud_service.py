"""Cloud connection management and live log streaming."""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, AsyncIterator, Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import decrypt_dict, encrypt_dict
from app.ml.anomaly_detector import analyze_logs_content
from app.models.cloud import CloudConnection, CloudProvider, LogSource
from app.models.log import SecurityLog
from app.models.user import User
from app.services.cloud.aws_provider import (
    fetch_live_events,
    format_aws_connection_error,
    test_aws_connection,
)
from app.services.incident_service import create_incident_from_log

logger = logging.getLogger(__name__)


def enrich_event_with_threats(event: dict[str, Any], log_source: str) -> dict[str, Any]:
    """Attach ML + rule-based severity to a single cloud log event."""
    text = json.dumps(event.get("detail", event.get("raw", "")))
    score, _, threats = analyze_logs_content(text, log_source)
    event["severity_score"] = score
    event["threats"] = threats
    return event


def enrich_events(events: list[dict[str, Any]], log_source: str) -> list[dict[str, Any]]:
    return [enrich_event_with_threats(ev, log_source) for ev in events]


def aggregate_threat_analysis(events: list[dict[str, Any]]) -> dict[str, Any]:
    if not events:
        return {
            "severity_score": 0.0,
            "avg_severity_score": 0.0,
            "threat_percentage": 0,
            "threats": [],
            "high_risk_count": 0,
            "event_count": 0,
        }
    scores = [float(ev.get("severity_score") or 0) for ev in events]
    max_score = max(scores)
    avg_score = sum(scores) / len(scores)
    all_threats: list[str] = []
    for ev in events:
        all_threats.extend(ev.get("threats") or [])
    unique_threats = list(dict.fromkeys(all_threats))
    return {
        "severity_score": round(max_score, 2),
        "avg_severity_score": round(avg_score, 2),
        "threat_percentage": round(max_score * 100),
        "threats": unique_threats,
        "high_risk_count": sum(1 for s in scores if s >= 0.5),
        "event_count": len(events),
    }


class CloudService:
    def _credentials_payload(
        self,
        access_key_id: str,
        secret_access_key: str,
        session_token: Optional[str] = None,
    ) -> dict:
        return {
            "access_key_id": access_key_id.strip(),
            "secret_access_key": secret_access_key.strip(),
            "session_token": session_token.strip() if session_token else None,
        }

    def get_credentials(self, connection: CloudConnection) -> dict:
        return decrypt_dict(connection.encrypted_credentials)

    async def create_connection(
        self,
        db: AsyncSession,
        user: User,
        connection_name: str,
        provider: str,
        region: str,
        access_key_id: str,
        secret_access_key: str,
        log_source: str = "cloudtrail",
        log_group_name: Optional[str] = None,
        session_token: Optional[str] = None,
    ) -> tuple[CloudConnection, dict[str, Any]]:
        if provider != CloudProvider.AWS.value:
            raise HTTPException(400, f"Provider '{provider}' not yet supported. Use AWS.")

        creds = self._credentials_payload(access_key_id, secret_access_key, session_token)

        try:
            test_result = await asyncio.to_thread(
                test_aws_connection, region, creds, log_source, log_group_name
            )
        except Exception as exc:
            logger.error("Cloud connection test failed: %s", exc)
            raise HTTPException(
                status_code=400,
                detail=format_aws_connection_error(exc),
            ) from exc

        conn = CloudConnection(
            user_id=user.id,
            provider=provider,
            connection_name=connection_name,
            region=region,
            log_source=log_source,
            log_group_name=log_group_name,
            encrypted_credentials=encrypt_dict(creds),
            status="connected",
            last_error=None,
        )
        db.add(conn)
        await db.flush()

        logger.info(
            "Cloud connected user=%s account=%s source=%s",
            user.id,
            test_result.get("account"),
            log_source,
        )
        return conn, test_result

    async def bootstrap_connection(
        self,
        db: AsyncSession,
        user: User,
        connection_id: int,
        minutes: int = 30,
    ) -> dict[str, Any]:
        """Fetch recent cloud logs, score threats, and persist analysis."""
        conn = await self.get_connection(db, user, connection_id)
        try:
            events = await self.fetch_events(db, user, connection_id, minutes=minutes)
        except HTTPException:
            events = []
        aggregate = aggregate_threat_analysis(events)

        stored = None
        if events:
            stored = await self.analyze_and_store_events(db, user, conn, events)
            if stored:
                aggregate["log_id"] = stored.get("log_id")
                aggregate["severity_score"] = stored.get("severity_score", aggregate["severity_score"])
                aggregate["threat_percentage"] = round(
                    float(stored.get("severity_score", 0)) * 100
                )
                aggregate["threats"] = stored.get("threats") or aggregate["threats"]

        return {
            "events": events,
            "analysis": aggregate,
            "stored_analysis": stored,
        }

    async def list_connections(
        self, db: AsyncSession, user: User
    ) -> list[CloudConnection]:
        result = await db.execute(
            select(CloudConnection)
            .where(CloudConnection.user_id == user.id, CloudConnection.is_active == True)
            .order_by(CloudConnection.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_connection(
        self, db: AsyncSession, user: User, connection_id: int
    ) -> CloudConnection:
        result = await db.execute(
            select(CloudConnection).where(
                CloudConnection.id == connection_id,
                CloudConnection.user_id == user.id,
            )
        )
        conn = result.scalar_one_or_none()
        if not conn:
            raise HTTPException(404, "Cloud connection not found")
        return conn

    async def delete_connection(
        self, db: AsyncSession, user: User, connection_id: int
    ) -> None:
        conn = await self.get_connection(db, user, connection_id)
        conn.is_active = False
        conn.status = "disconnected"
        await db.flush()

    async def fetch_events(
        self,
        db: AsyncSession,
        user: User,
        connection_id: int,
        minutes: int = 15,
        max_results: int = 50,
    ) -> list[dict[str, Any]]:
        conn = await self.get_connection(db, user, connection_id)
        creds = self.get_credentials(conn)

        since = datetime.now(timezone.utc)
        from datetime import timedelta

        since = since - timedelta(minutes=minutes)

        try:
            events = await asyncio.to_thread(
                fetch_live_events,
                conn.region,
                creds,
                conn.log_source,
                conn.log_group_name,
                since.isoformat(),
                max_results,
            )
            if events:
                conn.last_event_time = events[-1].get("time")
            conn.status = "connected"
            conn.last_error = None
            await db.flush()
            return enrich_events(events, conn.log_source)
        except Exception as exc:
            conn.status = "error"
            conn.last_error = str(exc)
            await db.flush()
            raise HTTPException(400, format_aws_connection_error(exc)) from exc

    async def analyze_and_store_events(
        self,
        db: AsyncSession,
        user: User,
        connection: CloudConnection,
        events: list[dict[str, Any]],
    ) -> Optional[dict[str, Any]]:
        if not events:
            return None

        combined = "\n".join(
            json.dumps(e.get("detail", e.get("raw", ""))) for e in events[-20:]
        )
        severity_score, anomalies, threats = analyze_logs_content(
            combined, connection.log_source
        )

        summary_parts = [
            f"Live {connection.provider.upper()} {connection.log_source}: "
            f"{len(events)} event(s).",
        ]
        if threats:
            summary_parts.append("Threats: " + "; ".join(threats[:5]))

        log_entry = SecurityLog(
            user_id=user.id,
            filename=f"{connection.connection_name}-{connection.log_source}-live",
            log_type=connection.log_source,
            summary=" ".join(summary_parts),
            severity_score=severity_score,
            anomalies_json=json.dumps(anomalies),
            raw_preview=combined[:2000],
        )
        db.add(log_entry)
        await db.flush()

        if severity_score >= 0.5 or threats:
            await create_incident_from_log(db, user, log_entry, threats)

        return {
            "log_id": log_entry.id,
            "severity_score": severity_score,
            "threat_percentage": round(severity_score * 100),
            "threats": threats,
            "event_count": len(events),
            "high_risk_count": sum(
                1 for e in events if (e.get("severity_score") or 0) >= 0.5
            ),
        }

    async def stream_live_logs(
        self,
        db: AsyncSession,
        user: User,
        connection_id: int,
        poll_interval: int = 8,
    ) -> AsyncIterator[dict[str, Any]]:
        conn = await self.get_connection(db, user, connection_id)
        creds = self.get_credentials(conn)
        seen_ids: set[str] = set()
        last_time = conn.last_event_time
        max_seen = 5000

        yield {
            "type": "connected",
            "connection_id": conn.id,
            "connection_name": conn.connection_name,
            "region": conn.region,
            "log_source": conn.log_source,
        }

        while True:
            try:
                await db.refresh(conn)
                creds = self.get_credentials(conn)
                events = await asyncio.to_thread(
                    fetch_live_events,
                    conn.region,
                    creds,
                    conn.log_source,
                    conn.log_group_name,
                    last_time,
                    30,
                )

                new_events = []
                for ev in events:
                    eid = str(ev.get("id", ""))
                    if eid and eid not in seen_ids:
                        seen_ids.add(eid)
                        if len(seen_ids) > max_seen:
                            seen_ids.clear()
                        new_events.append(ev)
                        if ev.get("time"):
                            last_time = ev["time"]

                if new_events:
                    conn.last_event_time = last_time
                    conn.status = "connected"
                    conn.last_error = None
                    await db.flush()

                    new_events = enrich_events(new_events, conn.log_source)
                    aggregate = aggregate_threat_analysis(new_events)
                    stored = None
                    if aggregate["high_risk_count"] > 0 or aggregate["severity_score"] >= 0.5:
                        stored = await self.analyze_and_store_events(
                            db, user, conn, new_events
                        )
                    analysis = {**aggregate, **(stored or {})}

                    yield {
                        "type": "logs",
                        "events": new_events,
                        "count": len(new_events),
                        "analysis": analysis,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
                else:
                    yield {
                        "type": "heartbeat",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }

            except Exception as exc:
                conn.status = "error"
                conn.last_error = str(exc)
                await db.flush()
                yield {"type": "error", "message": str(exc)}

            await asyncio.sleep(poll_interval)
