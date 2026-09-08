import json
from typing import Annotated, List

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import DocumentResponse, RAGQuery, RAGQueryResponse, RAGResult
from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.models.document import UploadedDocument
from app.models.user import User
from app.rag.vectorstore import get_vector_store
from app.services.upload_service import UploadService
from app.ai.llm_provider import LLMProviderService
from app.ai.prompts import CHAT_WITH_RAG_TEMPLATE, SOC_SYSTEM_PROMPT

router = APIRouter(prefix="/documents", tags=["Documents & RAG"])
upload_service = UploadService()
llm = LLMProviderService()


@router.post("/upload", response_model=DocumentResponse, status_code=201)
async def upload_document(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
):
    doc = await upload_service.upload_document(db, current_user, file)
    return doc


@router.get("/", response_model=List[DocumentResponse])
async def list_documents(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(UploadedDocument)
        .where(UploadedDocument.user_id == current_user.id)
        .order_by(UploadedDocument.created_at.desc())
    )
    return result.scalars().all()


@router.post("/rag/query", response_model=RAGQueryResponse)
async def rag_query(
    data: RAGQuery,
    current_user: Annotated[User, Depends(get_current_user)],
):
    results = get_vector_store().search(data.query, top_k=data.top_k)
    rag_results = [
        RAGResult(content=r["content"], source=r["source"], score=r["score"])
        for r in results
    ]
    answer = None
    if results:
        context = "\n\n".join(f"[{r['source']}]: {r['content']}" for r in results)
        prompt = CHAT_WITH_RAG_TEMPLATE.format(context=context, question=data.query)
        try:
            answer = await llm.generate(SOC_SYSTEM_PROMPT, prompt)
        except Exception:
            answer = "Unable to generate answer. Retrieved context is available above."
    return RAGQueryResponse(results=rag_results, answer=answer)
