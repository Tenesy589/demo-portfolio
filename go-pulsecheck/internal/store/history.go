package store

import (
	"slices"
	"sync"
)

// Result is one probe outcome as exposed by the API.
type Result struct {
	MonitorID   int64  `json:"monitor_id"`
	Up          bool   `json:"up"`
	StatusCode  int    `json:"status_code"`
	LatencyMs   int64  `json:"latency_ms"`
	Error       string `json:"error,omitempty"`
	TLSDaysLeft int    `json:"tls_days_left"`
	CheckedAt   int64  `json:"checked_at"`
	Prober      string `json:"prober"`
}

type Stats struct {
	Last      *Result `json:"last"`
	UptimePct float64 `json:"uptime_pct"`
	AvgMs     int64   `json:"avg_ms"`
	P95Ms     int64   `json:"p95_ms"`
	Samples   int     `json:"samples"`
}

// ring is a fixed-size circular buffer: O(1) insert, bounded memory per monitor.
type ring struct {
	buf  []Result
	next int
	full bool
}

func (r *ring) add(v Result) {
	r.buf[r.next] = v
	r.next = (r.next + 1) % len(r.buf)
	r.full = r.full || r.next == 0
}

func (r *ring) items() []Result {
	if !r.full {
		return slices.Clone(r.buf[:r.next])
	}
	return append(slices.Clone(r.buf[r.next:]), r.buf[:r.next]...)
}

// History keeps the last N results per monitor in memory.
type History struct {
	mu   sync.RWMutex
	size int
	data map[int64]*ring
}

func NewHistory(size int) *History {
	return &History{size: size, data: make(map[int64]*ring)}
}

func (h *History) Add(r Result) {
	h.mu.Lock()
	defer h.mu.Unlock()
	rg, ok := h.data[r.MonitorID]
	if !ok {
		rg = &ring{buf: make([]Result, h.size)}
		h.data[r.MonitorID] = rg
	}
	rg.add(r)
}

func (h *History) Get(id int64) []Result {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if rg, ok := h.data[id]; ok {
		return rg.items()
	}
	return nil
}

func (h *History) Forget(id int64) {
	h.mu.Lock()
	delete(h.data, id)
	h.mu.Unlock()
}

func (h *History) Stats(id int64) Stats {
	items := h.Get(id)
	if len(items) == 0 {
		return Stats{}
	}
	up, total := 0, int64(0)
	lat := make([]int64, 0, len(items))
	for _, r := range items {
		if r.Up {
			up++
		}
		total += r.LatencyMs
		lat = append(lat, r.LatencyMs)
	}
	slices.Sort(lat)
	last := items[len(items)-1]
	return Stats{
		Last:      &last,
		UptimePct: float64(up) / float64(len(items)) * 100,
		AvgMs:     total / int64(len(items)),
		P95Ms:     lat[min(len(lat)-1, len(lat)*95/100)],
		Samples:   len(items),
	}
}
