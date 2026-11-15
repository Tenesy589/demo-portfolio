// Package scheduler decides *when* each monitor is checked and streams the
// work to the prober service over a single bidirectional gRPC stream.
package scheduler

import (
	"context"
	"log/slog"
	"strconv"
	"sync"
	"time"

	pulsev1 "github.com/demo/pulsecheck/gen/pulse/v1"
	"github.com/demo/pulsecheck/internal/broker"
	"github.com/demo/pulsecheck/internal/config"
	"github.com/demo/pulsecheck/internal/metrics"
	"github.com/demo/pulsecheck/internal/store"
)

type Scheduler struct {
	store   *store.Store
	history *store.History
	events  *broker.Broker[store.Result]
	client  pulsev1.ProberClient

	mu       sync.Mutex
	monitors map[int64]store.Monitor
	nextRun  map[int64]time.Time
	lastUp   map[int64]bool
	reload   chan struct{}
	started  time.Time
}

func New(st *store.Store, h *store.History, ev *broker.Broker[store.Result], client pulsev1.ProberClient) *Scheduler {
	return &Scheduler{
		store: st, history: h, events: ev, client: client,
		monitors: map[int64]store.Monitor{}, nextRun: map[int64]time.Time{}, lastUp: map[int64]bool{},
		reload: make(chan struct{}, 1), started: time.Now(),
	}
}

// Reload asks the scheduler to re-read monitors (non-blocking, coalesced).
func (s *Scheduler) Reload() {
	select {
	case s.reload <- struct{}{}:
	default:
	}
}

// Run blocks until ctx is cancelled, reconnecting the stream with backoff.
func (s *Scheduler) Run(ctx context.Context) {
	s.loadMonitors(ctx)
	for attempt := 0; ctx.Err() == nil; attempt++ {
		start := time.Now()
		if err := s.runStream(ctx); err != nil && ctx.Err() == nil {
			if time.Since(start) > 30*time.Second {
				attempt = 0 // the stream was healthy for a while — reset backoff
			}
			delay := config.Backoff(attempt, 250*time.Millisecond, 10*time.Second)
			slog.Warn("prober stream lost, reconnecting", "err", err, "in", delay)
			select {
			case <-time.After(delay):
			case <-ctx.Done():
			}
		}
	}
}

func (s *Scheduler) runStream(ctx context.Context) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	stream, err := s.client.ProbeStream(ctx)
	if err != nil {
		return err
	}
	slog.Info("prober stream connected")

	recvErr := make(chan error, 1)
	go func() { // receiver
		for {
			res, err := stream.Recv()
			if err != nil {
				recvErr <- err
				return
			}
			s.handle(ctx, res)
		}
	}()

	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			_ = stream.CloseSend()
			return nil
		case err := <-recvErr:
			return err
		case <-s.reload:
			s.loadMonitors(ctx)
		case now := <-ticker.C:
			for _, req := range s.due(now) {
				if err := stream.Send(req); err != nil {
					return err
				}
			}
		}
	}
}

func (s *Scheduler) loadMonitors(ctx context.Context) {
	list, err := s.store.ListMonitors(ctx)
	if err != nil {
		slog.Error("load monitors", "err", err)
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	fresh := make(map[int64]store.Monitor, len(list))
	for i, m := range list {
		fresh[m.ID] = m
		if _, ok := s.nextRun[m.ID]; !ok {
			// Spread first checks over a few seconds to avoid a thundering herd.
			s.nextRun[m.ID] = time.Now().Add(time.Duration(i%5) * 200 * time.Millisecond)
		}
	}
	for id := range s.monitors {
		if _, ok := fresh[id]; !ok {
			delete(s.nextRun, id)
			delete(s.lastUp, id)
			s.history.Forget(id)
			metrics.MonitorUp.DeleteLabelValues(s.monitors[id].Name)
		}
	}
	s.monitors = fresh
}

func (s *Scheduler) due(now time.Time) []*pulsev1.ProbeRequest {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []*pulsev1.ProbeRequest
	for id, m := range s.monitors {
		if now.Before(s.nextRun[id]) {
			continue
		}
		s.nextRun[id] = now.Add(time.Duration(m.IntervalSeconds) * time.Second)
		out = append(out, &pulsev1.ProbeRequest{
			Id: strconv.FormatInt(id, 10), Url: m.URL, TimeoutMs: int32(m.TimeoutMs), ExpectStatus: int32(m.ExpectStatus),
		})
	}
	return out
}

func (s *Scheduler) handle(ctx context.Context, res *pulsev1.ProbeResult) {
	id, _ := strconv.ParseInt(res.GetId(), 10, 64)
	s.mu.Lock()
	m, ok := s.monitors[id]
	wasUp, seen := s.lastUp[id]
	s.lastUp[id] = res.GetUp()
	s.mu.Unlock()
	if !ok {
		return // monitor deleted while the check was in flight
	}

	r := store.Result{
		MonitorID: id, Up: res.GetUp(), StatusCode: int(res.GetStatusCode()), LatencyMs: res.GetLatencyMs(),
		Error: res.GetError(), TLSDaysLeft: int(res.GetTlsDaysLeft()), CheckedAt: res.GetCheckedAtUnixMs(), Prober: res.GetProber(),
	}
	s.history.Add(r)
	s.events.Publish(r)

	result := "up"
	if !r.Up {
		result = "down"
	}
	metrics.ProbesTotal.WithLabelValues(m.Name, result).Inc()
	metrics.ProbeDuration.WithLabelValues(m.Name).Observe(float64(r.LatencyMs) / 1000)
	metrics.MonitorUp.WithLabelValues(m.Name).Set(map[bool]float64{true: 1, false: 0}[r.Up])
	if r.TLSDaysLeft >= 0 {
		metrics.TLSDaysLeft.WithLabelValues(m.Name).Set(float64(r.TLSDaysLeft))
	}

	// Persist only state *transitions* — not every check.
	at := time.UnixMilli(r.CheckedAt)
	switch {
	// Warm-up: right after a (re)start the services next to us may still be booting;
	// don't record that as an outage.
	case !r.Up && time.Since(s.started) < time.Minute:
	case !r.Up && (!seen || wasUp):
		cause := r.Error
		if cause == "" {
			cause = "HTTP " + strconv.Itoa(r.StatusCode)
		}
		slog.Warn("monitor DOWN", "monitor", m.Name, "cause", cause)
		if err := s.store.OpenIncident(ctx, id, at, cause); err != nil {
			slog.Error("open incident", "err", err)
		}
	case r.Up && seen && !wasUp:
		slog.Info("monitor recovered", "monitor", m.Name)
		if err := s.store.ResolveIncident(ctx, id, at); err != nil {
			slog.Error("resolve incident", "err", err)
		}
	}
}
