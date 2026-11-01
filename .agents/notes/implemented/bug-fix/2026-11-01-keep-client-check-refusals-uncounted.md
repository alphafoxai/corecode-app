# Agent Note: Keep refusals of a client's own transcript checks off the customer's record

Status: implemented

## Problem

On 2026-11-01 record #105 warned user 585 for a `reasoning_extraction`
refusal. The refused request was not the customer's: it was Claude Code's
auto mode check before a tool call, which sends the session as one user turn
that starts with `<transcript>` and ends with an instruction to reason in
`<thinking>` and answer with `<severity>N</severity>`. The engine's log shows
three `max_tokens` 64 checks answered, then the `max_tokens` 8192 one refused
with no output. Claude Code sends these separate checks when the server does
not review auto mode actions, which on CoreCode almost always means the
client set `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS`.

Up to then 25 records had an excerpt starting with `<transcript>`, all
`reasoning_extraction`. Six were `suspend` in observe mode: had the guard been
enforcing, six customers would have been suspended for their client's own
check. Every untruncated excerpt among them ends with the check's
instruction; the rest are cut at 4 KB.

## Decision

- **`clientCheckRefusal`**: a refusal in a lenient category whose excerpt (the
  latest human message) starts with `<transcript>` is the client's own check.
- **`applyViolationStrike`** records it as the new action `client_check`: it
  neither starts nor joins an incident, so it uses no warning, counts toward no
  ban and suspends no one. The conversation is still held, as for every record,
  because the upstream would refuse the same check again.
- **The similarity set leaves it out**, in `GetRecentRefusedExcerpts` and when a
  refusal is remembered: a session transcript is not a message another
  customer could repeat.
- **The console** shows it as "Client check (not counted)".

## Alternatives considered

- **Recognize the check by its system prompt.** `riskGateSecurityMonitor` from
  the vm2api port matches a security-monitor prompt, but no system prompt of a
  refused check was stored, so that match is unverified on production traffic.
  The `<transcript>` turn is what the records show.
- **Exempt every refusal with the wrapper.** A client can write the wrapper, so
  a `cyber` or `bio` refusal behind it would go unpunished. Limiting it to the
  lenient categories leaves a copier only what a first warning already gives.

## Consequences

- A customer whose Claude Code keeps sending separate checks is never
  restricted for them; the pool account still takes each refusal.
  corecode-infra's docs tell customers to remove
  `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS`.
- A held check conversation also marks the customer as recently refused for
  the risk gate's `decision_skip_official`, so their requests go to the
  decision model during the strike window.
- relay-watch must word the new action; until corecode-infra does, its alert
  prints `client_check`.

## Verification

- `go test -race -p 1 ./service/ -run 'TestViolation|TestRiskGate'`, three runs
  on SQLite 3.50.4, MySQL 5.7.44 and PostgreSQL 9.6.24. The new case records two
  checks as `client_check`, holds the conversation, keeps them out of the
  similarity set, then shows the customer's own lenient refusal is still the
  first warning and a `bio` refusal behind the wrapper still suspends. With
  `clientCheckRefusal` returning false the case fails.
- `go build ./...`, `go vet ./service/ ./model/`.
- Console: `bun run typecheck`, `bun run format:check`, `bun run lint:check`,
  `bunx vitest run src/features/system-settings` (235 tests, one asserting the
  new label) and `bun run build`; `bun run i18n:sync` changes nothing further.
