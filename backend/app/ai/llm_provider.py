"""Abstraction layer for multiple LLM providers with real-data fallback."""

import logging
from typing import AsyncIterator, Optional

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

try:
    from langchain_google_genai import ChatGoogleGenerativeAI
except ImportError:
    ChatGoogleGenerativeAI = None  # type: ignore

try:
    from langchain_community.chat_models import ChatOllama
except ImportError:
    ChatOllama = None  # type: ignore

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class LLMProviderService:
    """Factory for OpenAI, Gemini, and Ollama chat models."""

    def __init__(self, provider: Optional[str] = None):
        self.provider = (provider or settings.llm_provider).lower()

    def _has_api_key(self) -> bool:
        if self.provider == "openai":
            return bool(settings.openai_api_key and settings.openai_api_key != "not-set")
        if self.provider == "gemini":
            return bool(settings.gemini_api_key)
        if self.provider == "ollama":
            return True
        return False

    def get_chat_model(self, temperature: float = 0.2) -> BaseChatModel:
        if self.provider == "openai":
            return ChatOpenAI(
                model=settings.openai_model,
                api_key=settings.openai_api_key or "not-set",
                temperature=temperature,
                streaming=True,
            )
        if self.provider == "gemini":
            if ChatGoogleGenerativeAI is None:
                raise ValueError("Install langchain-google-genai for Gemini support")
            return ChatGoogleGenerativeAI(
                model=settings.gemini_model,
                google_api_key=settings.gemini_api_key or None,
                temperature=temperature,
            )
        if self.provider == "ollama":
            if ChatOllama is None:
                raise ValueError("Ollama support unavailable")
            return ChatOllama(
                base_url=settings.ollama_base_url,
                model=settings.ollama_model,
                temperature=temperature,
            )
        raise ValueError(f"Unsupported LLM provider: {self.provider}")

    def _extract_section(self, prompt: str, header: str) -> str:
        if header not in prompt:
            return ""
        body = prompt.split(header, 1)[-1]
        return body.split("###", 1)[0].strip()

    def _fallback_response(self, system_prompt: str, user_prompt: str) -> str:
        """Answer from workspace context in the prompt when LLM API is unavailable."""
        question = self._extract_section(user_prompt, "### Analyst question") or user_prompt[:500]
        logs_section = self._extract_section(user_prompt, "### Analyzed logs in this workspace")
        incidents_section = self._extract_section(user_prompt, "### Recent incidents")
        rag_section = self._extract_section(user_prompt, "### Retrieved knowledge base")

        q_lower = question.lower()
        lines = ["## Answer\n", f"**Your question:** {question}\n"]

        if any(w in q_lower for w in ("my log", "recent log", "upload", "analyze", "threat", "severity")):
            if logs_section and "No logs analyzed" not in logs_section:
                lines.append("### From your analyzed logs\n")
                lines.append(logs_section)
            else:
                lines.append(
                    "No logs in your workspace yet. Upload a file in **Upload Center** "
                    "or connect AWS in **Cloud Connect**.\n"
                )

        if any(w in q_lower for w in ("incident", "open case", "alert")):
            if incidents_section and "No incidents" not in incidents_section:
                lines.append("\n### From your incidents\n")
                lines.append(incidents_section)
            elif "incident" in q_lower:
                lines.append(
                    "\nNo incidents recorded yet. High-severity log analysis creates them automatically.\n"
                )

        if any(w in q_lower for w in ("policy", "compliance", "nist", "iso", "soc 2", "document")):
            if rag_section and "No matching documents" not in rag_section:
                lines.append("\n### From your knowledge base\n")
                lines.append(rag_section[:1500])
            elif any(w in q_lower for w in ("policy", "compliance", "document")):
                lines.append(
                    "\nNo matching documents found. Upload policies in **Upload Center**.\n"
                )

        if len(lines) <= 2:
            if logs_section and "No logs analyzed" not in logs_section:
                lines.append("### Workspace summary\n")
                lines.append(logs_section[:1200])
            if incidents_section and "No incidents" not in incidents_section:
                lines.append("\n### Incidents\n")
                lines.append(incidents_section[:800])

        if len(lines) <= 2:
            lines.append(
                "\nI could not find workspace data for this question. "
                "Upload logs or connect your cloud account, then ask again.\n"
            )

        lines.append(
            "\n---\n*Configure OpenAI/Gemini/Ollama in backend `.env` for full AI responses.*"
        )
        return "\n".join(lines)

    async def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.2,
    ) -> str:
        if not self._has_api_key():
            logger.warning("No LLM API key; using real-data fallback response")
            return self._fallback_response(system_prompt, user_prompt)

        try:
            model = self.get_chat_model(temperature=temperature)
            messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_prompt),
            ]
            response = await model.ainvoke(messages)
            return str(response.content)
        except Exception as exc:
            logger.error("LLM generate failed: %s", exc)
            return self._fallback_response(system_prompt, user_prompt)

    async def stream(
        self,
        system_prompt: str,
        user_prompt: str,
        history: Optional[list[BaseMessage]] = None,
    ) -> AsyncIterator[str]:
        if not self._has_api_key():
            text = self._fallback_response(system_prompt, user_prompt)
            chunk_size = 40
            for i in range(0, len(text), chunk_size):
                yield text[i : i + chunk_size]
            return

        try:
            model = self.get_chat_model()
            messages: list[BaseMessage] = [SystemMessage(content=system_prompt)]
            if history:
                messages.extend(history)
            messages.append(HumanMessage(content=user_prompt))

            async for chunk in model.astream(messages):
                if isinstance(chunk, AIMessage) and chunk.content:
                    yield str(chunk.content)
                elif hasattr(chunk, "content") and chunk.content:
                    yield str(chunk.content)
        except Exception as exc:
            logger.error("LLM stream failed: %s", exc)
            text = self._fallback_response(system_prompt, user_prompt)
            for i in range(0, len(text), 40):
                yield text[i : i + 40]
