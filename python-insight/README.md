# InsightAPI: CRM, analytics and machine learning (Python)

What Python is used for most in industry: data analysis, ML, automation, plus a modern async API on top.

```bash
docker compose up -d --build     # → http://localhost:7103/docs  (Authorize: admin@insight.dev / admin1234)
```

## What's inside

| Feature | Where |
|---|---|
| **pandas analytics**: KPIs, monthly revenue with a rolling average, breakdowns, **cohort retention matrix** | `app/services/analytics.py` |
| **Forecasting**: linear trend plus Fourier seasonality (scikit-learn), with a 95% interval and R² | `analytics.forecast` |
| **Churn ML**: two pipelines (LogReg vs RandomForest) compared by 5-fold CV ROC-AUC, the best one kept, atomic model swap | `app/services/ml.py` |
| **Explainable predictions**: model-agnostic "what if this feature were typical?" drivers | `ml.explain` |
| **Celery**: training with live progress (`/api/tasks/{id}`), CSV profiling, a nightly beat schedule | `app/worker.py` |
| **asyncio**: concurrent scraper (semaphore, `to_thread` for CPU-bound parsing) | `app/services/scraper.py` |
| **Async SQLAlchemy 2**: pandas runs through `run_sync` and never blocks the event loop | `app/routers/analytics.py` |
| **RBAC**: hierarchical roles (admin ⊃ manager ⊃ viewer) via a FastAPI dependency factory | `app/security.py` |
| Pydantic v2 validation, Alembic migrations, Redis cache decorator, Prometheus `/metrics`, chunked uploads with a size limit | |

Seed data is synthetic, but churn really depends on the features (tickets, NPS, last login), so the model learns a real signal (ROC-AUC ≈ 0.83).

**Stack:** FastAPI · Pydantic v2 · SQLAlchemy 2 (async) · Alembic · pandas · NumPy · scikit-learn · Celery · Redis · PostgreSQL 17
