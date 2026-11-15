from datetime import UTC, datetime, timedelta
from typing import Annotated

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from app.config import settings
from app.db import DB
from app.models import Role, User

oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/token")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=10)).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def create_token(user: User) -> str:
    payload = {
        "sub": str(user.id),
        "role": user.role.value,
        "name": user.name,
        "exp": datetime.now(UTC) + timedelta(minutes=settings.jwt_ttl_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


async def current_user(token: Annotated[str, Depends(oauth2)], db: DB) -> User:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token", headers={"WWW-Authenticate": "Bearer"})
    user = await db.get(User, int(payload["sub"]))
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User no longer exists")
    return user


CurrentUser = Annotated[User, Depends(current_user)]

_RANK = {Role.viewer: 0, Role.manager: 1, Role.admin: 2}


def require(min_role: Role):
    """Dependency factory for hierarchical RBAC: admin ⊃ manager ⊃ viewer."""

    async def checker(user: CurrentUser) -> User:
        if _RANK[user.role] < _RANK[min_role]:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Requires role '{min_role.value}'")
        return user

    return Depends(checker)
