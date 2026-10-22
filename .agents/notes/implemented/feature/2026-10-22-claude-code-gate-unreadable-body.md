# Agent Note: The Claude Code gate refuses an unreadable body as an invalid request

Status: implemented

## Problem

`enforceClaudeCodeOnlyGroup` in `middleware/claude_code_client.go` judges a
`/v1/messages` request by its body: system prompt, `metadata.user_id`, and
`max_tokens`. When `common.UnmarshalBodyReusable` failed, `detectClaudeCodeClient`
reported the failed check as "request body". The gate then answered
`403 access_denied` with "分组 X 仅接受来自 Claude Code 的请求", and the warning
line did not include the error.

Relay logs from 2026-10-21 06:01 to 2026-10-22 04:15 UTC held 37 such
rejections, all from one user and all `POST /v1/messages?beta=true`. They came
from Cloudflare WARP addresses that also had hundreds of 200s, and their
latencies ran from 46 ms to 1m0.002s. That points to Claude Code uploads that
broke off, not to another client. Because the error was never logged, the cause
is not confirmed: an aborted upload, a body over `MAX_REQUEST_BODY_MB`, or a
parse failure would all look the same. Caddy's timeouts are 600s and the Go
server sets no read timeout, so the one-minute case does not come from either.

## Decision

- A body the gate cannot read or parse is an invalid request, not a verdict on
  the client. `detectClaudeCodeClient` returns the error separately from the
  failed check. The gate answers the way `Distribute` does for the same error:
  `invalidRequestStatus` (413 past `MAX_REQUEST_BODY_MB`, otherwise 400) with
  `distributor.invalid_request` ("Invalid request: <error>").
- The warning line records the group and the underlying error:
  `claude code only group <group>: request body unreadable: <error>`.
  `abortWithOpenAiMessage` also logs the user id with the returned message.
- Malformed JSON is treated the same way: the gate still refuses the request,
  so a body it did not judge never reaches an upstream.
- The User-Agent check still runs before the body is read, so a non-Claude-Code
  User-Agent gets the Claude-Code-only 403 whatever its body. The system prompt,
  header and `metadata.user_id` checks are unchanged.

## Alternatives considered

- **Let an unreadable body through and leave the error to `Distribute`.** That
  produces the same answer for a read error. But a body that is valid JSON with a
  field the probe cannot decode (a string `max_tokens`) may parse in
  `Distribute`'s smaller model request and go on to an upstream unjudged. Refusing
  the request here keeps the gate closed.
- **Keep the 403 and only log the error.** That fixes the diagnosis but still
  tells a real Claude Code user their client was rejected, which sends them to
  check their setup instead of retrying.

## Consequences

- These requests now show in access logs as 400 or 413 instead of 403, and
  their warning line names the error. The next occurrence will confirm the cause.
- Anything that counted 403s from the gate as foreign clients will see fewer.

## Verification

- `go test ./middleware/ -run ClaudeCode -v`: all cases pass, including
  `TestClaudeCodeOnlyGroupUnreadableBody`. That test covers an aborted upload
  (400, "unexpected EOF"), a body over a 1 MB limit (413), malformed JSON (400),
  and an aborted upload from a non-Claude-Code User-Agent (still 403).
