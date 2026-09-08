from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.user import UserRole


# Auth
class UserRegister(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class UserLogin(BaseModel):
    # Plain str so seeded/local dev emails (e.g. admin@soc.local) can sign in
    email: str = Field(min_length=3, max_length=255)
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: UserRole
    user_id: int
    full_name: str


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# Chat
class ChatSessionCreate(BaseModel):
    title: str = "New Conversation"


class ChatSessionResponse(BaseModel):
    id: int
    title: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MessageCreate(BaseModel):
    content: str = Field(min_length=1)
    session_id: Optional[int] = None
    use_rag: bool = True


class MessageResponse(BaseModel):
    id: int
    role: str
    content: str
    citations: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# Documents
class DocumentResponse(BaseModel):
    id: int
    filename: str
    file_type: str
    chunk_count: int
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class RAGQuery(BaseModel):
    query: str = Field(min_length=3)
    top_k: int = Field(default=5, ge=1, le=20)


class RAGResult(BaseModel):
    content: str
    source: str
    score: float


class RAGQueryResponse(BaseModel):
    results: List[RAGResult]
    answer: Optional[str] = None


# Logs
class LogAnalysisResponse(BaseModel):
    id: int
    filename: str
    log_type: str
    summary: str
    severity_score: float
    anomalies: List[dict[str, Any]]
    threats: List[str]
    created_at: datetime


# Reports
class ReportGenerateRequest(BaseModel):
    title: Optional[str] = None
    logs_summary: Optional[str] = None
    alerts: Optional[List[str]] = None
    user_prompt: Optional[str] = None
    severity: str = "medium"
    log_ids: Optional[List[int]] = None


class ReportResponse(BaseModel):
    id: int
    title: str
    severity: str
    content_markdown: str
    root_cause: Optional[str]
    mitigation_steps: Optional[str]
    recommended_actions: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# Dashboard
class DashboardStats(BaseModel):
    incident_count: int
    document_count: int
    log_count: int
    chat_session_count: int
    report_count: int = 0
    avg_severity_score: float
    recent_incidents: List[dict[str, Any]]
    recent_logs: List[dict[str, Any]] = []
    threat_activity: List[dict[str, Any]]
    risk_score: float
    ai_alerts: List[dict[str, Any]]
    updated_at: Optional[str] = None


# Incidents
class IncidentResponse(BaseModel):
    id: int
    title: str
    severity: str
    status: str
    description: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# Cloud connectivity
class CloudConnectRequest(BaseModel):
    connection_name: str = Field(min_length=2, max_length=255)
    provider: str = Field(default="aws", pattern="^(aws|azure|gcp)$")
    region: str = Field(default="us-east-1", min_length=2, max_length=64)
    access_key_id: str = Field(
        min_length=20,
        max_length=128,
        description="AWS Access Key ID (20 characters, usually starts with AKIA)",
    )
    secret_access_key: str = Field(
        min_length=40,
        max_length=256,
        description="AWS Secret Access Key (40 characters)",
    )
    session_token: Optional[str] = None
    log_source: str = Field(default="cloudtrail", pattern="^(cloudtrail|cloudwatch)$")
    log_group_name: Optional[str] = None

    @field_validator(
        "connection_name",
        "access_key_id",
        "secret_access_key",
        "session_token",
        "log_group_name",
        mode="before",
    )
    @classmethod
    def strip_strings(cls, v: object) -> object:
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("session_token", mode="before")
    @classmethod
    def empty_session_token(cls, v: object) -> object:
        if v == "" or v is None:
            return None
        return v


class CloudConnectionResponse(BaseModel):
    id: int
    connection_name: str
    provider: str
    region: str
    log_source: str
    log_group_name: Optional[str] = None
    status: str
    last_error: Optional[str] = None
    last_event_time: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class CloudLogEvent(BaseModel):
    id: Optional[str] = None
    time: Optional[str] = None
    name: Optional[str] = None
    source: Optional[str] = None
    username: Optional[str] = None
    region: Optional[str] = None
    provider: Optional[str] = None
    log_source: Optional[str] = None
    detail: Optional[Any] = None
    raw: Optional[str] = None
    severity_score: Optional[float] = None
    threats: Optional[List[str]] = None


class CloudVerificationResponse(BaseModel):
    account: Optional[str] = None
    arn: Optional[str] = None
    user_id: Optional[str] = None
    source: Optional[str] = None
    region: Optional[str] = None


class CloudThreatAnalysis(BaseModel):
    severity_score: float = 0.0
    avg_severity_score: float = 0.0
    threat_percentage: int = 0
    threats: List[str] = []
    high_risk_count: int = 0
    event_count: int = 0
    log_id: Optional[int] = None


class CloudConnectResponse(BaseModel):
    connection: CloudConnectionResponse
    verification: CloudVerificationResponse
    events: List[CloudLogEvent] = []
    analysis: CloudThreatAnalysis


class CloudLogsResponse(BaseModel):
    events: List[CloudLogEvent]
    count: int
    analysis: Optional[dict[str, Any]] = None
