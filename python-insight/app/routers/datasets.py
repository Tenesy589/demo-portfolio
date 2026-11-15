import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, UploadFile, status
from sqlalchemy import select

from app.config import settings
from app.db import DB
from app.models import Dataset, Role, User
from app.schemas import DatasetOut, ScrapeRequest
from app.security import CurrentUser, require
from app.services.scraper import scrape
from app.worker import profile_dataset

router = APIRouter(tags=["datasets & tools"])
MAX_BYTES = 20 * 1024 * 1024


@router.post("/datasets", response_model=DatasetOut, status_code=202)
async def upload(file: UploadFile, db: DB, user: Annotated[User, require(Role.manager)]):
    """Upload a CSV → stream it to disk in chunks → profile it in the background."""
    if not (file.filename or "").lower().endswith(".csv"):
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Only .csv files are supported")
    ds = Dataset(filename=file.filename, uploaded_by=user.id)
    db.add(ds)
    await db.flush()

    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    tmp = settings.uploads_dir / f"{uuid.uuid4()}.part"
    size = 0
    with tmp.open("wb") as out:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_BYTES:
                tmp.unlink(missing_ok=True)
                raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Max 20 MB")
            out.write(chunk)
    tmp.rename(settings.uploads_dir / f"{ds.id}.csv")
    await db.commit()
    profile_dataset.delay(ds.id)
    return ds


@router.get("/datasets", response_model=list[DatasetOut])
async def list_datasets(db: DB, _: CurrentUser):
    return (await db.scalars(select(Dataset).order_by(Dataset.id.desc()).limit(50))).all()


@router.get("/datasets/{dataset_id}", response_model=DatasetOut)
async def get_dataset(dataset_id: int, db: DB, _: CurrentUser):
    if not (ds := await db.get(Dataset, dataset_id)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dataset not found")
    return ds


@router.post("/tools/scrape")
async def scrape_urls(body: ScrapeRequest, _: CurrentUser):
    """Fetches all URLs concurrently — compare `total_ms` to `sequential_ms_estimate`."""
    return await scrape([str(u) for u in body.urls])
