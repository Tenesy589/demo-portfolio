from datetime import datetime
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, Field, HttpUrl

from app.models import CustomerStatus, Role, Segment

T = TypeVar("T")


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    size: int


# ---------- auth ----------
class Token(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: "UserOut"


class UserOut(ORM):
    id: int
    email: EmailStr
    name: str
    role: Role


class RoleUpdate(BaseModel):
    role: Role


# ---------- customers ----------
class Contact(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    phone: str | None = Field(default=None, pattern=r"^\+?[0-9 ()-]{7,20}$")
    role: str | None = None


class CustomerBase(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    company: str = Field(min_length=2, max_length=120)
    region: Literal["Europe", "North America", "Asia", "LATAM", "Africa"]
    segment: Segment
    status: CustomerStatus = CustomerStatus.lead
    plan: Literal["basic", "pro", "enterprise"]
    monthly_spend: float = Field(ge=0, le=1_000_000)
    tenure_months: int = Field(ge=0, le=600, default=0)
    support_tickets: int = Field(ge=0, default=0)
    last_login_days: int = Field(ge=0, default=0)
    nps: int = Field(ge=0, le=10, default=7)
    contacts: list[Contact] = Field(default_factory=list, max_length=10)


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    """PATCH semantics: every field optional, only provided fields are written."""

    name: str | None = Field(default=None, min_length=2, max_length=120)
    email: EmailStr | None = None
    company: str | None = None
    region: Literal["Europe", "North America", "Asia", "LATAM", "Africa"] | None = None
    segment: Segment | None = None
    status: CustomerStatus | None = None
    plan: Literal["basic", "pro", "enterprise"] | None = None
    monthly_spend: float | None = Field(default=None, ge=0)
    tenure_months: int | None = Field(default=None, ge=0)
    support_tickets: int | None = Field(default=None, ge=0)
    last_login_days: int | None = Field(default=None, ge=0)
    nps: int | None = Field(default=None, ge=0, le=10)
    contacts: list[Contact] | None = None


class CustomerOut(ORM, CustomerBase):
    id: int
    created_at: datetime


# ---------- ML ----------
class ChurnPrediction(BaseModel):
    customer_id: int | None = None
    probability: float
    risk: Literal["low", "medium", "high"]
    drivers: list[dict]


class AtRisk(BaseModel):
    customer_id: int
    name: str
    company: str
    monthly_spend: float
    probability: float
    risk: Literal["low", "medium", "high"]


class ChurnFeatures(BaseModel):
    monthly_spend: float = Field(ge=0)
    tenure_months: int = Field(ge=0)
    support_tickets: int = Field(ge=0)
    last_login_days: int = Field(ge=0)
    nps: int = Field(ge=0, le=10)
    segment: Segment
    plan: Literal["basic", "pro", "enterprise"]


class TaskRef(BaseModel):
    task_id: str
    status_url: str


class TaskStatus(BaseModel):
    task_id: str
    state: str
    progress: dict | None = None
    result: dict | None = None
    error: str | None = None


# ---------- datasets / tools ----------
class DatasetOut(ORM):
    id: int
    filename: str
    status: str
    profile: dict | None
    error: str | None
    created_at: datetime


class ScrapeRequest(BaseModel):
    urls: list[HttpUrl] = Field(min_length=1, max_length=20)


Token.model_rebuild()
