# Agent Note: Limit how many requests one token has in flight

Status: implemented

The limit now counts per user, not per token; see
[2026-10-27-user-concurrency-limit.md](2026-10-27-user-concurrency-limit.md).

## Problem

One customer token could run any number of requests at once. Nothing in the
console limited it:

- `ModelRequestRateLimit` counts requests per time window, not requests in
  progress.
- corecode-engine enforces concurrency per access key, but every customer
  request reaches it through the one access key of the new-api channel. A limit
  there throttles the whole site, not one customer.

A key shared among several people, or a script fanning out requests, could
therefore occupy a large part of the subscription pool.

## Decision

- **`token_setting.concurrency_limits`** maps a user group to the number of
  requests one token of that group may have in flight. A group that is
  absent or set to 0 is not limited. Operators set it under System settings →
  Security → Token Limits; the server rejects a value that is not an object
  of group names to non-negative whole numbers.
- **The limit follows the token owner's user group,** not the token's group:
  a customer key usually has the group `auto`, while the user group says who
  the customer is.
- **`TokenConcurrencyLimit` runs on `/v1` and `/v1beta`,** after token
  authentication and before the request rate limit, so a rejected request
  does not use up the rate-limit budget.
- **A request over the limit gets 429 with `Retry-After: 1`.** Claude Code
  retries a 429 with backoff, so a burst of subagents waits instead of failing.
- **A streamed response holds its slot until the stream ends.**
- **The counter lives in process memory.** One new-api instance serves the
  relay, and a crash cannot leave a stale count behind.

## Alternatives considered

- **Count in Redis.** It would hold across instances, but a request that dies
  with its process leaves the count raised until a TTL expires. That TTL must
  outlast the longest stream, so a crash would block a customer for that long.
- **Limit in corecode-engine.** Its per-access-key limit cannot tell customers
  apart while new-api reaches it through one channel key.
- **Queue the request instead of rejecting it.** It would hold connections
  open on the server. Claude Code already retries a 429.

## Consequences

- With several new-api instances, each enforces the limit on its own traffic,
  so a token may reach the limit times the instance count.
- The Responses WebSocket route (`GET /v1/responses`) is registered before
  the limiter and is not counted.
- Raising or lowering a limit applies to the next request; requests in flight
  keep their slots.

## Verification

- `go test ./middleware/ ./setting/... ./router/ ./i18n/` passes, and
  `go test ./controller/ -run Option` passes.
- The new test `TestTokenConcurrencyLimit` passes under `-race`. It checks
  that:
  - a token at its limit is rejected with `Retry-After`;
  - another token and an unlimited group are not affected;
  - finished requests free their slots.
- `TestValidateTokenConcurrencyLimits` covers the accepted and rejected
  values.
- `go vet` is clean on the changed packages.
- Frontend: `bun run typecheck` passes, `bun run lint` reports nothing in the
  changed files, and `bun run format` was run with unrelated files reverted.
- End to end, against a local build on SQLite with an upstream that answers
  after 3 seconds:
  - saving `not json` or `{"default":-1}` is rejected, and `{"default":2}`
    is saved;
  - three concurrent requests on one token return 200, 200 and an immediate
    429;
  - a request after the first two finish returns 200.
- `TestModelRateLimitStreamFailuresDoNotConsumeSuccessLimit/redis/total=2`
  fails under `-count=3` with or without this change, and passes with
  `-count=1`.
