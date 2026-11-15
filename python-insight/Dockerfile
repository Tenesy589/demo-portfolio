# syntax=docker/dockerfile:1.7
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_DISABLE_PIP_VERSION_CHECK=1 PYTHONPATH=/app

# ---------- build wheels in a throwaway stage ----------
FROM base AS deps
RUN python -m venv /venv
ENV PATH=/venv/bin:$PATH
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt

# ---------- runtime: venv + source, non-root ----------
FROM base AS runtime
ENV PATH=/venv/bin:$PATH
RUN useradd --create-home --uid 1000 app && mkdir -p /data && chown app /data
COPY --from=deps /venv /venv
WORKDIR /app
COPY --chown=app . .
USER app
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s CMD python -c "import urllib.request,sys; sys.exit(urllib.request.urlopen('http://localhost:8000/health').status != 200)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--proxy-headers"]
