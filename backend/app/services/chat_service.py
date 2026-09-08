import json
import logging
from typing import AsyncIterator, List, Optional, Tuple

from langchain_core.messages import AIMessage, HumanMessage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.agents import AgentRouter, AgentType
from app.ai.llm_provider import LLMProviderService
from app.ai.prompts import (
    CHAT_NO_RAG_TEMPLATE,
    CHAT_WITH_RAG_TEMPLATE,
    SOC_SYSTEM_PROMPT,
)
from app.models.chat import ChatSession, Message
from app.models.incident import Incident
from app.models.log import SecurityLog
from app.models.user import User
from app.rag.vectorstore import get_vector_store

logger = logging.getLogger(__name__)


class ChatService:
    def __init__(self):
        self.llm = LLMProviderService()
        self.router = AgentRouter(self.llm)
        self._vectorstore = None

    @property
    def vectorstore(self):
        if self._vectorstore is None:
            self._vectorstore = get_vector_store()
        return self._vectorstore

    async def get_or_create_session(
        self, db: AsyncSession, user: User, session_id: Optional[int] = None
    ) -> ChatSession:
        if session_id:
            result = await db.execute(
                select(ChatSession).where(
                    ChatSession.id == session_id, ChatSession.user_id == user.id
                )
            )
            session = result.scalar_one_or_none()
            if session:
                return session

        session = ChatSession(user_id=user.id, title="New Conversation")
        db.add(session)
        await db.flush()
        return session

    async def get_history(self, db: AsyncSession, session_id: int) -> List:
        result = await db.execute(
            select(Message)
            .where(Message.session_id == session_id)
            .order_by(Message.created_at)
        )
        messages = result.scalars().all()
        history = []
        for m in messages[-10:]:
            if m.role == "user":
                history.append(HumanMessage(content=m.content))
            elif m.role == "assistant":
                history.append(AIMessage(content=m.content))
        return history

    async def _build_logs_context(self, db: AsyncSession, user: User) -> str:
        result = await db.execute(
            select(SecurityLog)
            .where(SecurityLog.user_id == user.id)
            .order_by(SecurityLog.created_at.desc())
            .limit(12)
        )
        logs = result.scalars().all()
        if not logs:
            return "No logs analyzed yet. Upload logs in Upload Center or connect AWS in Cloud Connect."

        lines = []
        for log in logs:
            threats = []
            try:
                anomalies = json.loads(log.anomalies_json or "[]")
                if anomalies and isinstance(anomalies[0], dict):
                    rf = anomalies[0].get("rule_findings", [])
                    threats = [f.get("description", "") for f in rf if isinstance(f, dict)]
            except json.JSONDecodeError:
                pass

            sev = f"{(log.severity_score or 0) * 100:.0f}%"
            summary = (log.summary or "")[:400]
            threat_str = f" Threats: {'; '.join(threats[:3])}." if threats else ""
            lines.append(
                f"- **{log.filename}** ({log.log_type}, severity {sev}): {summary}{threat_str}"
            )
        return "\n".join(lines)

    async def _build_incidents_context(self, db: AsyncSession, user: User) -> str:
        result = await db.execute(
            select(Incident)
            .where(Incident.user_id == user.id)
            .order_by(Incident.created_at.desc())
            .limit(8)
        )
        incidents = result.scalars().all()
        if not incidents:
            return "No incidents recorded yet."

        return "\n".join(
            f"- **{inc.title}** ({inc.severity}, {inc.status}): "
            f"{(inc.description or 'No description')[:200]}"
            for inc in incidents
        )

    def _build_rag_context(self, query: str) -> Tuple[str, str]:
        results = self.vectorstore.search(query, top_k=5)
        if not results:
            return "No matching documents in the knowledge base. Upload policies in Upload Center.", ""
        context = "\n\n---\n\n".join(
            f"[Source: {r['source']}]\n{r['content']}" for r in results
        )
        citations = json.dumps([
            {"source": r["source"], "score": r["score"]} for r in results
        ])
        return context, citations

    async def _prepare_prompt(
        self,
        db: AsyncSession,
        user: User,
        content: str,
        use_rag: bool,
    ) -> Tuple[str, str, str, AgentType]:
        """Build system prompt, user prompt, citations, and agent type."""
        logs_context = await self._build_logs_context(db, user)
        incidents_context = await self._build_incidents_context(db, user)

        rag_context = ""
        citations = ""
        if use_rag:
            rag_context, citations = self._build_rag_context(content)
            user_prompt = CHAT_WITH_RAG_TEMPLATE.format(
                question=content,
                logs_context=logs_context,
                incidents_context=incidents_context,
                context=rag_context,
            )
        else:
            user_prompt = CHAT_NO_RAG_TEMPLATE.format(
                question=content,
                logs_context=logs_context,
                incidents_context=incidents_context,
            )

        agent_type = self.router.classify(content)
        agent_prompt = self.router.AGENT_PROMPTS[agent_type]
        system_prompt = f"{SOC_SYSTEM_PROMPT}\n\n{agent_prompt}"

        return system_prompt, user_prompt, citations, agent_type

    async def chat(
        self,
        db: AsyncSession,
        user: User,
        content: str,
        session_id: Optional[int] = None,
        use_rag: bool = True,
    ) -> tuple[Message, Message, str]:
        session = await self.get_or_create_session(db, user, session_id)
        user_msg = Message(session_id=session.id, role="user", content=content)
        db.add(user_msg)

        system_prompt, user_prompt, citations, _ = await self._prepare_prompt(
            db, user, content, use_rag
        )
        response_text = await self.llm.generate(system_prompt, user_prompt)

        assistant_msg = Message(
            session_id=session.id,
            role="assistant",
            content=response_text,
            citations=citations or None,
        )
        db.add(assistant_msg)
        if session.title == "New Conversation":
            session.title = content[:60] + ("..." if len(content) > 60 else "")
        await db.flush()
        return user_msg, assistant_msg, citations

    async def stream_chat(
        self,
        db: AsyncSession,
        user: User,
        content: str,
        session_id: Optional[int] = None,
        use_rag: bool = True,
    ) -> AsyncIterator[dict]:
        session = await self.get_or_create_session(db, user, session_id)
        history = await self.get_history(db, session.id)

        yield {"type": "session", "session_id": session.id}

        user_msg = Message(session_id=session.id, role="user", content=content)
        db.add(user_msg)
        await db.flush()

        system_prompt, user_prompt, citations, agent_type = await self._prepare_prompt(
            db, user, content, use_rag
        )
        logger.debug("Chat routed to agent: %s", agent_type.value)

        full_response = ""
        async for chunk in self.llm.stream(system_prompt, user_prompt, history=history):
            full_response += chunk
            yield {"type": "chunk", "content": chunk}

        assistant_msg = Message(
            session_id=session.id,
            role="assistant",
            content=full_response,
            citations=citations or None,
        )
        db.add(assistant_msg)
        if session.title == "New Conversation":
            session.title = content[:60] + ("..." if len(content) > 60 else "")
        await db.flush()
        yield {"type": "done", "session_id": session.id, "citations": citations}
