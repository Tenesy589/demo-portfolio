from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


engine = create_async_engine(settings.database_url, pool_size=10, max_overflow=20, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

# Sync engine for Celery tasks and pandas.read_sql.
sync_engine = create_engine(settings.sync_database_url, pool_pre_ping=True)
SyncSession = sessionmaker(sync_engine, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


DB = Annotated[AsyncSession, Depends(get_session)]
