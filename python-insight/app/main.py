import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import text

from app.cache import redis
from app.config import settings
from app.db import engine
from app.metrics import setup_metrics
from app.routers import analytics, auth, customers, datasets, ml

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("insight")


@asynccontextmanager
async def lifespan(_: FastAPI):
    log.info("InsightAPI starting")
    yield
    await engine.dispose()
    await redis.aclose()


app = FastAPI(
    title="InsightAPI",
    version="1.0.0",
    description="CRM + analytics + machine learning. pandas, scikit-learn, Celery, async SQLAlchemy.",
    lifespan=lifespan,
    docs_url="/docs",
)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"], allow_headers=["*"])
app.add_middleware(GZipMiddleware, minimum_size=1024)


for r in (auth.router, customers.router, analytics.router, ml.router, datasets.router):
    app.include_router(r, prefix="/api")

setup_metrics(app)


@app.get("/health", tags=["health"])
async def health():
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    await redis.ping()
    return {"status": "ok"}
