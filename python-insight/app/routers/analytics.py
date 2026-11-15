from typing import Annotated, Literal

from fastapi import APIRouter, Query

from app.cache import cached
from app.db import DB
from app.security import CurrentUser
from app.services import analytics

router = APIRouter(prefix="/analytics", tags=["analytics"])

# pandas is synchronous: `run_sync` executes it on a worker thread with a
# sync connection, so the event loop keeps serving other requests.


@cached(ttl=60)
async def _kpis(db: DB):
    return await db.run_sync(lambda s: analytics.kpis(s.connection()))


@cached(ttl=60)
async def _monthly(db: DB):
    return await db.run_sync(lambda s: analytics.monthly_revenue(s.connection()))


@cached(ttl=60)
async def _breakdown(db: DB, by: str):
    return await db.run_sync(lambda s: analytics.breakdown(s.connection(), by))


@cached(ttl=300)
async def _cohorts(db: DB, months: int):
    return await db.run_sync(lambda s: analytics.cohorts(s.connection(), months))


@cached(ttl=300)
async def _forecast(db: DB, horizon: int):
    return await db.run_sync(lambda s: analytics.forecast(s.connection(), horizon))


@router.get("/kpis")
async def kpis(db: DB, _: CurrentUser):
    return await _kpis(db=db)


@router.get("/revenue/monthly")
async def monthly(db: DB, _: CurrentUser):
    return await _monthly(db=db)


@router.get("/revenue/breakdown")
async def breakdown(db: DB, _: CurrentUser, by: Literal["region", "product", "segment"] = "region"):
    return await _breakdown(db=db, by=by)


@router.get("/cohorts")
async def cohorts(db: DB, _: CurrentUser, months: Annotated[int, Query(ge=3, le=24)] = 12):
    return await _cohorts(db=db, months=months)


@router.get("/forecast")
async def forecast(db: DB, _: CurrentUser, horizon: Annotated[int, Query(ge=1, le=12)] = 6):
    return await _forecast(db=db, horizon=horizon)
