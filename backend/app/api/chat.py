import json
from typing import Annotated, List

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas import (
    ChatSessionCreate,
    ChatSessionResponse,
    MessageCreate,
    MessageResponse,
)
from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.models.chat import ChatSession, Message
from app.models.user import User
from app.services.chat_service import ChatService

router = APIRouter(prefix="/chat", tags=["Chat"])
chat_service = ChatService()


@router.get("/sessions", response_model=List[ChatSessionResponse])
async def list_sessions(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(ChatSession)
        .where(ChatSession.user_id == current_user.id)
        .order_by(ChatSession.updated_at.desc())
    )
    return result.scalars().all()


@router.post("/sessions", response_model=ChatSessionResponse, status_code=201)
async def create_session(
    data: ChatSessionCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    session = ChatSession(user_id=current_user.id, title=data.title)
    db.add(session)
    await db.flush()
    return session


@router.get("/sessions/{session_id}/messages", response_model=List[MessageResponse])
async def get_messages(
    session_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == session_id, ChatSession.user_id == current_user.id
        )
    )
    if not result.scalar_one_or_none():
        return []
    msgs = await db.execute(
        select(Message).where(Message.session_id == session_id).order_by(Message.created_at)
    )
    return msgs.scalars().all()


@router.post("/message", response_model=List[MessageResponse])
async def send_message(
    data: MessageCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    user_msg, assistant_msg, _ = await chat_service.chat(
        db, current_user, data.content, data.session_id, data.use_rag
    )
    return [user_msg, assistant_msg]


@router.post("/stream")
async def stream_message(
    data: MessageCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    async def event_generator():
        async for event in chat_service.stream_chat(
            db, current_user, data.content, data.session_id, data.use_rag
        ):
            yield f"data: {json.dumps(event)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
