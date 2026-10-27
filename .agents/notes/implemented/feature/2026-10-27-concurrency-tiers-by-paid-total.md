# Agent Note: Raise the concurrency limit by what a user has paid

Status: implemented

## Problem

Every customer in a group runs the same number of requests at once (the
`default` group allows 5). The operator wants customers who have paid more
to run more, with two tiers to start: 1,000 paid allows 10 at once and
2,000 allows 20. Customers need to see this where they top up, and when
the limit turns them away.

## Decision

- **`token_setting.concurrency_tiers`** holds the tiers as a JSON list of
  `{min_paid, limit}`, defaulting to 1,000 → 10 and 2,000 → 20. `PUT
  /api/option/` rejects a non-positive amount or limit and a repeated
  amount. The root dashboard's concurrency panel edits them.
  Superseded on 2026-10-27: the operator moved 20 at once to 10,000 paid,
  and the default follows, so a fresh database matches production.
- **Paid total is what `AffiliatePaidMoney` already sums:** successful
  orders through payment gateways, top-ups and plans, in the payment
  currency. Orders paid from the wallet are left out because that money was
  counted when the wallet was topped up. Bonuses, grants and redemption
  codes do not count.
- **The limit resolves in one place,**
  `operation_setting.EffectiveUserConcurrencyLimit`: a per-user override
  first, then the higher of the group limit and the highest tier reached.
  A group without a limit stays unlimited, so tiers never cap anyone. The
  source is reported as `user`, `tier` or `group`.
- **The limiter reads the paid total from a per-process cache** refreshed
  after five minutes, and only when no override is set and tiers exist.
  The wallet's top-up info reads it afresh and refreshes the cache, so a
  customer who has just paid and opens the wallet gets the new tier at once.
- **Customers see the tiers in three places:**
  - the wallet shows the current limit, the tier ladder and how much more to
    pay for the next tier;
  - each preset amount that would cross a tier says "并发提升到 N";
  - the 429 from the limit says how much more paid in total raises it,
    unless the limit is a per-user override or the last tier is reached.
- **The top-up info response gains `concurrency`** (limit, source, group
  limit, paid total, tiers). Tiers are omitted for a per-user override or an
  unlimited group, which paying does not change.

## Alternatives considered

- **Count credited quota instead of money paid.** Grants and bonuses would
  buy concurrency for free, and quota is in USD while customers pay in CNY.
- **Store the tier on the user when an order completes.** Six payment paths
  complete orders; a cached sum needs no hook in any of them and cannot
  drift from the orders table.
- **Assign tiers by moving users to new groups.** Groups also select
  channels and prices (`TopupGroupRatio`), and moving users changes billing.

## Consequences

- A payment made elsewhere takes up to five minutes to raise the limit
  unless the customer opens the wallet.
- Changing the tiers applies at the next request for every user.
- The amounts are in the payment currency; a site that charges in another
  currency must set tiers in that currency.

## Verification

- `go test ./middleware/ -run Concurrency`, also with `-race`: the limit's
  resolution (override, below and at each tier, a group above the tier, an
  unlimited group), the next tier, a 429 that names the remaining amount, a
  user whose tier raised the limit, and tier validation.
- `go test -p 1 ./model/ ./controller/ ./router/ ./service/ ./middleware/ ./setting/... ./i18n/ ./common/`
  passes against SQLite, MySQL 8.4 and PostgreSQL 16. Run in parallel
  against one shared MySQL/PostgreSQL database, packages delete each other's
  rows; `main` fails the same way, on other tests.
- Frontend: `bun run typecheck`, `oxlint`, `oxfmt`, and all 2,677 vitest
  tests, including the tier helpers.
- End to end on SQLite with `default` limited to 5 and 300 paid: the wallet
  showed 5 at once and "再充 ¥700，并发上限提升到 10", and the presets that
  cross 1,000 said so. Saving the tiers from the dashboard stored
  `[{"min_paid":1000,"limit":10},{"min_paid":3000,"limit":20}]`.
