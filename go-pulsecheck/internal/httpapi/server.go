// Package httpapi is the REST + SSE interface, built on the standard
// library router (Go 1.22+ method and wildcard patterns) — no framework.
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"math/rand/v2"
	"net/http"
	"net/url"
	"strconv"
	"time"

	pulsev1 "github.com/demo/pulsecheck/gen/pulse/v1"
	"github.com/demo/pulsecheck/internal/broker"
	"github.com/demo/pulsecheck/internal/metrics"
	"github.com/demo/pulsecheck/internal/store"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"golang.org/x/sync/errgroup"
)

type Reloader interface{ Reload() }

type Server struct {
	Store     *store.Store
	History   *store.History
	Events    *broker.Broker[store.Result]
	Prober    pulsev1.ProberClient
	Scheduler Reloader
	Static    fs.FS
	RPS       float64
}

func (s *Server) Handler(stop <-chan struct{}) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/monitors", s.listMonitors)
	mux.HandleFunc("POST /api/monitors", s.createMonitor)
	mux.HandleFunc("GET /api/monitors/{id}", s.getMonitor)
	mux.HandleFunc("DELETE /api/monitors/{id}", s.deleteMonitor)
	mux.HandleFunc("GET /api/incidents", s.listIncidents)
	mux.HandleFunc("POST /api/check", s.adhocCheck)
	mux.HandleFunc("GET /api/events", s.events)
	mux.HandleFunc("GET /demo/flaky", flaky)
	mux.HandleFunc("GET /demo/slow", slow)
	mux.HandleFunc("GET /health", s.health)
	mux.Handle("GET /metrics", promhttp.Handler())
	mux.Handle("GET /", http.FileServerFS(s.Static))

	limiter := newRateLimiter(s.RPS, int(s.RPS)*2, stop)
	return recoverer(observe(cors(limiter.middleware(mux))))
}

// ---------- monitors ----------

type monitorView struct {
	store.Monitor
	store.Stats
}

func (s *Server) listMonitors(w http.ResponseWriter, r *http.Request) {
	list, err := s.Store.ListMonitors(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := make([]monitorView, len(list))
	for i, m := range list {
		out[i] = monitorView{m, s.History.Stats(m.ID)}
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) getMonitor(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	m, err := s.Store.GetMonitor(r.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "monitor not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"monitor": m, "stats": s.History.Stats(id), "history": s.History.Get(id)})
}

type createMonitorReq struct {
	Name            string `json:"name"`
	URL             string `json:"url"`
	IntervalSeconds int    `json:"interval_seconds"`
	TimeoutMs       int    `json:"timeout_ms"`
	ExpectStatus    int    `json:"expect_status"`
}

func (req *createMonitorReq) validate() error {
	u, err := url.ParseRequestURI(req.URL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return errors.New("url must be an absolute http(s) URL")
	}
	if req.Name == "" {
		req.Name = u.Host
	}
	if req.IntervalSeconds == 0 {
		req.IntervalSeconds = 15
	}
	if req.TimeoutMs == 0 {
		req.TimeoutMs = 5000
	}
	if req.IntervalSeconds < 5 || req.IntervalSeconds > 3600 {
		return errors.New("interval_seconds must be between 5 and 3600")
	}
	if req.TimeoutMs < 100 || req.TimeoutMs > 30000 {
		return errors.New("timeout_ms must be between 100 and 30000")
	}
	return nil
}

func (s *Server) createMonitor(w http.ResponseWriter, r *http.Request) {
	var req createMonitorReq
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if err := req.validate(); err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	m, err := s.Store.CreateMonitor(r.Context(), store.Monitor{Name: req.Name, URL: req.URL, IntervalSeconds: req.IntervalSeconds, TimeoutMs: req.TimeoutMs, ExpectStatus: req.ExpectStatus})
	switch {
	case errors.Is(err, store.ErrDuplicate):
		writeError(w, http.StatusConflict, err.Error())
	case err != nil:
		writeError(w, http.StatusInternalServerError, err.Error())
	default:
		s.Scheduler.Reload()
		writeJSON(w, http.StatusCreated, m)
	}
}

func (s *Server) deleteMonitor(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	if err := s.Store.DeleteMonitor(r.Context(), id); errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "monitor not found")
		return
	}
	s.Scheduler.Reload()
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) listIncidents(w http.ResponseWriter, r *http.Request) {
	list, err := s.Store.ListIncidents(r.Context(), 50)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, list)
}

// adhocCheck probes up to 50 URLs concurrently via unary gRPC calls,
// bounded with errgroup.SetLimit, preserving input order in the response.
func (s *Server) adhocCheck(w http.ResponseWriter, r *http.Request) {
	var body struct {
		URLs []string `json:"urls"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&body); err != nil || len(body.URLs) == 0 || len(body.URLs) > 50 {
		writeError(w, http.StatusBadRequest, `expected {"urls": [...]} with 1-50 URLs`)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	results := make([]*pulsev1.ProbeResult, len(body.URLs))
	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(10)
	start := time.Now()
	for i, u := range body.URLs {
		g.Go(func() error {
			res, err := s.Prober.Probe(gctx, &pulsev1.ProbeRequest{Id: strconv.Itoa(i), Url: u, TimeoutMs: 5000})
			if err != nil {
				res = &pulsev1.ProbeResult{Url: u, Error: err.Error()}
			}
			results[i] = res
			return nil
		})
	}
	_ = g.Wait()
	writeJSON(w, http.StatusOK, map[string]any{"total_ms": time.Since(start).Milliseconds(), "results": results})
}

// events streams probe results as Server-Sent Events.
func (s *Server) events(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")

	ch, unsubscribe := s.Events.Subscribe(64)
	defer unsubscribe()
	metrics.SSEClients.Inc()
	defer metrics.SSEClients.Dec()

	keepalive := time.NewTicker(20 * time.Second)
	defer keepalive.Stop()
	fmt.Fprint(w, ": connected\n\n")
	flusher.Flush()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-keepalive.C:
			fmt.Fprint(w, ": ping\n\n")
		case res := <-ch:
			data, _ := json.Marshal(res)
			fmt.Fprintf(w, "event: result\ndata: %s\n\n", data)
		}
		flusher.Flush()
	}
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	if err := s.Store.Ping(r.Context()); err != nil {
		writeError(w, http.StatusServiceUnavailable, "db: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "sse_clients": s.Events.Subscribers()})
}

// ---------- demo targets so the dashboard has something interesting offline ----------

func flaky(w http.ResponseWriter, _ *http.Request) {
	time.Sleep(time.Duration(20+rand.IntN(400)) * time.Millisecond)
	if rand.IntN(100) < 15 {
		writeError(w, http.StatusServiceUnavailable, "random failure")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func slow(w http.ResponseWriter, _ *http.Request) {
	time.Sleep(time.Duration(800+rand.IntN(1500)) * time.Millisecond)
	writeJSON(w, http.StatusOK, map[string]string{"status": "slow but ok"})
}

// ---------- helpers ----------

func pathID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return 0, false
	}
	return id, true
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
