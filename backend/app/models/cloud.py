import enum
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class CloudProvider(str, enum.Enum):
    AWS = "aws"
    AZURE = "azure"
    GCP = "gcp"


class LogSource(str, enum.Enum):
    CLOUDTRAIL = "cloudtrail"
    CLOUDWATCH = "cloudwatch"


class CloudConnection(Base):
    __tablename__ = "cloud_connections"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    provider: Mapped[str] = mapped_column(String(32), default=CloudProvider.AWS.value)
    connection_name: Mapped[str] = mapped_column(String(255), nullable=False)
    region: Mapped[str] = mapped_column(String(64), default="us-east-1")
    log_source: Mapped[str] = mapped_column(String(64), default=LogSource.CLOUDTRAIL.value)
    log_group_name: Mapped[str | None] = mapped_column(String(512), nullable=True)
    encrypted_credentials: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="connected")
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_event_time: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    user = relationship("User", back_populates="cloud_connections")
