// Package deployment controls admission while an instance waits for handlers to finish.
package deployment

import (
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
)

const controlPath = "/_internal/deployment"

// Gate wraps the entire HTTP handler, including its deferred cleanup. It must be
// installed outside normal middleware and must not be copied after first use.
type Gate struct {
	next     http.Handler
	mu       sync.Mutex
	draining bool
	terminal bool
	active   int
}

func New(next http.Handler) *Gate {
	return &Gate{next: next}
}

// BeginShutdown permanently closes admission without canceling admitted requests.
// A deployment resume cannot reopen admission after process shutdown begins.
func (g *Gate) BeginShutdown() {
	g.mu.Lock()
	g.terminal = true
	g.draining = true
	g.mu.Unlock()
}

func (g *Gate) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == controlPath || strings.HasPrefix(r.URL.Path, controlPath+"/") {
		g.serveControl(w, r)
		return
	}
	if r.Method == http.MethodGet && r.URL.Path == "/api/status" {
		g.next.ServeHTTP(w, r)
		return
	}

	// Admission and drain share a lock: zero while draining proves that no
	// admitted handler (including deferred cleanup) is still running.
	g.mu.Lock()
	if g.draining {
		g.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Retry-After", "5")
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = io.WriteString(w, `{"error":{"type":"deployment_draining","message":"Service is draining for deployment; retry shortly."}}`+"\n")
		return
	}
	g.active++
	g.mu.Unlock()
	defer func() {
		g.mu.Lock()
		g.active--
		g.mu.Unlock()
	}()

	// Preserve the original writer's Flusher, Hijacker and other interfaces.
	g.next.ServeHTTP(w, r)
}

func (g *Gate) serveControl(w http.ResponseWriter, r *http.Request) {
	// Never use Gin's ClientIP or forwarded headers for deployment authority.
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil || !net.ParseIP(host).IsLoopback() {
		http.NotFound(w, r)
		return
	}

	var method string
	switch r.URL.Path {
	case controlPath:
		method = http.MethodGet
	case controlPath + "/drain", controlPath + "/resume":
		method = http.MethodPost
	default:
		http.NotFound(w, r)
		return
	}
	if r.Method != method {
		w.Header().Set("Allow", method)
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	g.mu.Lock()
	switch r.URL.Path {
	case controlPath + "/drain":
		g.draining = true
	case controlPath + "/resume":
		if !g.terminal {
			g.draining = false
		}
	}
	draining, active := g.draining, g.active
	g.mu.Unlock()

	// Mutations do not wait for handlers or depend on the caller's context.
	// A canceled deployment can inspect state and resume with a fresh request.
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = fmt.Fprintf(w, "{\"draining\":%t,\"active\":%d}\n", draining, active)
}
