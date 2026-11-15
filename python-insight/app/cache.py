import functools
import hashlib
import json
from collections.abc import Awaitable, Callable
from typing import ParamSpec, TypeVar

from redis.asyncio import Redis

from app.config import settings

redis = Redis.from_url(settings.redis_url, decode_responses=True)

P = ParamSpec("P")
R = TypeVar("R")


def cached(ttl: int = 60, prefix: str = "cache"):
    """Cache JSON-serialisable results in Redis, keyed by function name + kwargs."""

    def decorator(fn: Callable[P, Awaitable[R]]) -> Callable[P, Awaitable[R]]:
        @functools.wraps(fn)
        async def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
            cacheable = {k: v for k, v in kwargs.items() if isinstance(v, (str, int, float, bool, type(None)))}
            digest = hashlib.sha1(json.dumps(cacheable, sort_keys=True).encode()).hexdigest()[:12]
            key = f"{prefix}:{fn.__name__}:{digest}"
            if (hit := await redis.get(key)) is not None:
                return json.loads(hit)
            result = await fn(*args, **kwargs)
            await redis.set(key, json.dumps(result, default=str), ex=ttl)
            return result

        return wrapper

    return decorator


async def invalidate(prefix: str = "cache") -> None:
    async for key in redis.scan_iter(f"{prefix}:*"):
        await redis.delete(key)
