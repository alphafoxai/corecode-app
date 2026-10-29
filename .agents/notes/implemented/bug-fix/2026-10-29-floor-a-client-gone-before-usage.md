# Agent Note: Bill a client that left before the usage arrived at the cache-read rate

Status: implemented

## Problem

User 318 reported request `202610280840183417112358268d9d6u2PcFh20` on
2026-10-28. Claude Code took 58 seconds to upload a 687 KB body and
disconnected 1.8 seconds after the request went upstream, before new-api read
`message_start`. The customer received nothing. The log records `client_gone`,
`frt` -1000 and zero output.

The upstream had read the prompt. gpt-load recorded 227,997 cache-read tokens,
2 uncached input tokens and 5 output tokens, at a cost of $0.046. new-api had
none of that usage. `HandleStreamFinalResponse` fell back to the local prompt
estimate of 194,132 tokens and billed all of it as uncached input: 737,702
quota, $1.48. The upstream usage, priced at this customer's rates, comes to
about 43,400 quota, $0.09.

The case was common. In the 7 days to 2026-10-28, 192 streams ended
`client_gone` with no output and an estimated Anthropic usage. They charged
13 users $230.

## Decision

When a Claude stream ends `client_gone` before the upstream reported input
usage, the prompt estimate is recorded as cache-read tokens and uncached input
stays zero. Settlement then prices it at the model's cache ratio through the
existing path. A tiered expression prices it as `cr`, or as input when it has
no `cr` price, the same as any other cache read. The rest of
the fallback is unchanged. Output is estimated from any streamed text, and an
upstream break that is not a client disconnect still bills the estimate as
uncached input.

Cache read is the lowest input rate the upstream can charge for a prompt. It
also matches what these requests usually cost: a Claude Code session reads
nearly all of its prompt from the cache.

## Alternatives considered

- **Charge nothing.** The upstream still bills the pool for the prompt it read,
  and a client could cancel just before the first byte to warm the cache for
  free.
- **A fixed minimum per request.** It ignores prompt size. A large prompt would
  cost the pool more than it was charged, and a small one would be overcharged.
- **Use the engine's usage.** gpt-load records the real usage, but new-api has
  already settled by the time gpt-load writes it. Joining the two would need a
  new cross-repository contract.

## Consequences

- When the cache was cold, a request is undercharged by the gap between a cache
  write and a cache read. The client received no output in either case.
- Streams that received `message_start` already bill the upstream's input and
  cache usage, so they are unchanged.

## Verification

- `go test ./relay/channel/claude/ -run ClientGoneBeforeUsage` fails on the
  previous code, which bills 1,200 uncached input tokens and no cache reads,
  and passes with the fix.
- `TestClaudeCacheOnlyUsageRemainsBillable` in `service/text_quota_test.go`
  already settles a cache-read-only Claude usage at the cache ratio.
