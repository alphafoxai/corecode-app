# Agent Note: Require the trust threshold for every request a user may hold at once

Status: implemented

## Problem

Production has customers with negative balances, and the relay watch alerts on
them. The wallet trust bypass (`BillingSession.shouldTrust`) skips the
reservation when both the wallet and a limited token hold more than
`quota_setting.trust_quota_usd` ($10 by default). A trusted request reserves
nothing and settles its whole cost afterwards, without checking the balance.

Every concurrent request reads the same balance, so each of them passes the
same check. With the default limit of 5, a wallet holding $10.01 admits five
unreserved long-context requests, and settling them leaves the balance near
-$30. The paid tiers allow 10 or 20 at once, which widens the debt.

## Decision

- **`UserConcurrencyLimit` stores the user's effective limit in the request
  context** (`ContextKeyUserConcurrencyLimit`) once a slot is granted.
- **`shouldTrust` multiplies the threshold by that limit** when it is above
  one. With $10 and a limit of 5, the bypass now needs more than $50 in both
  the wallet and a limited token. Below that, the request reserves its
  estimated input cost atomically, as an untrusted request always did.
- No limit (0, an unlimited user or group, or routes the limiter does not
  cover) keeps the threshold as configured.

## Alternatives considered

- **Set `trust_quota_usd` to 0.** It needs no code, but every request then
  writes a reservation, including those of customers with large balances who
  cannot reach debt.
- **Count the user's requests in flight instead of the limit.** Tighter, but
  the count changes between the check and the settle; the limit is the bound
  that holds for the whole request.
- **Disable tokens when a settle leaves the balance negative.** It acts after
  the debt exists. The wallet check already refuses new requests while the
  balance is at or below zero.

## Consequences

- Customers holding between the threshold and the threshold times their limit
  now reserve on each request: one more quota write per request, which the
  batch updater absorbs.
- An untrusted request reserves only its estimated input cost
  (`pre_consume_multiplier` times prompt tokens), so output cost can still take
  a balance slightly below zero. That debt is at most one response's output per
  concurrent request, not the whole cost of each request.
- The console help text for the threshold still describes the unscaled value;
  `pkg/billingexpr/expr.md` records the scaling.

## Verification

- `go test ./controller -run TestPreConsumePolicyDatabaseMatrix`: three new
  rows. A $11 wallet with a limit of 5 reserves, a balance above $50 with a
  limit of 5 is trusted, and a limit of 1 keeps the plain threshold. The first
  row fails without the change to `shouldTrust`.
- `go test ./middleware -run UserConcurrency`:
  `TestUserConcurrencyLimitInContext` checks that the limit reaches the
  context, and that an unlimited group leaves it at 0.
- `go test ./service/...` passes, and `go vet` is clean on the changed
  packages.
