from typing import Annotated, Literal

import pandas as pd
from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError

from app.cache import invalidate
from app.db import DB
from app.models import Customer, CustomerStatus, Order, Role, Segment
from app.schemas import (
    AtRisk,
    ChurnPrediction,
    CustomerCreate,
    CustomerOut,
    CustomerUpdate,
    Page,
)
from app.security import CurrentUser, require
from app.services import ml

router = APIRouter(prefix="/customers", tags=["customers"])

SORTABLE = {"name", "company", "monthly_spend", "tenure_months", "created_at", "nps"}


@router.get("", response_model=Page[CustomerOut])
async def list_customers(
    db: DB,
    _: CurrentUser,
    q: Annotated[str | None, Query(max_length=100, description="Search name, company, email")] = None,
    region: str | None = None,
    segment: Segment | None = None,
    status_: Annotated[CustomerStatus | None, Query(alias="status")] = None,
    sort: str = "-created_at",
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 20,
):
    stmt = select(Customer)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Customer.name.ilike(like), Customer.company.ilike(like), Customer.email.ilike(like)))
    if region:
        stmt = stmt.where(Customer.region == region)
    if segment:
        stmt = stmt.where(Customer.segment == segment)
    if status_:
        stmt = stmt.where(Customer.status == status_)

    field = sort.lstrip("-")
    if field not in SORTABLE:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Cannot sort by '{field}'")
    column = getattr(Customer, field)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = await db.scalars(stmt.order_by(column.desc() if sort.startswith("-") else column.asc(), Customer.id).offset((page - 1) * size).limit(size))
    return Page(items=rows.all(), total=total or 0, page=page, size=size)


@router.get("/stats")
async def segment_stats(db: DB, _: CurrentUser, by: Literal["region", "segment", "plan"] = "segment"):
    """pandas groupby with multiple aggregations in one pass."""
    df = await db.run_sync(lambda s: pd.read_sql(select(Customer.region, Customer.segment, Customer.plan, Customer.monthly_spend, Customer.nps, Customer.status), s.connection()))
    g = df.groupby(by).agg(customers=("status", "size"), avg_spend=("monthly_spend", "mean"), avg_nps=("nps", "mean"), churned=("status", lambda s: (s == "churned").mean() * 100))
    return g.round(2).reset_index(names="name").to_dict("records")


@router.get("/at-risk", response_model=list[AtRisk])
async def at_risk(db: DB, _: CurrentUser, limit: Annotated[int, Query(le=50)] = 10):
    """Batch-score every active customer with the current model (vectorised)."""
    df = await db.run_sync(lambda s: pd.read_sql(select(Customer).where(Customer.status == CustomerStatus.active), s.connection()))
    if df.empty:
        return []
    try:
        df["probability"] = ml.predict(df)
    except LookupError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e))
    top = df.nlargest(limit, "probability")
    return [AtRisk(customer_id=int(r.id), name=r.name, company=r.company, monthly_spend=float(r.monthly_spend), probability=round(float(r.probability), 4), risk=ml.risk_label(r.probability)) for r in top.itertuples()]


@router.get("/{customer_id}", response_model=CustomerOut)
async def get_customer(customer_id: int, db: DB, _: CurrentUser):
    if not (c := await db.get(Customer, customer_id)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")
    return c


@router.get("/{customer_id}/orders")
async def customer_orders(customer_id: int, db: DB, _: CurrentUser, limit: Annotated[int, Query(le=200)] = 50):
    rows = await db.scalars(select(Order).where(Order.customer_id == customer_id).order_by(Order.created_at.desc()).limit(limit))
    return [{"id": o.id, "product": o.product, "amount": o.amount, "created_at": o.created_at} for o in rows]


@router.get("/{customer_id}/churn", response_model=ChurnPrediction)
async def customer_churn(customer_id: int, db: DB, _: CurrentUser):
    if not (c := await db.get(Customer, customer_id)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")
    row = {f: getattr(c, f) for f in ml.NUMERIC} | {"segment": c.segment.value, "plan": c.plan}
    try:
        p = float(ml.predict(pd.DataFrame([row]))[0])
    except LookupError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e))
    return ChurnPrediction(customer_id=c.id, probability=round(p, 4), risk=ml.risk_label(p), drivers=ml.explain(row))


@router.post("", response_model=CustomerOut, status_code=201, dependencies=[require(Role.manager)])
async def create_customer(body: CustomerCreate, db: DB):
    c = Customer(**body.model_dump(mode="json") | {"segment": body.segment, "status": body.status})
    db.add(c)
    try:
        await db.commit()
    except IntegrityError:
        raise HTTPException(status.HTTP_409_CONFLICT, "A customer with this email already exists")
    await invalidate()
    return c


@router.patch("/{customer_id}", response_model=CustomerOut, dependencies=[require(Role.manager)])
async def update_customer(customer_id: int, body: CustomerUpdate, db: DB):
    if not (c := await db.get(Customer, customer_id)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")
    data = body.model_dump(exclude_unset=True, mode="json")
    for key, value in data.items():
        setattr(c, key, getattr(body, key) if key in {"segment", "status"} else value)
    try:
        await db.commit()
    except IntegrityError:
        raise HTTPException(status.HTTP_409_CONFLICT, "A customer with this email already exists")
    await invalidate()
    return c


@router.delete("/{customer_id}", status_code=204, dependencies=[require(Role.admin)])
async def delete_customer(customer_id: int, db: DB):
    if not (c := await db.get(Customer, customer_id)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")
    await db.delete(c)
    await db.commit()
    await invalidate()
