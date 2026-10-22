# Agent Note: Read a gpt-load pool's balance for Anthropic channels

Status: implemented

## Problem

The channel list showed `gpt-load-claude` at $0 with "Never" as the update time. That channel is an Anthropic channel (type 14) pointing at the gpt-load engine, and `updateStandardChannelBalance` had no branch for type 14. It answered "Not implemented yet" and stored nothing. Anthropic itself has no balance endpoint, so the official host cannot be queried.

## Decision

Type 14 calls `GET {base_url}/v1/pool/balance` with the channel key as a Bearer token, except when the base URL is the official Anthropic host, which keeps the "Not implemented yet" answer.

- The response's `balance` is stored as USD. It is the engine's estimate of the subscription pool's weekly remainder in reference cost.
- An inactive key is an error and stores nothing.
- A missing, non-finite or negative balance is an error and stores nothing.
- A non-200 answer is an error and stores nothing. The engine answers 503 when it cannot estimate.

## Alternatives considered

**Changing the channel to the Sub2API or Advanced Custom type**, whose balance flows already call configurable endpoints. That would re-model the routing of the only production channel to change a read-only figure.

## Consequences

- Other Anthropic-compatible proxies now answer a balance update with "upstream does not report a pool balance", instead of "Not implemented yet".
- With `auto_ban` on, update-all disables a channel at zero balance. That is now possible only when the engine reports a real zero, never for a missing estimate.
- The engine contract is recorded in `alphafoxai/corecode-infra` `notes/workspace/`.

## Verification

`channel_billing_anthropic_pool_test.go` covers:

- storing the weekly remainder;
- the request path and the Bearer key;
- trailing-slash base URLs;
- storing nothing for 503, 404, an inactive key, a missing balance and a negative balance;
- skipping the official host.

The existing Sub2API balance tests and `go vet ./controller/` pass.
