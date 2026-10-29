# Agent Note: Shorten the console's first load further

Status: implemented

## Problem

After the first round (`2026-10-29-console-first-load.md`), the core pages took these
times to become usable on a cold load, at the production round trip (170 ms) and about
600 KB/s:

- sign-in: 1.23 s;
- overview: 1.65 s;
- keys: 1.72 s.

Four costs were left.

1. **The sign-in page waited for the core locale, 91 KB brotli for zhCN.** Its code names
   215 keys. Half of the core part was keys that no console source names. The split keeps
   those because the server may send them, but 866 of them appear nowhere in CoreCode:
   they are labels of upstream features CoreCode removed.
2. **The settings routes' section registries were in the entry.** Every settings
   `$section` route checked its section in `beforeLoad`, and route options other than
   components ride in the entry. That put nine registries (6 KB brotli) in every first
   load.
3. **The data waited for the page's code.**
   - The overview asks for its six requests, and the keys page for its one, once its
     route has loaded and rendered, about 1.35 s into a cold load. The auth refresh had
     returned at 0.38 s.
   - On the overview, the balance card's subscription request and the uptime panel's
     request went out at mount, 1.45 s, and the page was usable only when they returned.
4. **Nothing stopped a regression.** The first round's largest single cost was one import
   in a route's options, and it passed review and the build.

## Decision

- **A size check in CI.** `scripts/check-first-load.mjs` sums the brotli size of what a
  cold visit downloads before the sign-in, overview and keys pages render:
  - the entry files;
  - the chunks the inline route preload names;
  - the parts of the zhCN locale the page renders from.

  The `web` job fails when a page exceeds `first-load-budget.json`. Recreating the
  affiliates import fails it: sign-in at 569 KB against a 450 KB budget at the time.
- **Section checks in a split loader.** The settings routes check their section in
  `loader`, grouped with the component (`codeSplitGroupings`), and redirect as before.
- **A boot part of the locale.** `src/i18n/core-routes.ts` lists `BOOT_ROUTE_IDS`
  (sign-in and the error pages) and `CORE_ROUTE_IDS` (overview, keys).
  `scripts/i18n-locale-split-loader.mjs` gives each key one part:
  - boot: named by code the boot routes reach;
  - core: named by code the core routes reach, or named by no console source;
  - rest: everything else.

  A page waits for the parts `localePartsFor` lists, the inline script preloads those
  parts (`window.__localeTier`), and the others load once the browser is idle.
- **Remove the 866 keys nothing names.** No file in corecode-app, corecode-engine or
  corecode-infra contains them in any escaping. No console code builds a key at run time:
  there is no template-literal or concatenated `t()` argument.
- **Fetch the first page data from `index.html`.** Once the boot refresh returns, the
  inline script fetches the overview's six URLs or the keys table's one with its access
  token.
  - `api.get` takes each response once, by URL, within the page's first ten seconds.
  - A failed or non-200 response falls back to the caller's own request.
  - The daily-spend window ends at the end of today rather than now, so its URL is fixed
    for the day. The response is the same: the server checks the range against now,
    and its rows are dated by the hour they were written, never after now.

## Alternatives considered

- **A locale part per page.** The boot part covers the page most cold visits land on.
  Splitting the overview from the keys page would save about 10 KB on one of them, for
  another list to keep.
- **Replacing axios with fetch, or zod with zod/mini.** Each would save 12–16 KB brotli of
  the shared chunk, for a change to every request or every schema.
- **Starting the data requests from `main.tsx`.** That is earlier than the route loaders,
  but still only after the entry has downloaded, at about 0.9 s.
- **Loading the overview's charts after the rest of the page.** It would save tens of KB,
  but the charts would appear later. That is visible, so it is the maintainer's call.
- **HTTP/3 at the edge.** It is off on purpose: mainland networks throttle QUIC
  (`corecode-infra` `edge/Caddyfile`).

## Consequences

- **`index.html` repeats the data URLs.** The URLs of `prefetchCustomerOverview`, the
  balance card, the uptime panel and `prefetchApiKeys` are written out there too.
  `src/lib/boot-requests.test.ts` runs the inline script against the pages' own requests
  and fails if a URL drifts. Without that test, a drifted URL would only cost the early
  fetch: the page would request it again.
- **A new page goes into the right list.** A page added to `BOOT_ROUTE_IDS` or
  `CORE_ROUTE_IDS` makes that part larger; a page in neither waits for all three parts.
- **A dynamic key needs a literal.** A key built at run time and named nowhere as a
  literal would now be missing from every locale and render as its English key. Such a
  key belongs in `src/i18n/static-keys.ts`.
- **The budget is raised on purpose.** A change that adds to a core page's first load
  fails CI until the budget is raised in the same change.

## Verification

Paired lab measurement on 2026-10-29, by the first round's method:

- main (`b6af5f9a4`) and this branch, each built for production;
- each served by new-api behind a local TLS, HTTP/2 proxy;
- Chromium throttled to a 170 ms round trip and 600 KB/s;
- runs alternating A, B, A, B.

| Page, cache | Runs | main p75 | Branch p75 | Change |
|---|---|---|---|---|
| Sign-in, cold | 12 | 1239 ms | 1081 ms | −12.7% |
| Sign-in, warm | 8 | 386 ms | 388 ms | +0.7%, within run-to-run spread |
| Overview, cold | 12 | 1638 ms | 1461 ms | −10.8% |
| Overview, warm | 8 | 594 ms | 580 ms | −2.4% |
| Keys, cold | 12 | 1714 ms | 1596 ms | −6.9% |
| Keys, warm | 8 | 575 ms | 570 ms | −1.0% |
| Usage logs, cold (not a core page) | 8 | 2216 ms | 2190 ms | −1.2% |
| Overview, cold, 4× CPU slowdown | 6 | 2157 ms | 2003 ms | −7.1% |

First load, brotli:

| Page | main | Branch |
|---|---|---|
| Sign-in | 435.8 KB | 343.0 KB |
| Overview | 530.8 KB | 514.2 KB |
| Keys | 610.9 KB | 594.3 KB |

Each step was kept only if it passed these checks:

- 14 smoke checks.
- Screenshots of five pages at two widths, each within 0.2% of main's pixels.
- The pages' `main` text, word for word.
- Sign-in renders the same with the core and rest parts blocked.
- The overview and keys pages render the same with the rest part blocked.
- A rejected password still shows its Chinese message.
- On main and on this branch, the settings routes redirect the same seven URLs to the
  same pages.
- Each API endpoint is requested as many times as on main, except one: the overview's
  setup panel no longer asks for the model list of no group first, because the keys are
  loaded when it mounts.

`bun run test` has one failure, `quota-display`, and main fails it too. In one full run
three other files failed under load; they passed alone and in the next full run.
