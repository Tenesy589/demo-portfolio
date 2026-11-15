import pandas as pd
from celery.result import AsyncResult
from fastapi import APIRouter, HTTPException, Request, status

from app.models import Role
from app.schemas import ChurnFeatures, ChurnPrediction, TaskRef, TaskStatus
from app.security import CurrentUser, require
from app.services import ml
from app.worker import celery, train_churn

router = APIRouter(tags=["ml"])


@router.post("/ml/churn/train", response_model=TaskRef, status_code=202, dependencies=[require(Role.admin)])
async def train(request: Request):
    """Kick off training in the Celery worker; poll the returned status URL."""
    task = train_churn.delay()
    return TaskRef(task_id=task.id, status_url=str(request.url_for("task_status", task_id=task.id)))


@router.get("/ml/churn/model")
async def model_info(_: CurrentUser):
    artifact = ml.registry.get()
    if not artifact:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Model not trained yet")
    return artifact["metrics"]


@router.post("/ml/churn/predict", response_model=ChurnPrediction)
async def predict(features: ChurnFeatures, _: CurrentUser):
    row = features.model_dump(mode="json")
    try:
        p = float(ml.predict(pd.DataFrame([row]))[0])
    except LookupError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e))
    return ChurnPrediction(probability=round(p, 4), risk=ml.risk_label(p), drivers=ml.explain(row))


@router.get("/tasks/{task_id}", response_model=TaskStatus, name="task_status")
async def task_status(task_id: str, _: CurrentUser):
    r = AsyncResult(task_id, app=celery)
    out = TaskStatus(task_id=task_id, state=r.state)
    if r.state == "PROGRESS":
        out.progress = r.info
    elif r.state == "SUCCESS":
        out.result, out.progress = r.result, {"percent": 100, "step": "Done"}
    elif r.state == "FAILURE":
        out.error = str(r.result)
    return out
