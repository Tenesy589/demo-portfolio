from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from sqlalchemy import select

from app.db import DB
from app.models import Role, User
from app.schemas import RoleUpdate, Token, UserOut
from app.security import CurrentUser, create_token, require, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginIn(BaseModel):
    email: EmailStr
    password: str


async def _login(db: DB, email: str, password: str) -> Token:
    user = await db.scalar(select(User).where(User.email == email.lower()))
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    return Token(access_token=create_token(user), user=UserOut.model_validate(user))


@router.post("/login", response_model=Token)
async def login(body: LoginIn, db: DB):
    return await _login(db, body.email, body.password)


@router.post("/token", response_model=Token, include_in_schema=False)
async def token(form: Annotated[OAuth2PasswordRequestForm, Depends()], db: DB):
    """OAuth2 password flow — powers the 'Authorize' button in Swagger UI."""
    return await _login(db, form.username, form.password)


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser):
    return user


@router.get("/users", response_model=list[UserOut], dependencies=[require(Role.admin)])
async def list_users(db: DB):
    return (await db.scalars(select(User).order_by(User.id))).all()


@router.patch("/users/{user_id}/role", response_model=UserOut)
async def change_role(user_id: int, body: RoleUpdate, db: DB, admin: Annotated[User, require(Role.admin)]):
    if user_id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot change your own role")
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    user.role = body.role
    await db.commit()
    return user
