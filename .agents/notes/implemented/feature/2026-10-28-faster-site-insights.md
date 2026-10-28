# Agent Note: Faster site insights views

Status: implemented

## Problem

The root-only `/site-insights` page reads one `/api/site-insights/<view>`
endpoint per tab. Production logs on 2026-10-28 put the 7-day views at
10–30 ms for finance, growth and activity, 60–110 ms for risk, about 215 ms for
business, 330–360 ms for quality, 430–530 ms for capacity, and 250 ms to 3.9 s
for the pool. The payloads were 1–7 KB with brotli, so the time went to the
server, not the transfer:

- **Open hours were recomputed on every read.** Capacity, quality and business
  read the logs through hourly rollups, and the hours still open (about the
  last three) were aggregated from the logs on each request. The capacity tab
  refreshes every 30 s, so it rescanned those logs twice a minute, and opening
  quality or business rescanned them again.
- **The pool read was serial and not shared.** `FetchEnginePool` asked the
  engine for `/group-concurrency` and then for `/group-concurrency/pool-estimate`.
  The capacity view made the same two calls after its database work, and the
  pool view made them again.
- **Funds loaded every customer.** `fillBalances` read every non-root user to
  sum balances and pick the top ten, so its cost grew with the user count.
- **The page itself.** Switching the range blanked the tab until the new
  figures arrived, a tab's request started only on click, and long tables
  (debtors, pool accounts, quota adjustments) rendered every row.

## Decision

- **Open hours are reused for a minute** (`recentOpenInsightHour` in
  `model/site_insights_hours.go`). A computed open hour is kept in process
  memory for `insightOpenHourTTL`, and concurrent readers of one hour share a
  single computation through `singleflight`. Final hours are unchanged: stored
  once, read from the tables. Cached hours are read-only; every view builds its
  own accumulators.
- **The pool read is concurrent and shared** (`service/engine_pool.go`).
  `readEnginePool` requests both engine endpoints at once. `FetchEnginePool`
  keeps a complete read for `enginePoolTTL` (5 s), keyed by the control URL and
  key, and concurrent callers share one read. A read with an error is not
  kept. The read no longer takes the caller's context: it is shared, so one
  caller leaving must not cancel the others, and it still stops after 8 s.
- **Capacity does not wait on the engine.** It shows only the pool's totals
  (eligible accounts, slots, the per-account limit, budgets), which change
  slowly, so it calls `RecentEnginePool(2 * time.Minute)`: the last complete
  read is returned at once, and a read older than 5 s starts a new one in the
  background. Only the first capacity request after a start, or after two
  minutes without one, waits for the engine, and that read runs while the
  database works. After the first release of this change the 30 s refresh
  took 240–280 ms, and 59 ms when the pool read was shared. Timed on the
  relay host, the engine's `/group-concurrency` took 27–65 ms and
  `/group-concurrency/pool-estimate` 230–260 ms; corecode-engine reads the
  estimate's accounts in parallel since its
  `2026-10-28-read-pool-estimate-accounts-in-parallel` note.
- **Funds sums balances in SQL.** One aggregate query returns the liability,
  the number of customers in credit and the debt; the top balances use
  `ORDER BY quota DESC, id LIMIT 10` and the debtors `ORDER BY quota, id`.
- **The page pages and prefetches.** `SimpleTable` shows ten rows a page with
  previous and next buttons, and clamps the page when a refresh shortens the
  list. Hovering or focusing a tab prefetches its view for the current range,
  and insights queries stay fresh for 30 s, so the prefetched data is used on
  click. A new range or a Refresh keeps the tab's previous figures on screen
  until the new ones arrive; another tab starts empty, because its component
  cannot read a different view's data.

## Alternatives considered

- **Server-side pagination of the lists.** The lists are already short: most
  are capped at 10 or 20 rows on the server, and the longest (debtors, pool
  accounts) were a few KB. Paging over the network would add a round trip per
  page and save no measurable time, so the tables page in the browser.
- **Prefetch every tab on load.** It would run the capacity, quality and
  business scans together on every page open. Prefetching on hover costs a
  request only for a tab the viewer is about to open.
- **A longer open-hour TTL.** Open hours carry the last few hours' requests and
  errors. A minute matches the capacity refresh and keeps them close to live;
  the in-flight figures do not come from the hours.

## Consequences

- The hourly figures for the open hours, and the requests, errors and peaks
  they feed, can be up to a minute old. In-flight requests and users are read
  live on each capacity request, as before.
- Each server process keeps its own cache; during a blue/green release, the
  two colors compute their open hours independently.
- The pool tab's figures can be up to 5 s old. Capacity's pool totals are
  normally one refresh (30 s) old, and at most two minutes.

## Verification

- `TestOpenInsightHoursAreReusedWithinTTL` adds a log inside an open hour:
  a second read within the TTL returns the old count, and an expired entry
  returns the new one. `TestFetchEnginePool` checks that a second read within
  the TTL sends no request to the engine.
- `TestSiteInsightsDatabaseMatrix`, which covers the funds balances, passed on
  SQLite, MySQL 8.4 and PostgreSQL 17 (throwaway containers).
- `simple-table.test.tsx` covers paging and the clamp after a shorter refresh.
- In a local browser, hovering the Funds tab requested `/api/site-insights/finance`
  and the click used it without a second request; 25 seeded debtors showed as
  three pages of ten.
