# Agent Note: Shorten the console's first load

Status: implemented

## Problem

After the boot-request overlap (`2026-10-28-overlap-console-boot-requests.md`), a cold
visit from the mainland still took about 1.85 s to a usable sign-in form and 2 s to a
loaded dashboard or key list, at the production round trip (170 ms) and about 600 KB/s.
A browser waterfall at those conditions showed three costs:

1. **The files a first visit needs before it can render came to 626 KB brotli**: the entry,
   a shared chunk, React, two vendor chunks, the stylesheet and the whole zhCN locale
   (146 KB). At the measured bandwidth that alone is over a second.
   - The affiliates route read `AFFILIATE_TABS` for its search schema from the page's
     own module. Route options are not code-split, so the whole affiliates page, and most
     of the shared UI with it, rode in the entry.
   - `vendor-ui-primitives` and `vendor-tanstack` were split groups with
     `chunks: 'all'` and `enforce`, which pull every Base UI and TanStack module used
     anywhere into one chunk the entry needs.
2. **Requests that waited on the entry.** The status, the setup check and the auth refresh
   started only once the entry had run, and the sign-in page sent its refresh only after
   the setup check returned: two round trips after the bundle. The route's chunks were
   also requested only after the entry ran.
3. **Data requested by mounted components.** Once every file had arrived, the overview
   spent about 130 ms running and rendering before its panels asked for their data.

## Decision

- **Keep route options off page modules.** `AFFILIATE_TABS` lives in
  `features/affiliates/constants.ts`.
- **No forced vendor groups.** `splitChunks` keeps Rsbuild's default preset, so a chunk
  holds the modules the pages that load it share.
- **Send the boot requests from `index.html`.** An inline script sends `/api/status`,
  `/api/setup` and, when the app would send one anyway (a session hint cookie, or the
  sign-in page), the auth refresh, as the page starts parsing. `lib/boot-requests.ts`
  hands each response, once, to the code that used to make the request
  (`fetchStatus`, `prefetchSetupStatus`, `requestRefresh`), which falls back to its own
  request when the boot one did not reach the server. The refresh's answer goes through
  the same refresh runner, so rotation races, rejections and rate limits are handled as
  before, and the access token stays in memory. The number of refresh requests per page
  load is unchanged.
- **Preload the current route's chunks.** `pluginPreloadRoute` in `rsbuild.config.ts`
  builds a table from the route files' chunk groups; an inline script matches the URL and
  preloads the route's chunks, with its layouts', beside the entry. A protected route
  without the session hint preloads the sign-in page instead.
- **Split each locale into a core and a rest part.**
  `scripts/i18n-locale-split-loader.mjs` puts in `?core` every key that a module reachable
  from the routes in `src/i18n/core-routes.ts` names as a literal (following static and
  dynamic imports), and every key no console source names, since the server sends English
  messages for the console to translate. `?rest` has the keys only other pages name. The
  first language loads its core part (91 KB for zhCN instead of 146 KB) and the rest once
  the browser is idle after the first render. Any other page waits for the rest before it
  renders: at boot (`main.tsx`), in the root guard, and through `index.html`, which
  preloads the rest beside the core part when the URL is not a core page. A language
  chosen later loads whole. English keeps its overrides chunk.
- **Start the core pages' data from their route loaders.** The dashboard route's loader
  starts the overview's daily spend, recent requests, keys and performance summary
  queries (`prefetchCustomerOverview`); the keys route's loader starts the table's first
  page (`prefetchApiKeys`). The panels and the table use the same query options and pick
  those requests up. Both loaders share the component's lazy chunk
  (`codeSplitGroupings`), so they add nothing to the entry. The key list stays fresh for
  ten seconds so the table does not ask again for a page the loader has just read. A
  change refetches through `refreshTrigger` and marks every cached page stale, since
  `refreshTrigger` starts again from 0 when the keys page mounts again.
- **Load the key drawer's date picker lazily**, fetched once the keys page is idle, as the
  dashboard's model filter already does.

## Alternatives considered

- **Preloading route chunks without moving the boot requests.** Measured alone it made
  the sign-in page 200 ms slower: the preloads took bandwidth from the entry while the
  page still waited on the setup check and the refresh in series. It pays off only
  together with the boot requests.
- **Loading the rest of the locale later than the browser's first idle moment**, to keep
  it from competing with the overview's data requests. Loading it three seconds after
  render changed the overview by 15 ms and the key list by nothing.
- **`LazyMotion` for motion.** About 15 KB brotli on the dashboard pages, for edits to
  eight animated components.
- **Prefetching the overview's subscription and uptime requests.** About 60 ms more, but
  the uptime panel fetches imperatively and would need rewriting.
- **Caching `/static/` at the Tokyo edge.** It saves about 100 ms on a cold visit; it
  changes the edge's Caddy build and belongs to `corecode-infra`.

## Consequences

- `index.html` is 4.5 KB gzipped instead of 1.7 KB, still inside the first round trip.
- A page added to `core-routes.ts` makes the core locale larger; a page outside it waits
  for the rest on a first visit. A key that only a non-core module names but a core page
  receives at run time would show its English text until the rest has loaded, about a
  second after the first render.
- The conditions under which `index.html` sends the refresh copy
  `bootstrapAuthentication` and the sign-in route. If they drift apart, a page load
  either sends a refresh the app does not use (it is still the only one) or does not
  start it early.
- A route option that imports from a page module puts that page in the entry again; the
  workspace lesson `keep-route-options-off-page-modules` records the check.

## Verification

Paired lab measurement on 2026-10-29. The base (`a12458919`) and this branch were built
the way production builds them and served by two local new-api servers, each behind a TLS,
HTTP/2 proxy, with the same SQLite data. Playwright alternated between them, A, B, A, B,
with Chromium throttled to a 170 ms round trip and 600 KB/s for every request. An A/A run
of one build on both servers differed by 0.2%. "Usable" means the page's main control
responds: the sign-in form's fields and button are enabled, and the overview's panels and
the key table show their data.

| Page, cache | Runs | Base p75 | Branch p75 | Change |
|---|---|---|---|---|
| Sign-in, cold | 12 | 1854 ms | 1216 ms | −34.4% |
| Sign-in, warm | 8 | 584 ms | 381 ms | −34.7% |
| Overview, cold | 12 | 1959 ms | 1604 ms | −18.1% |
| Overview, warm | 8 | 646 ms | 593 ms | −8.1% |
| Keys, cold | 12 | 2025 ms | 1712 ms | −15.4% |
| Keys, warm | 8 | 644 ms | 583 ms | −9.5% |
| Usage logs, cold (not a core page) | 8 | 2317 ms | 2174 ms | −6.2% |
| Overview, cold, 4× CPU slowdown | 6 | 2295 ms | 1931 ms | −15.9% |

The files a first visit needs before it renders went from 626 KB to 325 KB brotli.

Each step was kept only if it passed these checks:

- 14 smoke checks: sign-in, sign-out, the overview's panels, creating, editing and
  deleting a key, and the date picker rendering in the key drawer.
- Screenshots of five pages at 1280 and 390 px, each within 0.2% of the base's pixels.
- The pages' `main` text, word for word.
- No page errors.
- With the rest chunk blocked, the core pages render the same text as with it.

`bun run test` has one failure, in `quota-display`, and the base fails it too.
