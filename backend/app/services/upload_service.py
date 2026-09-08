import json
import logging
import os
import uuid
from pathlib import Path

import aiofiles
from fastapi import HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.ml.anomaly_detector import analyze_logs_content
from app.models.document import UploadedDocument
from app.models.log import SecurityLog
from app.models.user import User
from app.rag.document_loader import load_document
from app.rag.vectorstore import get_vector_store
from app.ai.llm_provider import LLMProviderService
from app.ai.prompts import LOG_ANALYSIS_PROMPT, SOC_SYSTEM_PROMPT
from app.services.incident_service import create_incident_from_log

logger = logging.getLogger(__name__)
settings = get_settings()


class UploadService:
    def __init__(self):
        self._vectorstore = None
        self.llm = LLMProviderService()
        os.makedirs(settings.upload_dir, exist_ok=True)

    @property
    def vectorstore(self):
        if self._vectorstore is None:
            self._vectorstore = get_vector_store()
        return self._vectorstore

    def _validate_file(self, filename: str, size: int) -> str:
        ext = Path(filename).suffix.lower()
        if ext not in settings.allowed_ext_list:
            raise HTTPException(400, f"File type {ext} not allowed")
        if size > settings.max_upload_bytes:
            raise HTTPException(400, f"File exceeds {settings.max_upload_size_mb}MB limit")
        return ext

    async def save_file(self, upload: UploadFile) -> tuple[str, str]:
        content = await upload.read()
        ext = self._validate_file(upload.filename or "file.txt", len(content))
        safe_name = f"{uuid.uuid4().hex}{ext}"
        file_path = os.path.join(settings.upload_dir, safe_name)
        async with aiofiles.open(file_path, "wb") as f:
            await f.write(content)
        return file_path, ext

    async def upload_document(
        self, db: AsyncSession, user: User, upload: UploadFile
    ) -> UploadedDocument:
        try:
            file_path, ext = await self.save_file(upload)
            text = load_document(file_path)
            source = upload.filename or Path(file_path).name
            chunk_count = self.vectorstore.add_document(
                text, source=source, doc_id=str(user.id), metadata={"user_id": user.id}
            )
            doc = UploadedDocument(
                user_id=user.id,
                filename=upload.filename or "document",
                file_type=ext.lstrip("."),
                file_path=file_path,
                chunk_count=chunk_count,
                status="indexed",
            )
            db.add(doc)
            await db.flush()
            return doc
        except HTTPException:
            raise
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            logger.exception("Document upload failed")
            raise HTTPException(status_code=500, detail=f"Upload failed: {exc}") from exc

    async def analyze_log(
        self, db: AsyncSession, user: User, upload: UploadFile, log_type: str = "generic"
    ) -> SecurityLog:
        try:
            file_path, ext = await self.save_file(upload)
            content = load_document(file_path)

            severity_score, anomalies, threats = analyze_logs_content(content, log_type)

            preview = content[:4000]
            try:
                summary = await self.llm.generate(
                    f"{SOC_SYSTEM_PROMPT}\n\n{LOG_ANALYSIS_PROMPT}",
                    f"Analyze these logs (type: {log_type}). Threats found: {threats}\n\n{preview}",
                )
            except Exception as e:
                logger.warning("LLM summarization failed: %s", e)
                summary = (
                    f"Detected {len(threats)} threat indicator(s). "
                    f"Severity score: {severity_score}. "
                    + ("; ".join(threats) if threats else "No critical threats identified.")
                )

            log_entry = SecurityLog(
                user_id=user.id,
                filename=upload.filename or "log",
                log_type=log_type,
                summary=summary,
                severity_score=severity_score,
                anomalies_json=json.dumps(anomalies),
                raw_preview=preview[:2000],
            )
            db.add(log_entry)
            await db.flush()

            await create_incident_from_log(db, user, log_entry, threats)
            return log_entry
        except HTTPException:
            raise
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            logger.exception("Log analysis failed")
            raise HTTPException(status_code=500, detail=f"Analysis failed: {exc}") from exc
