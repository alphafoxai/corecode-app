package deployment

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type deploymentState struct {
	Draining bool `json:"draining"`
	Active   int  `json:"active"`
}

func control(t *testing.T, client *http.Client, url, method, path string) deploymentState {
	t.Helper()
	req, err := http.NewRequest(method, url+"/_internal/deployment"+path, nil)
	require.NoError(t, err)
	res, err := client.Do(req)
	require.NoError(t, err)
	defer res.Body.Close()
	require.Equal(t, http.StatusOK, res.StatusCode)
	var state deploymentState
	require.NoError(t, common.DecodeJson(res.Body, &state))
	return state
}

func await(t *testing.T, ch <-chan struct{}) {
	t.Helper()
	select {
	case <-ch:
	case <-time.After(5 * time.Second):
		t.Fatal("handler synchronization timed out")
	}
}

func TestDrainPreservesStreamAndHandlerCleanup(t *testing.T) {
	ctx, cancel := context.WithCancel(t.Context())
	releaseBody := make(chan struct{})
	cleanupStarted := make(chan struct{})
	releaseCleanup := make(chan struct{})
	finished := make(chan struct{})
	gate := New(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/stream" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		defer func() {
			close(cleanupStarted)
			select {
			case <-releaseCleanup:
			case <-ctx.Done():
			}
		}()
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "data: first\n\n")
		w.(http.Flusher).Flush()
		select {
		case <-releaseBody:
		case <-ctx.Done():
			return
		}
		_, _ = io.WriteString(w, "data: final\n\ndata: [DONE]\n\n")
		w.(http.Flusher).Flush()
	}))
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gate.ServeHTTP(w, r)
		if r.URL.Path == "/stream" {
			close(finished)
		}
	}))
	defer srv.Close()
	defer cancel()
	client := srv.Client()
	client.Timeout = 5 * time.Second
	res, err := client.Get(srv.URL + "/stream")
	require.NoError(t, err)
	defer res.Body.Close()
	require.Equal(t, http.StatusOK, res.StatusCode)
	reader := bufio.NewReader(res.Body)
	first, err := reader.ReadString('\n')
	require.NoError(t, err)
	assert.Equal(t, "data: first\n", first)
	assert.Equal(t, deploymentState{Active: 1}, control(t, client, srv.URL, http.MethodGet, ""))
	assert.Equal(t, deploymentState{Draining: true, Active: 1}, control(t, client, srv.URL, http.MethodPost, "/drain"))
	rejected, err := client.Get(srv.URL + "/new")
	require.NoError(t, err)
	defer rejected.Body.Close()
	assert.Equal(t, http.StatusServiceUnavailable, rejected.StatusCode)
	assert.Equal(t, "5", rejected.Header.Get("Retry-After"))
	assert.Equal(t, "application/json", rejected.Header.Get("Content-Type"))
	rejectedBody, err := io.ReadAll(rejected.Body)
	require.NoError(t, err)
	assert.JSONEq(t, `{"error":{"type":"deployment_draining","message":"Service is draining for deployment; retry shortly."}}`, string(rejectedBody))
	assert.Equal(t, deploymentState{Active: 1}, control(t, client, srv.URL, http.MethodPost, "/resume"))
	assert.Equal(t, deploymentState{Draining: true, Active: 1}, control(t, client, srv.URL, http.MethodPost, "/drain"))
	close(releaseBody)
	await(t, cleanupStarted)
	assert.Equal(t, deploymentState{Draining: true, Active: 1}, control(t, client, srv.URL, http.MethodGet, ""))
	close(releaseCleanup)
	rest, err := io.ReadAll(reader)
	require.NoError(t, err, "draining must not truncate the admitted stream")
	assert.Equal(t, "data: first\n\ndata: final\n\ndata: [DONE]\n\n", first+string(rest))
	await(t, finished)
	assert.Equal(t, deploymentState{Draining: true}, control(t, client, srv.URL, http.MethodGet, ""))
}

