# Agent Note: Invitation summary page and administrator top-up report

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

## Alternatives considered

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

- `TestAffiliateInviteesDatabaseMatrix` and `TestTopUpReportDatabaseMatrix`
  pass on SQLite 3.50.4, MySQL 5.7.44 and 8.0.46, and PostgreSQL 9.6.24 and
  16.15. The change adds no table or column.
- `go test ./...` passes.
- `bun run test` passes 227 files. `bun run typecheck` passes. oxlint and
  oxfmt report nothing in the changed files.
- A local build on SQLite with seeded invitees and top-ups renders both pages
  in Chinese, and the report excludes the wallet-paid order from its totals.
