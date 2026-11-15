// Command prober runs the gRPC health-check service.
package main

import (
	"context"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"syscall"

	pulsev1 "github.com/demo/pulsecheck/gen/pulse/v1"
	"github.com/demo/pulsecheck/internal/config"
	"github.com/demo/pulsecheck/internal/probe"
	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/reflection"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	cfg := config.Load()
	host, _ := os.Hostname()

	lis, err := net.Listen("tcp", cfg.GRPCAddr)
	if err != nil {
		slog.Error("listen", "err", err)
		os.Exit(1)
	}
	srv := grpc.NewServer()
	pulsev1.RegisterProberServer(srv, probe.NewServer(probe.NewChecker(host), cfg.Workers))
	hs := health.NewServer()
	healthpb.RegisterHealthServer(srv, hs) // standard gRPC health protocol
	reflection.Register(srv)                // lets grpcurl discover the API

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		slog.Info("shutting down: draining in-flight probes")
		hs.Shutdown()
		srv.GracefulStop()
	}()

	slog.Info("prober listening", "addr", cfg.GRPCAddr, "concurrency", cfg.Workers)
	if err := srv.Serve(lis); err != nil {
		slog.Error("serve", "err", err)
		os.Exit(1)
	}
}
