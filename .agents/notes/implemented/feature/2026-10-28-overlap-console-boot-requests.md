# Agent Note: Overlap the console's boot requests

Status: implemented

## Problem

The 2026-10-27 change cut the bytes a cold visit downloads, but a console page
still took about 3 s to show content on a cold visit and 1 s on a warm one.
Most of that time went to requests that waited on each other. Each request to
`corecode.live` costs about 170 ms from the mainland, because the Tokyo edge
forwards everything, static files included, to the relay in `us-west2`.

Measured on `/dashboard/overview` before this change:

1. The entry bundle downloads and runs.
2. `main.tsx` renders only after `i18nReady`, which waits for two locale chunks:
   the visitor's language (140 KB brotli for `zhCN`) and the `en` fallback
   (89 KB).
3. The root route's `beforeLoad` runs only after that render, so the auth
   refresh and the setup check start only after both locales have loaded.
4. The router asks for the page's code (17 chunks for the dashboard) only after
   `beforeLoad` resolves.
5. The page renders and only then requests its data.

Every locale already carries every key (`bun run i18n:sync` fills the gaps), so
the `en` chunk was never read for a Chinese visitor.

## Decision

- **`main.tsx` starts the auth refresh, the setup check and the page's route
  chunks before it waits for the locale.** `bootstrapAuthentication()` keeps a
  refresh that is in flight, so the root guard awaits the same request.
  `prefetchSetupStatus()` stores the check, and the root guard takes it with
  `takeSetupStatus()`. A later check in the same page load, such as the one
  after setup completes, makes a fresh request. `router.loadRouteChunk()`
  caches its promise on the route, so the router reuses the download.
- **A supported language loads alone.** `fallbackLng` maps each supported
  language to no fallback and keeps `en` for unsupported languages.
  `locales.test.ts` fails when a locale lacks a value for any `en` key, since a
  missing key would now render as its source text.
- **`index.html` preloads the visitor's locale beside the entry bundle.** The
  locale imports carry `webpackChunkName: "locale-<code>"`, and
  `pluginPreloadLocale` in `rsbuild.config.ts` writes an inline script with the
  chunk URLs. The script picks the language the way i18next does: the
  `i18nextLng` cache first, then the browser languages, mapped as
  `convertDetectedLanguage` maps them.
- **The dashboard defers code it does not show on first paint.** The model
  filter dialog loads `DateTimePicker` (react-day-picker with every locale, 26 KB
  brotli) when it first opens, and the FAQ panel renders through `RichContent`,
  which loads marked and DOMPurify (about 47 KB brotli) lazily.
- **The server marks files under `/static/` `public, max-age=31536000,
  immutable`** (`middleware/cache.go`). The build names every file there by its
  content hash. Other build files keep `max-age=604800`, and `index.html`
  keeps `no-cache`.

## Alternatives considered

- **A CSS progress bar in `index.html`, shown while `#root` is empty.** In the
  A/B run it delayed first contentful paint and largest contentful paint by
  about 1 s on both cold and warm visits, so it was removed. The cause was not
  found.
- **Drop locale keys the source never references.** About 1,300 of 8,093 keys
  have no literal match, but server messages are English keys that the console
  translates at runtime, so a literal search cannot prove a key is unused.
- **`LazyMotion` for framer-motion.** About 37 KB brotli sits in the layout's
  chunks. Switching would touch every `motion.*` call, and at 600 KB/s it saves
  about 60 ms. Not done.
- **Serve `/static/` from the Tokyo edge.** It removes one Tokyo–Los Angeles
  round trip from each serial static fetch on a cold visit. It belongs to
  `corecode-infra`, which owns the edge, and is not part of this change.

## Consequences

Local A/B on `/dashboard/overview`, signed in as root: the Go server with
`FRONTEND_DIR`, and Chrome emulating 170 ms of latency. Cold runs disable the
cache. Medians of 5 runs (600 KB/s) and 3 runs (100 KB/s):

| Profile | Metric | Before | After |
|---|---|---|---|
| 600 KB/s, cold | First contentful paint | 2804 ms | 1924 ms |
| 600 KB/s, cold | Largest contentful paint | 3164 ms | 2296 ms |
| 600 KB/s, cold | Last API response | 3105 ms | 2244 ms |
| 600 KB/s, warm | Largest contentful paint | 1224 ms | 1044 ms |
| 100 KB/s, cold | Largest contentful paint | 9472 ms | 7204 ms |
| 100 KB/s, warm | Largest contentful paint | 1300 ms | 1176 ms |
| cold | JavaScript transferred | 707 KB | 565 KB |

- A warm visit still takes three serial round trips before data arrives: the
  HTML, the auth refresh, then the page's data requests. Removing the refresh
  from that chain would mean keeping a token across page loads, which this
  change does not do.
- When the refresh fails with a transient error (a 429 or a 5xx), the boot call
  and the root guard each send one, which is one more request than before.
- The preload script copies the language rules from `i18n/config.ts` and
  `convertDetectedLanguage`. If they drift apart, a visitor preloads one locale
  and loads another: wasted bandwidth, not a broken page.
