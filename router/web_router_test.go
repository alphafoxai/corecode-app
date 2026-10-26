package router

import (
	"bytes"
	"compress/gzip"
	"embed"
	"io"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// embeddedConsole stands in for the build compiled into the binary.
//
//go:embed testdata/web/dist
var embeddedConsole embed.FS

// writeConsoleBuild writes one console release under root and returns its directory.
func writeConsoleBuild(t *testing.T, root, release string, files map[string]string) string {
	t.Helper()
	dir := filepath.Join(root, release)
	for name, body := range files {
		path := filepath.Join(dir, name)
		require.NoError(t, os.MkdirAll(filepath.Dir(path), 0o755))
		require.NoError(t, os.WriteFile(path, []byte(body), 0o644))
	}
	return dir
}

// pointCurrentAt repoints root/current the way a console release does.
func pointCurrentAt(t *testing.T, root, release string) {
	t.Helper()
	next := filepath.Join(root, "current.next")
	require.NoError(t, os.Symlink(release, next))
	require.NoError(t, os.Rename(next, filepath.Join(root, "current")))
}

func diskConsoleRouter(t *testing.T, dir string) *gin.Engine {
	t.Helper()
	buildFS, err := fs.Sub(embeddedConsole, "testdata")
	require.NoError(t, err)
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	SetWebRouter(engine, WebAssets{
		BuildFS:   buildFS,
		IndexPage: []byte("embedded index"),
		Dir:       dir,
		RenderIndex: func(page []byte) []byte {
			return append([]byte("rendered "), page...)
		},
	}, func(c *gin.Context) {})
	return engine
}

func getConsole(t *testing.T, engine *gin.Engine, path string, gzipped bool) (int, string) {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, path, nil)
	if gzipped {
		request.Header.Set("Accept-Encoding", "gzip")
	}
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, request)
	body := recorder.Body.Bytes()
	if recorder.Header().Get("Content-Encoding") == "gzip" {
		reader, err := gzip.NewReader(bytes.NewReader(body))
		require.NoError(t, err)
		body, err = io.ReadAll(reader)
		require.NoError(t, err)
	}
	return recorder.Code, string(body)
}

func TestDiskConsoleSwitchesReleaseWithoutRestart(t *testing.T) {
	root := t.TempDir()
	writeConsoleBuild(t, root, "r1", map[string]string{
		"index.html":       "index r1",
		"static/js/app.js": "app r1",
		"logo.svg":         "<svg>r1</svg>",
	})
	writeConsoleBuild(t, root, "r2", map[string]string{
		"index.html":       "index r2",
		"static/js/app.js": "app r2",
		"logo.svg":         "<svg>r2</svg>",
	})
	pointCurrentAt(t, root, "r1")
	engine := diskConsoleRouter(t, filepath.Join(root, "current"))

	for _, step := range []struct {
		release string
		index   string
		app     string
		logo    string
	}{
		{"r1", "rendered index r1", "app r1", "<svg>r1</svg>"},
		{"r2", "rendered index r2", "app r2", "<svg>r2</svg>"},
	} {
		pointCurrentAt(t, root, step.release)

		code, body := getConsole(t, engine, "/console/keys", false)
		require.Equal(t, http.StatusOK, code)
		assert.Equal(t, step.index, body, "SPA route serves the current release's index")

		code, body = getConsole(t, engine, "/static/js/app.js", true)
		require.Equal(t, http.StatusOK, code)
		assert.Equal(t, step.app, body, "gzip cache follows the release")

		code, body = getConsole(t, engine, "/logo.svg", false)
		require.Equal(t, http.StatusOK, code)
		assert.Equal(t, step.logo, body, "an unhashed file follows the release")
	}
}

func TestDiskConsoleWithoutReleaseServesEmbeddedConsole(t *testing.T) {
	// Before the first console release the directory is empty.
	engine := diskConsoleRouter(t, filepath.Join(t.TempDir(), "current"))

	code, body := getConsole(t, engine, "/console", false)
	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, "rendered embedded index", body, "the embedded index is rendered like a released one")

	code, body = getConsole(t, engine, "/static/js/app.js", true)
	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, "embedded app", body, "assets fall back with the index")

	code, _ = getConsole(t, engine, "/api/unknown", false)
	assert.Equal(t, http.StatusNotFound, code, "API paths never fall through to the console")
}

func TestIndexRenderingFollowsSettingsWithoutRestart(t *testing.T) {
	root := t.TempDir()
	writeConsoleBuild(t, root, "r1", map[string]string{"index.html": "index r1"})
	pointCurrentAt(t, root, "r1")
	gin.SetMode(gin.TestMode)
	tag := "ga-1"
	render := func(page []byte) []byte { return append([]byte(tag+" "), page...) }
	engines := map[string]*gin.Engine{
		"embedded": gin.New(),
		"disk":     gin.New(),
	}
	SetWebRouter(engines["embedded"], WebAssets{IndexPage: []byte("embedded index"), RenderIndex: render}, func(c *gin.Context) {})
	SetWebRouter(engines["disk"], WebAssets{IndexPage: []byte("embedded index"), Dir: filepath.Join(root, "current"), RenderIndex: render}, func(c *gin.Context) {})

	for name, engine := range engines {
		tag = "ga-1"
		_, first := getConsole(t, engine, "/console", false)
		tag = "ga-2"
		_, second := getConsole(t, engine, "/console", false)
		assert.Regexp(t, "^ga-1 ", first, name)
		assert.Regexp(t, "^ga-2 ", second, name+": a settings change shows on the next page load")
	}
}
