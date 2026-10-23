# Agent Note: Precompress console assets with brotli at build time

Status: implemented

## Problem

The console's first load was about 2 MB of gzip, and mainland China users
fetch it across a lossy international link. `middleware/frontend_static.go`
already gzips each build file once and caches the bytes, but gzip at that
level is the only encoding the server offers. The relay's Caddy cannot add a
better one: an encoded response is never re-encoded, and when Caddy did the
compressing itself, its zstd encoder only reached 1.53 MB on the 5.3 MB entry
chunk against gzip's 1.50 MB, and 1.36 MB at its slowest level with over
100 ms of CPU per request.

## Decision

`web/scripts/precompress.mjs` runs after `rsbuild build` and writes a brotli
copy, at the maximum quality, beside every `.js`, `.css`, `.svg` and `.json`
file of at least 1 KB in `dist/`, keeping only copies smaller than the
original. The copies are embedded with the rest of `web/dist`.

`ServeFrontendFiles` sends `<path>.br` as is, with `Content-Encoding: br`, to
a client whose `Accept-Encoding` contains `br`, when the copy exists and the
extension has a known MIME type. Every other request takes the existing path:
the cached gzip, or `http.FileServer`.

## Alternatives considered

- **Compress in Caddy.** Measured above: no gain at the default level and
  10% at a CPU cost paid on every request. Caddy's encoders limit their
  window to save memory, so command-line ratios do not carry over.
- **Brotli at request time in Go, cached like gzip.** Maximum-quality brotli
  takes seconds on multi-megabyte chunks, which the first visitor after each
  deploy would wait for.
- **zstd instead of brotli.** Safari does not accept zstd, and brotli at
  maximum quality is smaller for these files.

## Consequences

- A br-capable browser's first load of the entry page's assets drops from
  2,006 KB to 1,197 KB. Clients without br get the same gzip bytes as before.
- `web/dist` gains 1,719 `.br` files, 15.6 MB, so the binary and image grow by
  that much.
- `bun run build` takes longer: 12 s with Bun and 21 s with Node on an M-series
  laptop. The CI runner was not timed.
- `frontend_static.go` and `package.json` diverge from upstream.

## Verification

- `go test ./middleware/ -run TestServeFrontendFiles`: the new
  `TestServeFrontendFilesSendsPrecompressedBrotli` covers br for a br client,
  HEAD, and gzip for a gzip-only client. It fails against the previous
  handler. The existing once-only test now counts source-file opens, because a
  br request also probes for the `.br` copy.
- A Linux binary built with this `web/dist` ran behind `caddy:2` loaded with
  `corecode-infra`'s production Caddyfile. The entry chunk came back as br
  (818 KB) or gzip (1,551 KB) depending on `Accept-Encoding`, both decoded
  byte-identical to the uncompressed file, `Cache-Control` was kept, and
  `/v1/models` answered as before.
