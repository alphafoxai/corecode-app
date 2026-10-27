# Agent Note: Show each user's paid total in the admin user list

Status: implemented

## Problem

The operator wants to see how much each user has paid in total in the
admin user list. The list showed balance and usage, which are quota in the
display currency and include grants, bonuses and redemption codes, so they
do not say what a customer actually paid.

## Decision

- **The column shows what `AffiliatePaidMoney` already sums,** the same
  paid total that sets concurrency tiers and appears in the wallet:
  completed orders through payment gateways, in the payment currency.
  Orders paid from the wallet do not count. The predicate now lives in one
  scope, `paidTopUps`, shared by the single-user sum and the list.
- **`GET /api/user/` and `GET /api/user/search` add `paid_total` to each
  item,** read for the whole page in one grouped query
  (`model.UsersPaidMoney`). The field is added beside the user's fields, so
  a console already in production keeps working.
- **The console renders it with `formatPaymentMoney`** as "累计充值", the
  wording the wallet already uses, and shows "—" for a user who has paid
  nothing or a server that does not send the field yet.
- **The column sorts on the server,** as `sort_by=paid_total`, by the same
  sum as a correlated subquery in the user list's `ORDER BY`, so sorting
  spans every page and not just the one loaded. Ties, including everyone
  who has paid nothing, fall back to newest first. The subquery and the id
  tiebreak are one ORDER BY expression: GORM drops an expression when a
  column order is merged after it.

## Alternatives considered

- **Store a running total on `users`.** Six payment paths complete orders,
  and each would need to update it; a sum over `top_ups` needs no hook and
  cannot drift from the orders.
- **Count credited quota.** Grants and bonuses would look like payments, and
  quota is in USD while customers pay in CNY.
- **Use `CachedUserPaidMoney`.** It is one query per user and up to five
  minutes stale; the admin list wants the current figure for a page at once.

## Consequences

- Each list request runs one more query, over `top_ups` filtered by the
  page's user ids, which `top_ups.user_id`'s index serves.
- Sorting by paid total sums top-ups for every matching user before the
  page is cut. That is fine at the current user count; with many more users
  a stored total would be the next step.
- The amount is in the payment currency (`¥`), unlike the balance column
  beside it.

## Verification

- `TestUsersPaidMoneyDatabaseMatrix`: completed gateway orders count, a NULL
  provider counts, pending, failed and wallet-paid orders do not, and users
  without orders are absent. Passes on SQLite 3.50.4, MySQL 5.7.44 and
  8.4.11, PostgreSQL 9.6.24 and 17.11.
- `TestUsersSortByPaidTotalDatabaseMatrix`: `GetAllUsers` descending and
  `SearchUsers` ascending by paid total, with unpaid users tied at zero,
  on the same five databases.
- `go test -p 1 ./model/ ./controller/ ./middleware/ ./router/` passes
  against SQLite, MySQL 8.4.11 and PostgreSQL 17.11.
- Frontend: `bun check -b`, `oxlint` and `oxfmt` on the changed files, and
  `vitest run src/features/users` (34 tests), including the new column's
  amount, its dash for zero or a missing field, and that sorting it sends
  `sort_by=paid_total`.
