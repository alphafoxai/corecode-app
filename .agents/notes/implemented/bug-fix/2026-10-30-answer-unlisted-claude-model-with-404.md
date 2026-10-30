# Agent Note: Answer an unlisted Claude model with 404

Status: implemented

## Problem

Since v2.1.283, Claude Code starts in auto mode. When the server-side review is
off, for example because a user sets `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS`,
it checks tool calls with separate requests. Those requests ask for
`claude-sonnet-5`, which CoreCode does not serve. The distributor found no
channel for it and answered `/v1/messages` with 503 and the OpenAI-shaped
`model_not_found` body. Claude Code treats a 503 as transient and retries five
times before it falls back to the session's model, so every check waited
through those retries. Anthropic answers an unknown model with 404
`not_found_error`, and Claude Code falls back from that at once. The diagnosis
is in corecode-infra's Agent Note `2026-10-30-auto-mode-classifier-model.md`.

## Decision

- **A model no channel lists gets 404 on `/v1/messages`**, in Anthropic's
  shape: `{"type":"error","error":{"type":"not_found_error","message":"model:
  <name> (request id: …)"}}`.
- **"Lists" counts disabled channels too** (`model.IsModelListed`, exact or
  routing-normalized name). A model whose channels are all disabled or
  auto-disabled still gets 503, because that outage is transient and a client
  should retry it.
- **Other paths and task-plugin routes keep the 503.** Only the Messages format
  has a client known to depend on the difference, and changing the OpenAI
  paths would widen the divergence from upstream for no observed gain.

## Alternatives considered

- **Map `claude-sonnet-5` to `claude-sonnet-5-5`.** It would hide the wait, but
  it answers a request for one model with another, which CoreCode promises not
  to do.
- **404 for every unlisted model on every path.** OpenAI also answers 404, but
  no client here is slowed by the 503, so the change is not worth the upstream
  conflict.

## Verification

- `middleware/distributor_unknown_model_test.go`
  `TestDistributeAnswersUnlistedClaudeModelWithNotFound`, with and without the
  memory cache. An unlisted model on `/v1/messages` gets 404. A listed model
  whose only channel is auto-disabled gets 503. An unlisted model on
  `/v1/chat/completions` gets 503. A served model reaches the handler. The
  404 case fails without the distributor change.
- `go test ./middleware/ ./model/ ./service/` passes.
- Production's `abilities` table, read-only on 2026-10-30, lists
  `claude-sonnet-5-5` and `claude-haiku-5-5` but not `claude-sonnet-5`, so the
  classifier's default request takes the new path.
