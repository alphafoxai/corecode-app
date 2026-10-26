# Agent Note: Root-only site insights dashboard

Status: implemented

## Problem

The console's dashboards show usage: calls, tokens, spend by model and by
user, and top-ups. An operator could not see from the console whether the
site had capacity, what it owed, who was abusing it, or whether sign-ups
turned into customers:

- The performance panel counts only upstream health, so on 2026-10-26 it
  showed 100% success while 50 requests failed with the engine's
  `Credential concurrency limit exceeded`. Requests the per-user limit turns
  away never reach the logs at all.
- The subscription pool's capacity and quota lived only in corecode-engine's
  console.
- Wallet balances owed to customers, negative balances, manual balance
  changes, accounts sharing an address, and the sign-up funnel were each a
  database query away.

## Decision

- **One page, `/site-insights`, for the root user only.** The route checks
  `ROLE.SUPER_ADMIN`, the sidebar item has `requiredRole: SUPER_ADMIN`, and
  every endpoint sits behind `RootAuth`. Administrators below root keep the
  existing dashboards; the new views expose revenue, balances and other
  users' addresses.
- **Seven read-only views under `GET /api/site-insights/*`,** one per tab:
  - `capacity`: concurrency reconstructed from the request logs (a log is
    written when a request ends, so it was in flight from
    `created_at - use_time`), peak requests per minute, failures by cause,
    per-user peaks, live in-flight counts, the per-user limit's rejections,
    and the engine pool.
  - `finance`: revenue split into top-ups and plans (a top-up row whose
    `trade_no` has a subscription order is a plan), consumption at list
    price, revenue per dollar consumed, balances owed and negative balances
    (root excluded), wallet credit by source, and manual adjustments from
    the audit log.
  - `risk`: sign-ups over time, sign-up method, email domains against the
    allowlist, alias emails, addresses shared by several accounts (request
    logs and the users' own security audit entries) with plan buyers per
    address, and negative balances.
  - `growth`: the range's sign-ups followed to now through activated, paid
    and paid again, by sign-up method and by referral, and plan buyers who
    went on to top up.
  - `activity`: daily and weekly active users, retention by sign-up day for
    14 days, and the top customers' share of consumption.
  - `quality`: TTFT and duration percentiles by model, cache read share,
    failure rate by day, status codes, failure reasons and stream endings.
  - `business`: referral return by inviter, model economics with revenue
    allocated by consumption share, users by group, and clients.
- **Each view reads a bounded range and aggregates in Go,** as the top-up
  report does. Views that read raw logs accept 31 days and read at most
  200,000 rows, reporting `truncated` past that; the risk view groups logs
  in SQL and accepts 92 days; the rest read hourly `quota_data`, orders and
  users and accept 366 days. Days split at the viewer's `tz_offset`.
- **The per-user concurrency limiter keeps its rejections by hour for two
  days** in the same process memory as its counts, and
  `UserConcurrencySnapshot` exposes both. The capacity view says the figure
  is since the server started.
- **The engine pool is read from corecode-engine's control API** with the
  root-only options `EngineControlURL` and `EngineControlKey`. The key ends
  in `Key`, so the option list masks it. An unset URL or key shows how to
  configure it; a failed read shows the error and the rest of the view
  still renders. An account is eligible when it is available and under both
  quota budgets, matching the engine's admission; effective slots are
  eligible accounts times the per-account concurrency.
- **Consume logs now record the client's product token** (`claude-cli/2.1.3`)
  as `admin_info.client`, capped at 64 bytes, for the client breakdown.
  Older logs count as unknown.
- **Personal access tokens:** capacity and quality need `ops:read`, finance
  and business `billing:read`, risk, growth and activity `user:read`.

## Alternatives considered

- **Add the views to the existing dashboard sections.** Those sections are
  shared with administrators and, for the overview, with customers; gating
  part of a section by role would spread root checks through shared
  components.
- **Store concurrency samples in a new table.** Reconstruction from the logs
  needs no write path and covers history from before this change. Only the
  per-user limit's rejections are not in the logs, and those are kept in
  memory.
- **Proxy the engine console in an iframe.** It is served on the relay's
  private port and has its own login; the capacity view needs only the
  summary.
- **Aggregate days in SQL.** Day and hour arithmetic differs across SQLite,
  MySQL and PostgreSQL; the bounded ranges read fast enough at this scale.

## Consequences

- The engine pool panel stays empty until corecode-infra writes the two
  options; `notes/workspace/` in corecode-infra records that change.
- The control key gives the app the engine's full control API. The app
  calls only three read endpoints with it.
- The per-user limit's rejection count resets when a server restarts, and
  each blue/green color counts its own.
- Revenue per model is an estimate: customers pay for balance, not models.
- The new console strings are translated into Chinese; other locales show
  the English text until translated.

## Verification

- `go test ./model/ -run 'SiteInsights|ResolveInsightsRange|ClassifyErrorLog'`
  passes against SQLite, PostgreSQL 16 and MySQL 8.4 (throwaway containers
  via `TEST_POSTGRES_DSN` and `TEST_MYSQL_DSN`). The matrix seeds users,
  logs, top-ups, a plan order, `quota_data` and an audit entry, and checks
  every view, including overlap reconstruction, the plan/top-up split, root
  excluded from balances, shared addresses, the funnel, retention and TTFT.
- `TestFetchEnginePool` checks the client against a fake control API: an
  unset configuration, a paged group list, eligibility against both
  budgets, and a rejected key.
- `TestUserConcurrencyLimit` checks the snapshot and rejection count.
- `go test ./model/ ./controller/ ./router/ ./service/ ./middleware/ ./setting/...`
  passes, including the route-coverage test for personal access tokens.
- Frontend: `bun run typecheck` and all 2,650 vitest tests pass; `oxlint`
  and `oxfmt --check` report nothing in the changed files.
- End to end, a local build on SQLite with seeded users, logs and orders,
  signed in as root, rendered all seven tabs in Chinese with figures that
  match the seed.
