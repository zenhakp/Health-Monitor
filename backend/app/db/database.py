from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool
from app.core.config import settings
from app.db.models import Base
from datetime import datetime
from sqlalchemy import select

print("=" * 50)
print("DATABASE_URL:", settings.DATABASE_URL)
print("=" * 50)

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.APP_ENV == "development",
    poolclass=NullPool,
)

async_session_maker = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncSession:
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()

async def seed_admin():
    """Create the default admin account if it doesn't exist."""
    from app.db.models import User, UserRole
    from app.core.security import hash_password
    from app.core.encryption import encrypt
    import uuid

    ADMIN_EMAIL = "zenha4504@gmail.com"
    ADMIN_PASSWORD = "blah2010"  # change this

    async with async_session_maker() as session:
        result = await session.execute(
            select(User).where(User.email == ADMIN_EMAIL)
        )
        existing = result.scalar_one_or_none()
        if not existing:
            admin = User(
                id=uuid.uuid4(),
                email=ADMIN_EMAIL,
                hashed_password=hash_password(ADMIN_PASSWORD),
                full_name_encrypted=encrypt("System Administrator"),
                role=UserRole.admin,
                is_active=True,
                created_at=datetime.utcnow(),
            )
            session.add(admin)
            await session.commit()
            print(f"Admin account created: {ADMIN_EMAIL}")
        else:
            print(f"Admin account already exists: {ADMIN_EMAIL}")