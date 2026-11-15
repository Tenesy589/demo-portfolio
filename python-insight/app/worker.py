"""Celery app: CPU-heavy and long-running work lives here, not in the API."""

from celery import Celery, Task
from celery.schedules import crontab

from app.config import settings
from app.db import SyncSession, sync_engine
from app.models import Dataset
from app.services import analytics, ml

celery = Celery("insight", broker=settings.redis_url, backend=settings.redis_url)
celery.conf.update(
    task_track_started=True,
    task_acks_late=True,  # if a worker dies mid-task, the task is redelivered
    worker_prefetch_multiplier=1,
    result_expires=3600,
    timezone="UTC",
    beat_schedule={
        "retrain-churn-nightly": {"task": "ml.train_churn", "schedule": crontab(hour=3, minute=0)},
    },
)


@celery.task(name="ml.train_churn", bind=True)
def train_churn(self: Task) -> dict:
    def progress(pct: int, step: str):
        self.update_state(state="PROGRESS", meta={"percent": pct, "step": step})

    progress(2, "Loading data")
    with sync_engine.connect() as conn:
        df = ml.load_training_data(conn)
    return ml.train(df, progress)


@celery.task(name="datasets.profile", bind=True, autoretry_for=(OSError,), retry_backoff=True, max_retries=3)
def profile_dataset(self: Task, dataset_id: int) -> dict:
    with SyncSession() as s:
        ds = s.get(Dataset, dataset_id)
        ds.status = "processing"
        s.commit()
        try:
            ds.profile = analytics.profile_csv(str(settings.uploads_dir / f"{dataset_id}.csv"))
            ds.status = "ready"
        except Exception as e:  # noqa: BLE001 — surface any parsing error to the user
            ds.status, ds.error = "failed", str(e)[:500]
        s.commit()
        return {"id": ds.id, "status": ds.status}
