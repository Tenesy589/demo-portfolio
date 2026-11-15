// Package probe performs HTTP health checks and exposes them over gRPC.
package probe

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"syscall"
	"time"

	pulsev1 "github.com/demo/pulsecheck/gen/pulse/v1"
)

// Checker is safe for concurrent use: one shared http.Client means
// connection pooling and keep-alives across thousands of checks.
type Checker struct {
	client *http.Client
	name   string
}

func NewChecker(name string) *Checker {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.MaxIdleConnsPerHost = 32
	transport.TLSClientConfig = &tls.Config{MinVersion: tls.VersionTLS12}
	return &Checker{
		name: name,
		client: &http.Client{
			Transport: transport,
			// Don't follow redirects: a 301 is a valid "up" answer and following could hide problems.
			CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
		},
	}
}

func (c *Checker) Check(ctx context.Context, req *pulsev1.ProbeRequest) *pulsev1.ProbeResult {
	timeout := time.Duration(req.GetTimeoutMs()) * time.Millisecond
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	res := &pulsev1.ProbeResult{Id: req.GetId(), Url: req.GetUrl(), TlsDaysLeft: -1, Prober: c.name}
	start := time.Now()
	defer func() {
		res.LatencyMs = time.Since(start).Milliseconds()
		res.CheckedAtUnixMs = time.Now().UnixMilli()
	}()

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, req.GetUrl(), nil)
	if err != nil {
		res.Error = err.Error()
		return res
	}
	httpReq.Header.Set("User-Agent", "PulseCheck/1.0")

	resp, err := c.client.Do(httpReq)
	if err != nil {
		res.Error = describe(err, timeout)
		return res
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 64<<10)) // drain so the connection is reused

	res.StatusCode = int32(resp.StatusCode)
	if expect := req.GetExpectStatus(); expect != 0 {
		res.Up = resp.StatusCode == int(expect)
	} else {
		res.Up = resp.StatusCode < 400
	}
	if resp.TLS != nil && len(resp.TLS.PeerCertificates) > 0 {
		res.TlsDaysLeft = int32(time.Until(resp.TLS.PeerCertificates[0].NotAfter).Hours() / 24)
	}
	return res
}

// describe turns low-level network errors into something an operator can act on.
func describe(err error, timeout time.Duration) string {
	var dnsErr *net.DNSError
	var certErr *tls.CertificateVerificationError
	var unknownAuth x509.UnknownAuthorityError
	switch {
	case errors.Is(err, context.DeadlineExceeded):
		return fmt.Sprintf("Нет ответа за %.0f с (таймаут)", timeout.Seconds())
	case errors.As(err, &dnsErr):
		return "Домен не найден (DNS)"
	case errors.Is(err, syscall.ECONNREFUSED):
		return "Сервер отклонил соединение"
	case errors.Is(err, syscall.ECONNRESET):
		return "Сервер оборвал соединение"
	case errors.As(err, &certErr), errors.As(err, &unknownAuth):
		return "Неверный SSL-сертификат"
	default:
		return "Ошибка сети: " + err.Error()
	}
}
