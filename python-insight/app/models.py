import enum
from datetime import datetime

from sqlalchemy import JSON, DateTime, Enum, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _values(e: type[enum.Enum]) -> list[str]:
    return [m.value for m in e]  # store enum *values* (e.g. "SMB"), not member names


class Role(str, enum.Enum):
    admin = "admin"
    manager = "manager"
    viewer = "viewer"


class Segment(str, enum.Enum):
    smb = "SMB"
    mid = "MidMarket"
    enterprise = "Enterprise"


class CustomerStatus(str, enum.Enum):
    lead = "lead"
    active = "active"
    churned = "churned"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    hashed_password: Mapped[str] = mapped_column(String(100))
    role: Mapped[Role] = mapped_column(Enum(Role, name="role", values_callable=_values), default=Role.viewer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    company: Mapped[str] = mapped_column(String(120), index=True)
    region: Mapped[str] = mapped_column(String(40), index=True)
    segment: Mapped[Segment] = mapped_column(Enum(Segment, name="segment", values_callable=_values))
    status: Mapped[CustomerStatus] = mapped_column(Enum(CustomerStatus, name="customer_status", values_callable=_values), index=True)
    plan: Mapped[str] = mapped_column(String(20))
    monthly_spend: Mapped[float] = mapped_column(Float)
    tenure_months: Mapped[int] = mapped_column(Integer)
    support_tickets: Mapped[int] = mapped_column(Integer, default=0)
    last_login_days: Mapped[int] = mapped_column(Integer, default=0)
    nps: Mapped[int] = mapped_column(Integer, default=7)
    contacts: Mapped[list[dict]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    orders: Mapped[list["Order"]] = relationship(back_populates="customer", cascade="all, delete-orphan")


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    product: Mapped[str] = mapped_column(String(60), index=True)
    amount: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    customer: Mapped[Customer] = relationship(back_populates="orders")


class Dataset(Base):
    """User-uploaded CSV, profiled asynchronously by a Celery worker."""

    __tablename__ = "datasets"

    id: Mapped[int] = mapped_column(primary_key=True)
    filename: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    profile: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    uploaded_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
