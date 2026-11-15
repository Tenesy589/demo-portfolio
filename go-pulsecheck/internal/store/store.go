// Package store persists monitors and incidents in Postgres (pgx) and keeps
// recent probe results in memory.
package store

import (
	"context"
	_ "embed"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed schema.sql
var schema string

var (
	ErrNotFound  = errors.New("not found")
	ErrDuplicate = errors.New("monitor with this URL already exists")
)

type Monitor struct {
	ID              int64     `json:"id"`
	Name            string    `json:"name"`
	URL             string    `json:"url"`
	IntervalSeconds int       `json:"interval_seconds"`
	TimeoutMs       int       `json:"timeout_ms"`
	ExpectStatus    int       `json:"expect_status"`
	CreatedAt       time.Time `json:"created_at"`
}

type Incident struct {
	ID          int64      `json:"id"`
	MonitorID   int64      `json:"monitor_id"`
	MonitorName string     `json:"monitor_name"`
	StartedAt   time.Time  `json:"started_at"`
	ResolvedAt  *time.Time `json:"resolved_at"`
	Cause       string     `json:"cause"`
}

type Store struct{ db *pgxpool.Pool }

// Open connects with retries — in Compose the DB may still be starting.
func Open(ctx context.Context, url string) (*Store, error) {
	var lastErr error
	for attempt := range 15 {
		pool, err := pgxpool.New(ctx, url)
		if err == nil {
			if err = pool.Ping(ctx); err == nil {
				if _, err = pool.Exec(ctx, schema); err == nil {
					return &Store{db: pool}, nil
				}
			}
			pool.Close()
		}
		lastErr = err
		select {
		case <-time.After(time.Duration(attempt+1) * 500 * time.Millisecond):
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	return nil, fmt.Errorf("connect postgres: %w", lastErr)
}

func (s *Store) Close()                         { s.db.Close() }
func (s *Store) Ping(ctx context.Context) error { return s.db.Ping(ctx) }

const monitorCols = `id, name, url, interval_seconds, timeout_ms, expect_status, created_at`

func (s *Store) ListMonitors(ctx context.Context) ([]Monitor, error) {
	rows, _ := s.db.Query(ctx, `SELECT `+monitorCols+` FROM monitors ORDER BY id`)
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Monitor])
}

func (s *Store) GetMonitor(ctx context.Context, id int64) (Monitor, error) {
	rows, _ := s.db.Query(ctx, `SELECT `+monitorCols+` FROM monitors WHERE id = $1`, id)
	m, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByPos[Monitor])
	if errors.Is(err, pgx.ErrNoRows) {
		return m, ErrNotFound
	}
	return m, err
}

func (s *Store) CreateMonitor(ctx context.Context, m Monitor) (Monitor, error) {
	rows, _ := s.db.Query(ctx,
		`INSERT INTO monitors (name, url, interval_seconds, timeout_ms, expect_status) VALUES ($1, $2, $3, $4, $5) RETURNING `+monitorCols,
		m.Name, m.URL, m.IntervalSeconds, m.TimeoutMs, m.ExpectStatus)
	created, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByPos[Monitor])
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return created, ErrDuplicate
	}
	return created, err
}

func (s *Store) DeleteMonitor(ctx context.Context, id int64) error {
	tag, err := s.db.Exec(ctx, `DELETE FROM monitors WHERE id = $1`, id)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

// OpenIncident is idempotent thanks to the partial unique index.
func (s *Store) OpenIncident(ctx context.Context, monitorID int64, at time.Time, cause string) error {
	_, err := s.db.Exec(ctx, `INSERT INTO incidents (monitor_id, started_at, cause) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, monitorID, at, cause)
	return err
}

func (s *Store) ResolveIncident(ctx context.Context, monitorID int64, at time.Time) error {
	_, err := s.db.Exec(ctx, `UPDATE incidents SET resolved_at = $2 WHERE monitor_id = $1 AND resolved_at IS NULL`, monitorID, at)
	return err
}

func (s *Store) ListIncidents(ctx context.Context, limit int) ([]Incident, error) {
	rows, _ := s.db.Query(ctx, `
		SELECT i.id, i.monitor_id, m.name, i.started_at, i.resolved_at, i.cause
		FROM incidents i JOIN monitors m ON m.id = i.monitor_id
		ORDER BY i.started_at DESC LIMIT $1`, limit)
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Incident])
}