func TestControlAccessAndMethods(t *testing.T) {
	cases := []struct {
		name, remote, method, path string
		status                     int
		draining                   bool
	}{
		{"IPv4 loopback", "127.0.0.1:9000", http.MethodPost, "/drain", 200, true},
		{"IPv6 loopback", "[::1]:9000", http.MethodPost, "/drain", 200, true},
		{"mapped loopback", "[::ffff:127.0.0.1]:9000", http.MethodPost, "/drain", 200, true},
		{"public peer", "203.0.113.1:9000", http.MethodPost, "/drain", 404, false},
		{"container proxy", "172.18.0.2:9000", http.MethodPost, "/drain", 404, false},
		{"private BFF", "10.0.0.2:9000", http.MethodPost, "/resume", 404, false},
		{"nonlocal status", "192.168.0.2:9000", http.MethodGet, "", 404, false},
		{"nonlocal descendant", "203.0.113.1:9000", http.MethodGet, "/unknown", 404, false},
		{"hostname", "localhost:9000", http.MethodPost, "/drain", 404, false},
		{"missing port", "127.0.0.1", http.MethodPost, "/drain", 404, false},
		{"unknown local path", "127.0.0.1:9000", http.MethodPost, "/unknown", 404, false},
		{"trailing slash", "127.0.0.1:9000", http.MethodGet, "/", 404, false},
		{"wrong status method", "127.0.0.1:9000", http.MethodPost, "", 405, false},
		{"wrong drain method", "127.0.0.1:9000", http.MethodGet, "/drain", 405, false},
		{"wrong resume method", "127.0.0.1:9000", http.MethodGet, "/resume", 405, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			calls := 0
			gate := New(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { calls++ }))
			req := httptest.NewRequest(tc.method, "/_internal/deployment"+tc.path, nil)
			req.RemoteAddr = tc.remote
			req.Header.Set("X-Forwarded-For", "127.0.0.1")
			req.Header.Set("X-Real-IP", "127.0.0.1")
			req.Header.Set("Forwarded", "for=127.0.0.1")
			res := httptest.NewRecorder()
			gate.ServeHTTP(res, req)
			assert.Equal(t, tc.status, res.Code)
			assert.Zero(t, calls)
			statusReq := httptest.NewRequest(http.MethodGet, "/_internal/deployment", nil)
			statusReq.RemoteAddr = "127.0.0.1:9000"
			statusRes := httptest.NewRecorder()
			gate.ServeHTTP(statusRes, statusReq)
			var state deploymentState
			require.NoError(t, common.DecodeJson(statusRes.Body, &state))
			assert.Equal(t, deploymentState{Draining: tc.draining}, state)
		})
	}
}

func TestDrainHealthResumeAndTerminalShutdown(t *testing.T) {
	calls := 0
	var gate *Gate
	gate = New(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		statusReq := httptest.NewRequest(http.MethodGet, "/_internal/deployment", nil)
		statusReq.RemoteAddr = "127.0.0.1:9000"
		status := httptest.NewRecorder()
		gate.ServeHTTP(status, statusReq)
		var state deploymentState
		require.NoError(t, common.DecodeJson(status.Body, &state))
		if r.URL.Path == "/api/status" {
			assert.Zero(t, state.Active, "health must not count itself")
		} else {
			assert.Equal(t, 1, state.Active)
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	request := func(method, path string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, nil)
		req.RemoteAddr = "127.0.0.1:9000"
		res := httptest.NewRecorder()
		gate.ServeHTTP(res, req)
		return res
	}
	request(http.MethodPost, "/_internal/deployment/drain")
	assert.Equal(t, 204, request(http.MethodGet, "/api/status").Code)
	assert.Equal(t, 503, request(http.MethodPost, "/api/status").Code)
	assert.Equal(t, 503, request(http.MethodGet, "/v1/messages").Code)
	assert.Equal(t, 1, calls, "rejected requests must not enter the handler")
	request(http.MethodPost, "/_internal/deployment/resume")
	assert.Equal(t, 204, request(http.MethodGet, "/v1/messages").Code)
	assert.Equal(t, 2, calls)
	gate.BeginShutdown()
	resumed := request(http.MethodPost, "/_internal/deployment/resume")
	assert.JSONEq(t, `{"draining":true,"active":0}`, resumed.Body.String())
	assert.Equal(t, 503, request(http.MethodGet, "/v1/messages").Code)
	assert.Equal(t, 2, calls)
}

func TestCanceledControlCanResume(t *testing.T) {
	mutated := make(chan struct{})
	finished := make(chan struct{})
	gate := New(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gate.ServeHTTP(w, r)
		if r.Header.Get("Hold-Control") == "true" {
			close(mutated)
			<-r.Context().Done()
			close(finished)
		}
	}))
	defer srv.Close()
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	client := srv.Client()
	client.Timeout = 5 * time.Second
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, srv.URL+"/_internal/deployment/drain", nil)
	require.NoError(t, err)
	req.Header.Set("Hold-Control", "true")
	result := make(chan error, 1)
	go func() {
		res, err := client.Do(req)
		if res != nil {
			res.Body.Close()
		}
		result <- err
	}()
	await(t, mutated)
	cancel()
	require.ErrorIs(t, <-result, context.Canceled)
	await(t, finished)
	assert.Equal(t, deploymentState{Draining: true}, control(t, client, srv.URL, http.MethodGet, ""))
	assert.Equal(t, deploymentState{}, control(t, client, srv.URL, http.MethodPost, "/resume"))
	res, err := client.Get(srv.URL + "/v1/messages")
	require.NoError(t, err)
	defer res.Body.Close()
	assert.Equal(t, http.StatusNoContent, res.StatusCode)
}

