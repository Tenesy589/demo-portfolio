package httpapi

import (
	"log/slog"
	"net"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/demo/pulsecheck/internal/metrics"
	"golang.org/x/time/rate"
)

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

// Flush keeps SSE working through the wrapper.
func (r *statusRecorder) Flush() {
	if f, ok := r.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func (r *statusRecorder) Unwrap() http.ResponseWriter { return r.ResponseWriter }

// observe logs and records metrics, labelled by route pattern (bounded cardinality).
func observe(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		route := r.Pattern
		if route == "" {
			route = "unmatched"
		}
		metrics.HTTPRequests.WithLabelValues(r.Method, route, strconv.Itoa(rec.status)).Inc()
		if r.URL.Path != "/health" && r.URL.Path != "/metrics" {
			slog.Info("http", "method", r.Method, "path", r.URL.Path, "status", rec.status, "dur", time.Since(start).Round(time.Microsecond))
		}
	})
}

func recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				slog.Error("panic", "err", err, "path", r.URL.Path)
				writeError(w, http.StatusInternalServerError, "internal error")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// rateLimiter is a per-IP token bucket. Idle visitors are evicted by a janitor goroutine.
type rateLimiter struct {
	mu       sync.Mutex
	visitors map[string]*visitor
	rps      rate.Limit
	burst    int
}

type visitor struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

func newRateLimiter(rps float64, burst int, stop <-chan struct{}) *rateLimiter {
	rl := &rateLimiter{visitors: map[string]*visitor{}, rps: rate.Limit(rps), burst: burst}
	go func() {
		t := time.NewTicker(time.Minute)
		defer t.Stop()
		for {
			select {
			case <-t.C:
				rl.mu.Lock()
				for ip, v := range rl.visitors {
					if time.Since(v.lastSeen) > 3*time.Minute {
						delete(rl.visitors, ip)
					}
				}
				rl.mu.Unlock()
			case <-stop:
				return
			}
		}
	}()
	return rl
}

func (rl *rateLimiter) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip, _, _ := net.SplitHostPort(r.RemoteAddr)
		rl.mu.Lock()
		v, ok := rl.visitors[ip]
		if !ok {
			v = &visitor{limiter: rate.NewLimiter(rl.rps, rl.burst)}
			rl.visitors[ip] = v
		}
		v.lastSeen = time.Now()
		rl.mu.Unlock()
		if !v.limiter.Allow() {
			w.Header().Set("Retry-After", "1")
			writeError(w, http.StatusTooManyRequests, "rate limit exceeded")
			return
		}
		next.ServeHTTP(w, r)
	})
}
