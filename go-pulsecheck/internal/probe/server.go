package probe

import (
	"context"
	"errors"
	"io"
	"log/slog"

	pulsev1 "github.com/demo/pulsecheck/gen/pulse/v1"
	"golang.org/x/sync/errgroup"
)

// Server implements the gRPC Prober service.
type Server struct {
	pulsev1.UnimplementedProberServer
	checker     *Checker
	concurrency int
}

func NewServer(checker *Checker, concurrency int) *Server {
	return &Server{checker: checker, concurrency: concurrency}
}

func (s *Server) Probe(ctx context.Context, req *pulsev1.ProbeRequest) (*pulsev1.ProbeResult, error) {
	return s.checker.Check(ctx, req), nil
}

// ProbeStream fans incoming requests out to goroutines (bounded by a
// semaphore) and fans results back in through a single sender, because
// grpc.ServerStream.Send must not be called concurrently.
func (s *Server) ProbeStream(stream pulsev1.Prober_ProbeStreamServer) error {
	ctx := stream.Context()
	results := make(chan *pulsev1.ProbeResult, s.concurrency)
	sem := make(chan struct{}, s.concurrency)
	g, gctx := errgroup.WithContext(ctx)

	// Sender: the only goroutine that writes to the stream.
	g.Go(func() error {
		for {
			select {
			case r, ok := <-results:
				if !ok {
					return nil
				}
				if err := stream.Send(r); err != nil {
					return err
				}
			case <-gctx.Done():
				return gctx.Err()
			}
		}
	})

	// Receiver: spawn one goroutine per request, at most `concurrency` in flight.
	g.Go(func() error {
		var inflight errgroup.Group
		defer func() {
			_ = inflight.Wait()
			close(results)
		}()
		for {
			req, err := stream.Recv()
			if errors.Is(err, io.EOF) {
				return nil
			}
			if err != nil {
				return err
			}
			select {
			case sem <- struct{}{}:
			case <-gctx.Done():
				return gctx.Err()
			}
			inflight.Go(func() error {
				defer func() { <-sem }()
				select {
				case results <- s.checker.Check(gctx, req):
				case <-gctx.Done():
				}
				return nil
			})
		}
	})

	err := g.Wait()
	if err != nil && !errors.Is(err, context.Canceled) {
		slog.Warn("probe stream closed", "err", err)
	}
	return nil
}
