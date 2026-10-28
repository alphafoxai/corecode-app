# Agent Note: Reserve what the balance holds, and let the wallet and the subscription cover one request together

Status: implemented

## Problem

On 2026-10-28 a Claude Code customer was refused with "Not enough quota to
pre-consume for this request: $2.268282 remaining, $2.997788 required". The
customer prefers the wallet (`wallet_first`), held $2.27 in it and about
$2.50 on the starter plan.

The reservation prices every prompt token at the full input rate. Claude Code
reads about 180k of those tokens from the prompt cache at 0.05 of that rate.
With Opus 5.5, the 2.05 group ratio and the production
`pre_consume_multiplier` of 2, the estimate was $3.00. The customer's
neighbouring requests cost between $0.09 and $0.59, and a full cache rewrite
costs about $2.50.

Each source was refused on its own:

- `tryWallet` refused any wallet below the estimate.
- `PreConsumeUserSubscription` refused any subscription below it.
- A request could draw on only one source, so $4.77 across both still failed.

Settlement had a related hole. `PostConsumeUserSubscriptionDelta` refused a
positive delta that would pass the plan's total, so a subscription request
whose cost exceeded what the plan had left was charged nothing beyond its
reservation.

## Decision

- **A positive balance below the estimate reserves what it holds.** The rest
  of the estimate (`shortfall`) is not held, and settlement charges the real
  cost. A wallet settlement may already go below zero, so this adds no new
  kind of debt.
- **A second source covers what the first cannot.** It joins only when the
  first source cannot reserve the full estimate, with one exception: a
  subscription request with a wallet overflow source always carries it, so
  that a settlement past the plan's total is charged to the wallet.
  - `subscription_first`: the wallet joins when every active subscription
    allows wallet overflow and the wallet is positive. This is the same
    condition under which the wallet already served the whole request.
  - `wallet_first`: an active subscription joins.
- **Settlement order.** A positive delta goes to the primary source up to its
  balance, then to the overflow source, and the wallet takes whatever is left.
  A negative delta first returns what the overflow source holds. A failed
  request refunds both sources.
- **A failed step falls to the wallet.** It applies when settlement cannot
  read the wallet balance or cannot charge a subscription. That share is
  charged to the wallet and the failure is logged, so a database error never
  leaves part of the cost uncharged. Without this, a failed balance read
  dropped the whole delta, and a failed subscription charge dropped
  everything after it.
- **Full reservation is kept** for async tasks (`ForcePreConsume`), image
  requests, `subscription_only`, and plans that do not allow wallet overflow.
  Task billing adjusts later by `BillingSource` and expects one source; a plan
  without overflow has nothing to absorb the rest.
- **The log records the second source.** It is written to
  `billing_overflow_source` and `billing_overflow_quota`.
  `subscription_post_delta` now records only what the subscription was
  charged.
- **`RefundSubscriptionPreConsume` changes `amount_used` in its own
  transaction.** Before, it opened a second transaction. A failure after that
  one committed left the record unrefunded, and `refundWithRetry` refunded it
  again. On SQLite the two transactions also waited on each other.

## Alternatives considered

- **Make the estimate cache-aware.** It would price the prefix before the last
  `cache_control` breakpoint at the cache-read rate. That fits a cache hit, but
  a miss costs about 30 times more, so it still needs the shortfall rule above.
  The two can be combined later.
- **Split one reservation across both sources by preference only, without a
  shortfall.** The customer above would still fail whenever the combined
  balance was below the estimate, although the real cost is usually far lower.

## Consequences

- Debt is bounded by one request per concurrent slot. Its size is the
  request's cost minus what the sources held. Before, it was one response's
  output. The limit on concurrent requests still bounds the count.
- `subscription_first` users now read `allow_wallet_overflow` on every
  request, not only after the subscription fails: one more indexed count
  query.
- The token reservation follows what the sources held, not the estimate, so
  the token and the funding settle from the same base.

## Verification

- `go test ./controller -run 'TestPreConsumeShortfallAcrossWalletAndSubscription|TestPreConsumePolicyDatabaseMatrix'`
  on SQLite 3.50.4, MySQL 5.7.44 (`mysql:5.7` container) and PostgreSQL 16.15
  (`postgres:16-alpine` container), through `TEST_MYSQL_DSN` and
  `TEST_POSTGRES_DSN`. The new matrix covers:
  - a wallet below the estimate
  - an async task that keeps full reservation
  - `wallet_first` drawing on the subscription
  - `subscription_first` drawing on the wallet
  - a settlement past the plan's total
  - a plan without wallet overflow
  - a refund across both sources
- `go test ./service/... ./model/... ./relay/... ./controller/... ./middleware/...`
  passes, and `go vet` is clean on the changed packages.
