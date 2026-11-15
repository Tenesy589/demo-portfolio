import time

from fastapi import FastAPI, Request, Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

REQUESTS = Counter("insight_http_requests_total", "HTTP requests", ["method", "route", "status"])
LATENCY = Histogram("insight_http_request_seconds", "HTTP latency", ["method", "route"], buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5))


def setup_metrics(app: FastAPI) -> None:
    @app.middleware("http")
    async def prometheus(request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        # Label by route *template* (/customers/{customer_id}), not raw path — keeps cardinality bounded.
        route = getattr(request.scope.get("route"), "path", "unmatched")
        elapsed = time.perf_counter() - start
        REQUESTS.labels(request.method, route, response.status_code).inc()
        LATENCY.labels(request.method, route).observe(elapsed)
        response.headers["Server-Timing"] = f"app;dur={elapsed * 1000:.1f}"
        return response

    @app.get("/metrics", include_in_schema=False)
    async def metrics() -> Response:
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
