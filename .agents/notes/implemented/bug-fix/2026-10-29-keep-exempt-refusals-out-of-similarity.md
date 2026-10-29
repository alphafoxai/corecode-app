# Agent Note: Keep administrators' refusals out of the risk gate's similarity check

Status: implemented

## Problem

The model fingerprint probe (corecode-infra `scripts/model-trace.py`) runs
under the root account. On 2026-10-29 between 03:17 and 03:26 (UTC+8) the
upstream refused 13 of its prompts with category `reasoning_extraction`. The
violation guard recorded them as `exempt`, because root is an administrator,
but kept their text as excerpts. The risk gate's refusal cache
(`2026-10-28-risk-gate.md`) compares every latest human message with those
excerpts, from any customer. The probe's prompts share one template, so the
next six probes scored 0.85 to 0.89 and were answered 403
`risk_gate_blocked`. One of them was for `claude-opus-5-5`, a model the
upstream had not refused.

## Decision

- `GetRecentRefusedExcerpts` leaves out records in `exempt` mode, so the
  similarity set loaded from the database holds only refusals of customers.
- `RecordUpstreamRefusal` adds a refused message to the in-memory set only
  when the user is not exempt. `violationExempt` holds the role check that
  `applyViolationStrike` already made.

Exempt records keep their excerpts for review, and the guard still writes
them. This matches `GetRefusedViolationConversations`, which already leaves
exempt conversations out.

## Alternatives considered

- **Skip the refusal cache for the probe's key.** This needs a key list in an
  option, and every new probe key would have to be added to it.
- **Compare only messages for the same model.** The opus block shows that the
  probe would still block itself within a model.

## Consequences

When an administrator sends a prohibited prompt and the upstream refuses it,
a near copy from a customer is no longer blocked by similarity. It still has
to pass the distillation, hard regex and decision stages, and its own refusal
then enters the set.

## Verification

- `TestRiskGate` adds an exempt refusal and checks that an identical message
  passes the gate. With the old query restored it fails with "refusals of
  exempt administrators are not compared".
- `go test -race -run 'TestRiskGate|TestViolation' ./service/` passes 35
  tests on SQLite, and `go test ./model/ ./service/` passes. MySQL and
  PostgreSQL were not run: no `TEST_MYSQL_DSN` or `TEST_POSTGRES_DSN` here.
  The query only adds a `mode <> ?` comparison, which
  `GetRefusedViolationConversations` already runs on all three.
- The in-memory path in `RecordUpstreamRefusal` has no test: it runs in a
  goroutine after the response is sent.
