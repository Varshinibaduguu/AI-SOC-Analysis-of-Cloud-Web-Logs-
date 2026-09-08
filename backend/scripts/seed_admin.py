"""Create default security analyst user. Run: python -m scripts.seed_admin"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from app.core.security import get_password_hash
from app.db.session import AsyncSessionLocal, init_db
from app.models.user import User, UserRole

LEGACY_EMAILS = (
    "admin@soc.local",
    "admin@soc-copilot.com",
)
ANALYST_EMAIL = "analyst@soc-copilot.com"
ANALYST_PASSWORD = "Analyst123!"


async def main():
    await init_db()
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == ANALYST_EMAIL))
        if result.scalar_one_or_none():
            print(f"Analyst already exists: {ANALYST_EMAIL}")
            return

        for legacy in LEGACY_EMAILS:
            legacy_result = await db.execute(select(User).where(User.email == legacy))
            legacy_user = legacy_result.scalar_one_or_none()
            if legacy_user:
                legacy_user.email = ANALYST_EMAIL
                legacy_user.role = UserRole.SECURITY_ANALYST
                legacy_user.full_name = legacy_user.full_name or "SOC Analyst"
                legacy_user.hashed_password = get_password_hash(ANALYST_PASSWORD)
                await db.commit()
                print(f"Migrated to analyst: {ANALYST_EMAIL} / {ANALYST_PASSWORD}")
                return

        user = User(
            email=ANALYST_EMAIL,
            full_name="SOC Analyst",
            hashed_password=get_password_hash(ANALYST_PASSWORD),
            role=UserRole.SECURITY_ANALYST,
        )
        db.add(user)
        await db.commit()
        print(f"Created analyst: {ANALYST_EMAIL} / {ANALYST_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(main())
