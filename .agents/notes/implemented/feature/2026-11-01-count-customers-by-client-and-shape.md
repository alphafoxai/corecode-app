# Agent Note: Count each customer's Claude requests by client and shape, and let Claude Code skip the decision model

Status: implemented

## Problem

The risk gate (`2026-10-28-risk-gate.md`) judges each request on its own.
Harvesting a model shows in the pattern of many requests: a customer sends
mostly bare requests (one message, no tools) from a client that is not Claude
Code. No single request reveals that, and nothing recorded it. On production,
from 2026-10-29 to 2026-11-01, the group that admits any client carried 58%
of Claude requests (19,503 of 33,819, 71 customers), and the only per-request
structure check, `harvest`, had matched twice, once on a Codex memory job.

The decision model runs on every human turn. In the same period it was called
9,079 times for 46,034 requests, blocked once, and failed 66 times (52 HTTP
403 from Jev in one 17-minute window, 14 timeouts). Each call adds about
110 ms at the median to a turn. Most of those turns come from Claude Code,
which the client recognition the structured policy already uses identifies.

## Decision

- **`risk_customer_hourly_counts`** holds, per customer and hour, the Claude
  requests that entered the gate: `requests`, `other_client` (not recognized
  as official Claude Code), `bare` (one message besides system prompts and no
  tools; Responses `input` counts as the conversation), and
  `bare_other_client`. The last one is kept as its own counter because it
  cannot be derived from the others. Only models named `claude*` are counted:
  the Claude pool is the one a harvester puts at risk, and recognition is for
  Claude Code. Counters are buffered with the gate's hourly counters, written
  by increment so two servers during a release add up, and pruned after
  30 days with the gate's events. corecode-infra's relay-watch reads the table.
- **`readRiskGateRequest`** parses the body once for the four request types
  the structured policy reads, and returns the body, the client recognition
  and the shape. The structured policy reuses it, so recognition still runs
  once per request. With legacy line rules the body is now read too, for the
  counters; a body that does not parse only skips the counters.
- **`risk_gate_setting.decision_skip_official`**, off by default. When on, a
  request from a recognized official Claude Code client skips the decision
  model unless its customer has a refused conversation in the violation
  guard's window (`violationRefusedRecently`, read from the guard's loaded
  state). The console has a switch for it.

## Alternatives considered

- **Tag each consume log.** `logs.other` is written at settlement, which is
  billing code, and querying JSON in a text column differs per database.
- **Count in the engine.** The engine sees one access key for every new-api
  customer, so it cannot attribute a request to a customer.
- **Skip the decision model for the Claude Code-only group instead of by
  recognition.** That group already requires Claude Code, so the result is
  the same there, but the open group's Claude Code users would still pay the
  latency.

## Consequences

- Recognition reads headers and body fields the client sets. A client that
  copies Claude Code's shape is counted as Claude Code and, with the switch
  on, skips the decision model. The structured policy's hard needles, hard
  rules and the violation guard still apply to it.
- Claude Code's own side requests (titles, quota checks, the security
  monitor) are bare, so `bare` alone is not a harvesting signal;
  `bare_other_client` is.
- With the violation guard off, no customer has a refused conversation, so
  every recognized request skips the decision model when the switch is on.

## Verification

- `go test -race -p 1 ./service/ -run 'TestRiskGate|TestViolation'` passes
  three runs in a row on SQLite 3.50.4, MySQL 5.7.44 and PostgreSQL 9.6.24.
  The new case checks that a recognized client without refusals makes no
  decision call, that an unrecognized client and a recognized one whose
  customer has a recent refusal are judged, that two flushes add to one row,
  that a GPT request is judged but not counted, and the four counters.
- `go test -p 1 ./model/ -run Migration` passes on the same three databases,
  including `TestMigrationSchemaStability`.
- Migration: on each database a binary built from `origin/main` (82e539182)
  created the schema, then this branch's binary started twice. Every start
  served `/api/status` with no error line in its log. The table has the
  composite primary key (`user_id`, `hour_start`) and an index on
  `hour_start` on all three.
- Console: `bun run typecheck`, `bun run format:check`, `bun run lint:check`,
  `bunx vitest run src/features/system-settings` (235 tests) and
  `bun run build` pass. `bun run i18n:sync` changes nothing further.