func TestExpiredControlContextDoesNotLatchDrain(t *testing.T) {
	gate := New(http.NotFoundHandler())
	ctx, cancel := context.WithDeadline(t.Context(), time.Now().Add(-time.Second))
	defer cancel()
	require.ErrorIs(t, ctx.Err(), context.DeadlineExceeded)
	for _, path := range []string{"/drain", "/resume"} {
		req := httptest.NewRequest(http.MethodPost, "/_internal/deployment"+path, nil).WithContext(ctx)
		req.RemoteAddr = "127.0.0.1:9000"
		res := httptest.NewRecorder()
		gate.ServeHTTP(res, req)
		require.Equal(t, http.StatusOK, res.Code)
		var state deploymentState
		require.NoError(t, common.DecodeJson(res.Body, &state))
		assert.Equal(t, deploymentState{Draining: path == "/drain"}, state)
	}
}

func TestHijackedHandlerRemainsActiveUntilReturn(t *testing.T) {
	ctx, cancel := context.WithCancel(t.Context())
	release := make(chan struct{})
	finished := make(chan struct{})
	gate := New(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		conn, rw, err := w.(http.Hijacker).Hijack()
		if err != nil {
			return
		}
		defer conn.Close()
		_, _ = fmt.Fprint(rw, "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: test\r\n\r\n")
		_ = rw.Flush()
		select {
		case <-release:
		case <-ctx.Done():
		}
	}))
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gate.ServeHTTP(w, r)
		if r.URL.Path == "/socket" {
			close(finished)
		}
	}))
	defer srv.Close()
	defer cancel()
	conn, err := net.DialTimeout("tcp", strings.TrimPrefix(srv.URL, "http://"), 5*time.Second)
	require.NoError(t, err)
	defer conn.Close()
	require.NoError(t, conn.SetDeadline(time.Now().Add(5*time.Second)))
	_, err = io.WriteString(conn, "GET /socket HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: test\r\n\r\n")
	require.NoError(t, err)
	res, err := http.ReadResponse(bufio.NewReader(conn), nil)
	require.NoError(t, err)
	defer res.Body.Close()
	require.Equal(t, http.StatusSwitchingProtocols, res.StatusCode)
	client := srv.Client()
	client.Timeout = 5 * time.Second
	assert.Equal(t, deploymentState{Draining: true, Active: 1}, control(t, client, srv.URL, http.MethodPost, "/drain"))
	close(release)
	await(t, finished)
	assert.Equal(t, deploymentState{Draining: true}, control(t, client, srv.URL, http.MethodGet, ""))
}
