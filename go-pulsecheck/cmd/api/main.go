// Command api runs the REST/SSE API, the dashboard and the scheduler.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	pulsev1 "github.com/demo/pulsecheck/gen/pulse/v1"
	"github.com/demo/pulsecheck/internal/broker"
	"github.com/demo/pulsecheck/internal/config"
	"github.com/demo/pulsecheck/internal/httpapi"
	"github.com/demo/pulsecheck/internal/scheduler"
	"github.com/demo/pulsecheck/internal/store"
	"github.com/demo/pulsecheck/internal/web"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	if err := run(); err != nil {
		slog.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg := config.Load()
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	st, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer st.Close()
	seed(ctx, st, cfg)

	conn, err := grpc.NewClient(cfg.ProberAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return err
	}
	defer conn.Close()
	prober := pulsev1.NewProberClient(conn)

	history := store.NewHistory(120)
	events := broker.New[store.Result]()
	sched := scheduler.New(st, history, events, prober)

	api := &httpapi.Server{Store: st, History: history, Events: events, Prober: prober, Scheduler: sched, Static: web.FS(), RPS: cfg.RateLimitRPS}
	srv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           api.Handler(ctx.Done()),
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		sched.Run(ctx)
	}()

	errCh := make(chan error, 1)
	go func() {
		slog.Info("api listening", "addr", cfg.HTTPAddr)
		if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
	}

	// Graceful shutdown: stop accepting, let in-flight requests finish (SSE clients get ctx cancelled).
	slog.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	err = srv.Shutdown(shutdownCtx)
	wg.Wait()
	return err
}

// seed adds demo monitors on first start.
func seed(ctx context.Context, st *store.Store, cfg config.Config) {
	if list, err := st.ListMonitors(ctx); err != nil || len(list) > 0 {
		return
	}
	defaults := []store.Monitor{
		{Name: "Flaky demo service", URL: cfg.PublicURL + "/demo/flaky", IntervalSeconds: 5, TimeoutMs: 2000},
		{Name: "Slow demo service", URL: cfg.PublicURL + "/demo/slow", IntervalSeconds: 10, TimeoutMs: 2000},
		{Name: "GitHub", URL: "https://github.com", IntervalSeconds: 30, TimeoutMs: 5000},
		{Name: "Cloudflare DNS", URL: "https://1.1.1.1", IntervalSeconds: 30, TimeoutMs: 5000},
		{Name: "Go website", URL: "https://go.dev", IntervalSeconds: 30, TimeoutMs: 5000},
	}
	for _, u := range cfg.SeedURLs {
		defaults = append(defaults, store.Monitor{Name: u, URL: u, IntervalSeconds: 10, TimeoutMs: 3000})
	}
	for _, m := range defaults {
		if _, err := st.CreateMonitor(ctx, m); err != nil {
			slog.Warn("seed monitor", "url", m.URL, "err", err)
		}
	}
	slog.Info("seeded demo monitors", "count", len(defaults))
}
