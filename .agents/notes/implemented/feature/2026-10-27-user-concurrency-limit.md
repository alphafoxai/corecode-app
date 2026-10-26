# Agent Note: Count the concurrency limit per user, not per token

Status: implemented

## Problem

`token_setting.concurrency_limits` capped the requests one token had in
flight. A user may create up to `token_setting.max_user_tokens` tokens (20 in
production), so with `{"default":5}` one customer could still run 100
requests at once by spreading them over several keys. That defeats both
purposes of the limit: keeping one customer from occupying the subscription
pool, and bounding how much one wallet can owe when concurrent requests
settle after its balance runs out.

## Decision

- **The counter is keyed by user id** (`ContextKeyUserId`, set by token
  authentication), so every token of a user shares one count.
  `UserConcurrencyLimit` replaces `TokenConcurrencyLimit` at the same place
  in the `/v1` and `/v1beta` chains.
- **The option keeps its key `token_setting.concurrency_limits`** and its
  value shape. Stored values carry over, and the console already in
  production reads and saves the same key while the server ships first.
  Only its meaning changes: the number is now per user.
- **The 429 message names the account,** not the API key, so a customer
  understands that other keys count against the same limit.
- The console label and help text say "per user".

## Alternatives considered

- **Keep the per-token limit and add a per-user one.** Two settings to tune
  for one purpose; the per-token limit adds nothing once the user total is
  bounded.
- **Rename the option to a `user_setting` key.** It would need a migration
  of the stored value and a console release before the server could stop
  reading the old key.

## Consequences

- The production value `{"default":5}` becomes five requests per customer
  across all keys. A customer running Claude Code with several subagents
  meets the limit sooner; Claude Code retries the 429 with backoff. Raise the
  value if that is too tight.
- The other consequences of the 2026-10-23 note still hold: the count is per
  process, so during a blue/green release a user may reach twice the limit,
  and the Responses WebSocket route is not counted.

## Verification

- `go test ./middleware/ -run Concurrency` passes under `-race -count=3`.
  `TestUserConcurrencyLimit` fills user 1's two slots with requests on two
  different tokens and checks that a third token of the same user gets 429
  with `Retry-After`, while another user and an unlimited group pass.
- `go test ./setting/... ./router/ ./i18n/` and
  `go test ./controller/ -run Option` pass; `go vet` is clean on the changed
  packages.
- Frontend: `bun run typecheck` passes, the system-settings vitest suite
  passes, and `bun run lint` and `bun run format:check` report nothing in the
  changed files.
