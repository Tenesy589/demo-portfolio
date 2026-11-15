// Package metrics declares Prometheus collectors.
package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	ProbeDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "pulse_probe_duration_seconds",
		Help:    "Latency of health checks.",
		Buckets: []float64{.025, .05, .1, .25, .5, 1, 2.5, 5, 10},
	}, []string{"monitor"})

	MonitorUp = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "pulse_monitor_up",
		Help: "1 if the last check succeeded.",
	}, []string{"monitor"})

	ProbesTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "pulse_probes_total",
		Help: "Health checks performed.",
	}, []string{"monitor", "result"})

	TLSDaysLeft = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "pulse_tls_days_left",
		Help: "Days until the TLS certificate expires.",
	}, []string{"monitor"})

	HTTPRequests = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "pulse_http_requests_total",
		Help: "API requests.",
	}, []string{"method", "route", "code"})

	SSEClients = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "pulse_sse_clients",
		Help: "Connected live-dashboard clients.",
	})
)
