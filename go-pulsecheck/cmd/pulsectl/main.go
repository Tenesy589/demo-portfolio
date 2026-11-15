// Command pulsectl is a CLI for PulseCheck: talks REST to the API and gRPC
// directly to the prober for ad-hoc concurrent checks.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"text/tabwriter"
	"time"

	pulsev1 "github.com/demo/pulsecheck/gen/pulse/v1"
	"github.com/spf13/cobra"
	"golang.org/x/sync/errgroup"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

var (
	apiURL     string
	proberAddr string
)

func main() {
	root := &cobra.Command{Use: "pulsectl", Short: "PulseCheck command-line client", SilenceUsage: true}
	root.PersistentFlags().StringVar(&apiURL, "api", envOr("PULSE_API", "http://localhost:7105"), "API base URL")
	root.PersistentFlags().StringVar(&proberAddr, "prober", envOr("PULSE_PROBER", "localhost:9000"), "prober gRPC address")
	root.AddCommand(listCmd(), addCmd(), checkCmd())
	if err := root.Execute(); err != nil {
		os.Exit(1)
	}
}

func listCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "list",
		Short: "List monitors with live stats",
		RunE: func(cmd *cobra.Command, _ []string) error {
			var monitors []struct {
				ID        int64   `json:"id"`
				Name      string  `json:"name"`
				URL       string  `json:"url"`
				UptimePct float64 `json:"uptime_pct"`
				P95Ms     int64   `json:"p95_ms"`
				Last      *struct {
					Up bool `json:"up"`
				} `json:"last"`
			}
			if err := getJSON(cmd.Context(), "/api/monitors", &monitors); err != nil {
				return err
			}
			tw := tabwriter.NewWriter(os.Stdout, 0, 4, 2, ' ', 0)
			fmt.Fprintln(tw, "ID\tSTATUS\tNAME\tUPTIME\tP95\tURL")
			for _, m := range monitors {
				status := "…"
				if m.Last != nil {
					status = map[bool]string{true: "🟢 up", false: "🔴 down"}[m.Last.Up]
				}
				fmt.Fprintf(tw, "%d\t%s\t%s\t%.1f%%\t%dms\t%s\n", m.ID, status, m.Name, m.UptimePct, m.P95Ms, m.URL)
			}
			return tw.Flush()
		},
	}
}

func addCmd() *cobra.Command {
	var name string
	var interval int
	cmd := &cobra.Command{
		Use:   "add <url>",
		Short: "Add a monitor",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			body, _ := json.Marshal(map[string]any{"url": args[0], "name": name, "interval_seconds": interval})
			req, _ := http.NewRequestWithContext(cmd.Context(), http.MethodPost, apiURL+"/api/monitors", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				return err
			}
			defer resp.Body.Close()
			var out map[string]any
			_ = json.NewDecoder(resp.Body).Decode(&out)
			if resp.StatusCode >= 300 {
				return fmt.Errorf("%s: %v", resp.Status, out["error"])
			}
			fmt.Printf("✓ monitor #%v created\n", out["id"])
			return nil
		},
	}
	cmd.Flags().StringVar(&name, "name", "", "display name")
	cmd.Flags().IntVar(&interval, "every", 15, "interval in seconds")
	return cmd
}

func checkCmd() *cobra.Command {
	var concurrency int
	cmd := &cobra.Command{
		Use:   "check <url>...",
		Short: "Check many URLs concurrently via gRPC",
		Args:  cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, urls []string) error {
			conn, err := grpc.NewClient(proberAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
			if err != nil {
				return err
			}
			defer conn.Close()
			client := pulsev1.NewProberClient(conn)

			ctx, cancel := context.WithTimeout(cmd.Context(), 30*time.Second)
			defer cancel()
			results := make([]*pulsev1.ProbeResult, len(urls))
			g, gctx := errgroup.WithContext(ctx)
			g.SetLimit(concurrency)
			start := time.Now()
			for i, u := range urls {
				g.Go(func() error {
					res, err := client.Probe(gctx, &pulsev1.ProbeRequest{Id: strconv.Itoa(i), Url: u, TimeoutMs: 5000})
					if err != nil {
						return fmt.Errorf("%s: %w", u, err)
					}
					results[i] = res
					return nil
				})
			}
			if err := g.Wait(); err != nil {
				return err
			}
			tw := tabwriter.NewWriter(os.Stdout, 0, 4, 2, ' ', 0)
			fmt.Fprintln(tw, "STATUS\tCODE\tLATENCY\tTLS DAYS\tURL")
			var sum int64
			for _, r := range results {
				sum += r.LatencyMs
				status := map[bool]string{true: "🟢", false: "🔴"}[r.Up]
				code := strconv.Itoa(int(r.StatusCode))
				if r.Error != "" {
					code = r.Error
				}
				fmt.Fprintf(tw, "%s\t%s\t%dms\t%d\t%s\n", status, code, r.LatencyMs, r.TlsDaysLeft, r.Url)
			}
			_ = tw.Flush()
			fmt.Printf("\n%d URLs in %s wall time (sequential would be ~%dms)\n", len(urls), time.Since(start).Round(time.Millisecond), sum)
			return nil
		},
	}
	cmd.Flags().IntVarP(&concurrency, "concurrency", "c", 10, "max parallel checks")
	return cmd
}

func getJSON(ctx context.Context, path string, v any) error {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, apiURL+path, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("%s %s", path, resp.Status)
	}
	return json.NewDecoder(resp.Body).Decode(v)
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
