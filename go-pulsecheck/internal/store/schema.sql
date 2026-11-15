CREATE TABLE IF NOT EXISTS monitors (
    id               BIGSERIAL PRIMARY KEY,
    name             TEXT        NOT NULL,
    url              TEXT        NOT NULL UNIQUE,
    interval_seconds INT         NOT NULL DEFAULT 15 CHECK (interval_seconds BETWEEN 5 AND 3600),
    timeout_ms       INT         NOT NULL DEFAULT 5000 CHECK (timeout_ms BETWEEN 100 AND 30000),
    expect_status    INT         NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS incidents (
    id          BIGSERIAL PRIMARY KEY,
    monitor_id  BIGINT      NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
    started_at  TIMESTAMPTZ NOT NULL,
    resolved_at TIMESTAMPTZ,
    cause       TEXT        NOT NULL
);

-- At most one open incident per monitor.
CREATE UNIQUE INDEX IF NOT EXISTS incidents_one_open ON incidents (monitor_id) WHERE resolved_at IS NULL;
