from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class SecurityLog(Base):
    __tablename__ = "security_logs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    log_type: Mapped[str] = mapped_column(String(100), default="generic")
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    severity_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    anomalies_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_preview: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    user = relationship("User", back_populates="security_logs")
