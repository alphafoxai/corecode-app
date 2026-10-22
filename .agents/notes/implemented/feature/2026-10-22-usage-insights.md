# Agent Note: Warn before money is lost, and answer "what did this project spend"

Status: implemented

## Problem

Several costs reached customers without warning:

- **Balance.** The balance turned red only at zero. An empty balance fails
  Claude Code with 403 in the middle of a session.
- **Cache misses.** A long request that misses the prompt cache is written again
  at full price. Production had one at 286K tokens, 0% cached, charged $2.15,
  and the console showed it as a grey "Cache 0%".

Customers also had questions the console could not answer:

- How the cache rate moves from day to day.
- How much one project spent. A customer usually gives each project its own
  key, but the usage log showed only the range's total.
- What to do after creating a key. The drawer closed, the customer had to find
  the new key's setup guide, and `POST /api/token/` returned no id the console
  could use to open it.

## Decision

- **Low balance.** `useBalanceStatus` returns a health (`healthy`, `low`,
  `empty`) and the runway. `low` means under three days at the last week's
  average spend.
  - The sidebar balance turns amber when low and red when empty.
  - When the balance is not healthy, the overview opens with an alert that
    links to the wallet.
- **Costly cache misses.** `isCostlyCacheMiss` in
  `web/src/features/usage-logs/lib/cost-check.ts` flags a request with at least
  50K tokens of context and under 20% read from cache.
  - Recent requests and the usage log's token column flag such requests.
  - The overview counts them among the last 100 requests, gives their charge,
    and names the usual causes: a new session, a model switch mid-session, or a
    pause past the 5-minute cache lifetime.
- **Daily cache rate, no schema change.** Upstream rc.46 already records
  `cache_read_tokens` and `cache_creation_tokens` in `quota_data`, which
  `/api/data/self` returns.
  - The 14-day panel switches between spend and reads ÷ (reads + writes) per
    day. Claude Code sends almost no uncached input, so this tracks the request
    hit rate.
  - Days without cache data, including days before rc.46, show no bar instead
    of 0%.
- **Spend per key and per model.** A popover on the usage log lists both for
  the range being viewed, from `/api/data/flow/self` (the hourly rollup, which
  already carries key names). Choosing an entry sets the `token` or `model`
  filter. Admins viewing all users do not see it, because that endpoint covers
  only their own keys.
- **Setup guide after creating a key.** `AddToken` returns `{id, name}` and
  never the key. Reading the key still goes through `POST /api/token/:id/key`
  and its checks. When the drawer creates one key, it loads that key and opens
  its Connect Claude Code guide. A batch creation closes the drawer, as before.

## Alternatives considered

- **Add an input-token column to `quota_data` for an exact daily rate.** It
  needs a migration verified on SQLite, MySQL and PostgreSQL. The gain over
  reads ÷ (reads + writes) is below 0.1% for Claude Code traffic.
- **Aggregate cache use per day from the `logs` table.** It would parse the
  `other` JSON of every request in the range on each page view.
- **Return the key from `AddToken`.** That would put a secret in a response that
  is otherwise metadata, and bypass the read checks of the key endpoint.

## Consequences

- The thresholds (3 days of runway, 50K tokens, 20% cache read) are display
  rules. Billing does not change.
- Spend per key follows hour boundaries, because `quota_data` is hourly.
- A caller of `POST /api/token/` now receives `data`. The previous response had
  none, so existing callers are unaffected; `corecode-provider` does not call
  it.

## Verification

- **Backend.** `go test ./controller/` passes 1418 tests, including a new case
  checking that `AddToken` returns the id and name and not the key.
  `go vet ./controller/` is clean.
- **Frontend.** Typecheck and lint pass on the changed files. Vitest over
  dashboard, usage-logs, keys and components ran 721 tests: 720 passed, and the
  one failure, `detail-preview`, also fails on a clean checkout of `origin/main`.
- **Browser.** Against a local backend built from this branch, with seeded
  usage:
  - the low-balance and cache-miss alerts appear on the overview;
  - the amber sidebar label shows;
  - the daily cache chart colors bars by grade;
  - the spend popover filters the log by model;
  - creating one key opens its setup guide.
