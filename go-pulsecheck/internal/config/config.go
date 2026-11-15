// Package config reads 12-factor configuration from the environment.
package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	HTTPAddr     string
	GRPCAddr     string
	ProberAddr   string
	DatabaseURL  string
	Workers      int
	RateLimitRPS float64
	SeedURLs     []string
	PublicURL    string
	AdminToken   string
}

func Load() Config {
	return Config{
		HTTPAddr:     env("HTTP_ADDR", ":8080"),
		GRPCAddr:     env("GRPC_ADDR", ":9000"),
		ProberAddr:   env("PROBER_ADDR", "localhost:9000"),
		DatabaseURL:  env("DATABASE_URL", "postgres://pulse:pulse@localhost:5432/pulse?sslmode=disable"),
		Workers:      envInt("PROBER_CONCURRENCY", 64),
		RateLimitRPS: float64(envInt("RATE_LIMIT_RPS", 20)),
		SeedURLs:     splitNonEmpty(env("SEED_URLS", "")),
		PublicURL:    env("PUBLIC_URL", "http://pulse-api:8080"),
		AdminToken:   env("PULSE_ADMIN_TOKEN", ""),
	}
}

func env(key, def string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return def
}

func envInt(key string, def int) int {
	if n, err := strconv.Atoi(os.Getenv(key)); err == nil {
		return n
	}
	return def
}

func splitNonEmpty(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

// Backoff returns an exponential delay capped at max.
func Backoff(attempt int, base, max time.Duration) time.Duration {
	d := base << min(attempt, 10)
	return min(d, max)
}
