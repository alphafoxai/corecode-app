package router

import (
	"embed"
	"io/fs"
	"net/http"
	"strings"
	"sync/atomic"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-contrib/gzip"
	"github.com/gin-gonic/gin"
)

// WebAssets holds the dashboard frontend assets.
type WebAssets struct {
	BuildFS   fs.FS
	IndexPage []byte
	// Dir, when set, serves the frontend build from this directory instead of
	// BuildFS, so a console release replaces files on disk rather than the
	// process. IndexPage stays the fallback when Dir has no index.html.
	Dir string
	// RenderIndex applies the server-side snippets to index.html on every index
	// request, so a change to the settings they read shows on the next page load.
	RenderIndex func([]byte) []byte
}

// diskIndexPage reads index.html from a build on disk once per release.
type diskIndexPage struct {
	frontend *common.DiskFrontend
	fallback []byte
	read     atomic.Pointer[releaseIndexPage]
}

type releaseIndexPage struct {
	release string
	page    []byte
}

func (d *diskIndexPage) Bytes() []byte {
	release := d.frontend.Release()
	if cached := d.read.Load(); cached != nil && cached.release == release {
		return cached.page
	}
	page, err := d.frontend.ReadFile("index.html")
	if err != nil {
		// Logged once per release: the fallback is cached like a page read.
		common.SysError(common.LogText("frontend build has no readable index.html, serving the embedded one: %v", err))
		page = d.fallback
	}
	d.read.Store(&releaseIndexPage{release: release, page: page})
	return page
}

func SetWebRouter(router *gin.Engine, assets WebAssets, pluginDispatcher gin.HandlerFunc) {
	buildFS := assets.BuildFS
	if buildFS == nil {
		// A zero WebAssets serves no embedded build, as an empty embed.FS did.
		buildFS = embed.FS{}
	}
	frontendFS := common.EmbedFolder(buildFS, "web/dist")
	indexPage := assets.IndexPage
	render := assets.RenderIndex
	if render == nil {
		render = func(page []byte) []byte { return page }
	}
	var diskIndex *diskIndexPage
	if assets.Dir != "" {
		common.SysLog(common.LogText("serving the frontend build from %s", assets.Dir))
		disk := common.DiskFolder(assets.Dir, frontendFS)
		frontendFS = disk
		diskIndex = &diskIndexPage{frontend: disk, fallback: assets.IndexPage}
	}
	compress := gzip.Gzip(gzip.DefaultCompression)

	router.NoRoute(
		pluginDispatcher,
		middleware.RouteTag("web"),
		func(c *gin.Context) {
			// ServeFrontendFiles sends build files already compressed.
			if !frontendFS.Exists("/", c.Request.URL.Path) {
				compress(c)
			}
		},
		middleware.AccessTokenAudit(),
		middleware.GlobalWebRateLimit(frontendFS),
		middleware.Cache(),
		middleware.ServeFrontendFiles(frontendFS),
		func(c *gin.Context) {
			if strings.HasPrefix(c.Request.RequestURI, "/v1") || strings.HasPrefix(c.Request.RequestURI, "/api") || strings.HasPrefix(c.Request.RequestURI, "/assets") {
				controller.RelayNotFound(c)
				return
			}
			page := indexPage
			if diskIndex != nil {
				page = diskIndex.Bytes()
			}
			c.Header("Cache-Control", "no-cache")
			c.Data(http.StatusOK, "text/html; charset=utf-8", render(page))
		},
	)
}
