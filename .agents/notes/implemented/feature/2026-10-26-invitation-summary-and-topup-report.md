# Agent Note: Default invite commission, invitation summary page, and top-up report

Status: implemented

## Problem

- A customer's invitation link and commission totals lived in the wallet's
  invitation card. Nothing showed who the customer had invited or what each
  invitee had spent.
- Administrators could see top-ups only in the wallet's billing dialog, which
  searches by order number and has no totals, date range or trend.

## Decision

- **`GET /api/affiliate/self/invitees`** pages the caller's direct invitees
  (`users.inviter_id`), newest first. Each row has the masked username, the
  sign-up time, `used_quota`, and the first-level commission that invitee
  earned the caller. The response also carries `totals` over all invitees.
  Names use `maskAffiliateName`, the same masking as the commission records.
  The endpoint answers when the program is off, because earlier invitees stay
  the caller's.
- **The invitee commission column counts level 1 only.** A channel's
  second-level commission comes from an invitee's own invitees. Adding it to
  the invitee who brought them in would make the column larger than that
  invitee's own consumption explains.
- **`GET /api/user/topup/records` and `GET /api/user/topup/stats`** serve the
  report, behind `AdminAuth` like `GET /api/user/topup`. Both filter by
  `create_time` range, user (an id or an exact username), order-number
  substring and payment method. Records also filter by status. Stats sum
  only successful orders. Orders with `payment_provider = balance` are
  excluded from stats, because the wallet top-up already counted that money,
  the same rule as `AffiliatePaidMoney`. Stats bucket by day at the browser's
  UTC offset (`tz_offset`, minutes east) and reject a range over 366 days,
  because they read every matching row.
- **The existing `GET /api/user/topup` is unchanged,** so the wallet dialog
  keeps its exact-match search.
- **Both pages are sidebar modules:** `personal.invitation` (`/invitations`)
  and `admin.topup_records` (`/topups`). The front-end defaults enable them,
  and `mergeWithDefaultSidebarModules` turns them on in configurations saved
  before them. Personal access tokens need `wallet:read` for invitees and
  `billing:read` for the report.

## Default commission for every customer

The operators changed the rule recorded in `2026-10-25-affiliate-commission.md`:
every customer earns the 10% commission by default, with no ¥100 threshold and
no application.

- **`self_serve_rate` is now the default rate.** While the program is on,
  `ensureDefaultAffiliateWithTx` creates the user's `affiliates` row at that
  rate if none exists. It runs when the user opens the wallet or the
  invitation page, when someone signs up with the user's code, and when one
  of the user's invitees is settled. The last case covers users invited
  before the default existed.
- **An existing row is never changed,** so an administrator's rate,
  including 0, stays. Rate 0 still revokes invite rights, and the default
  does not come back. Setting `self_serve_rate` to 0 gives no one a default.
- **The rate is fixed when the row is created,** as an applied rate was.
  Changing `self_serve_rate` later does not move existing rows.
- **The apply flow is removed:** `POST /api/affiliate/self/apply`,
  `ApplyAffiliate`, `self_serve_min_topup` and the wallet's threshold card.
  A stored `affiliate_setting.self_serve_min_topup` option is ignored,
  because the config loader reads only the struct's fields.
- Opening a user's invitation details in the admin dialog builds the same
  summary, so it also creates that user's default row.

## Alternatives considered

- **Treat a missing row as the default rate instead of creating one.**
  Crediting needs a row to hold the balance, and the binding check, the
  admin dialog and the summary would each need the same fallback.
- **Extend `GET /api/user/topup` with the new filters.** The wallet dialog
  depends on its `keyword` semantics, which are an exact match unless the
  caller types `%`, and it would still have no totals.
- **Aggregate days in SQL.** Integer division and time-zone arithmetic differ
  across SQLite, MySQL and PostgreSQL. A bounded range read and bucketed in Go
  is the same everywhere.

## Consequences

- Records are ordered by id, which follows creation time for real orders.
- The report sums `money` as one currency, as the console already displays it
  in ¥.

## Verification

- `TestAffiliateCommissionDatabaseMatrix` covers the default: a new user's
  code binds and creates a 10% row; a disabled user's code does not bind;
  ensuring twice keeps one row; rate 0 survives ensuring; and an invite made
  while the program was off earns 10% at the first settlement after it is
  turned on. It passes on the same five databases.
- `TestAffiliateInviteesDatabaseMatrix` and `TestTopUpReportDatabaseMatrix`
  pass on SQLite 3.50.4, MySQL 5.7.44 and 8.0.46, and PostgreSQL 9.6.24 and
  16.15. The change adds no table or column.
- `go test ./...` passes.
- `bun run test` passes 227 files and 2563 tests. `bun run typecheck`
  passes. oxlint and oxfmt report nothing in the changed files.
- A local build on SQLite with seeded invitees and top-ups renders both pages
  in Chinese, and the report excludes the wallet-paid order from its totals.
