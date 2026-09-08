"""Multi-agent routing for SOC workflows."""

import logging
from enum import Enum
from typing import Optional

from app.ai.llm_provider import LLMProviderService
from app.ai.prompts import (
    COMPLIANCE_PROMPT,
    INCIDENT_REPORT_PROMPT,
    LOG_ANALYSIS_PROMPT,
    SOC_SYSTEM_PROMPT,
    THREAT_ANALYSIS_PROMPT,
)

logger = logging.getLogger(__name__)


class AgentType(str, Enum):
    THREAT = "threat_analysis"
    LOG = "log_analysis"
    COMPLIANCE = "compliance"
    INCIDENT = "incident_report"
    GENERAL = "general"


class AgentRouter:
    """Routes requests to specialized LangChain-style agents."""

    KEYWORDS = {
        AgentType.THREAT: [
            "threat", "attack", "malware", "ransomware", "exploit", "cve", "privilege escalation",
        ],
        AgentType.LOG: [
            "log", "cloudtrail", "kubernetes", "firewall", "failed login", "anomaly",
        ],
        AgentType.COMPLIANCE: [
            "compliance", "soc 2", "iso 27001", "nist", "audit", "policy",
        ],
        AgentType.INCIDENT: [
            "incident report", "generate report", "root cause", "timeline", "post-mortem",
        ],
    }

    AGENT_PROMPTS = {
        AgentType.THREAT: THREAT_ANALYSIS_PROMPT,
        AgentType.LOG: LOG_ANALYSIS_PROMPT,
        AgentType.COMPLIANCE: COMPLIANCE_PROMPT,
        AgentType.INCIDENT: INCIDENT_REPORT_PROMPT,
        AgentType.GENERAL: "Answer the analyst's question directly using workspace context when available.",
    }

    def __init__(self, llm: Optional[LLMProviderService] = None):
        self.llm = llm or LLMProviderService()

    def classify(self, message: str) -> AgentType:
        lower = message.lower()
        scores = {agent: 0 for agent in AgentType if agent != AgentType.GENERAL}
        for agent, keywords in self.KEYWORDS.items():
            for kw in keywords:
                if kw in lower:
                    scores[agent] += 1
        best = max(scores, key=scores.get)  # type: ignore[arg-type]
        if scores[best] > 0:
            return best
        return AgentType.GENERAL

    async def run(self, message: str, context: str = "") -> tuple[str, AgentType]:
        agent_type = self.classify(message)
        agent_prompt = self.AGENT_PROMPTS[agent_type]
        system = f"{SOC_SYSTEM_PROMPT}\n\n{agent_prompt}"
        user_content = message
        if context:
            user_content = f"Context:\n{context}\n\nUser request:\n{message}"
        response = await self.llm.generate(system, user_content)
        return response, agent_type
