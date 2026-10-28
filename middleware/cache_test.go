package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestCacheMarksHashedStaticFilesImmutable(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(Cache())
	router.NoRoute(func(c *gin.Context) { c.Status(http.StatusOK) })

	cases := map[string]string{
		"/":                                "no-cache",
		"/static/js/index.447b77ced2.js":   "public, max-age=31536000, immutable",
		"/static/css/index.c627d0db72.css": "public, max-age=31536000, immutable",
		"/favicon.svg":                     "max-age=604800",
	}
	for path, want := range cases {
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path, nil))
		if got := recorder.Header().Get("Cache-Control"); got != want {
			t.Errorf("%s: Cache-Control = %q, want %q", path, got, want)
		}
	}
}
