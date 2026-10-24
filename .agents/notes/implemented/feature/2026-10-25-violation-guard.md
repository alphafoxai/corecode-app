# Agent Note: Turn an upstream usage-policy refusal into a strike against the customer

Status: implemented

## Problem

Every customer request reaches Anthropic through a shared pool of Claude
subscription accounts. Anthropic counts usage-policy violations per account and
warns, then bans, an account that keeps violating. One customer who sends
violating content therefore puts a pool account at risk for everyone, and
nothing in new-api tied the violation to that customer:

- A classifier refusal is HTTP 200 with `stop_reason: "refusal"` and
  `stop_details.category` (for example `cyber`). new-api only wrote
  `reject_reason` into the admin-only log fields.
- Claude Code resends the whole conversation on every turn, and a customer
  usually retries a refused prompt. One violating message therefore reaches
  Anthropic again on every later request of that conversation.
- The built-in sensitive-word check matches the whole context (system prompt,
  history and tool results), so a broad word blocks normal coding sessions. It
  also returns the matched word to the client and counts nothing per customer.

## Decision

- **`violation_guard_setting`** holds `enabled` (default off), `mode`
  (`observe` by default, or `enforce`), `suspend_hours` (24), `ban_strikes`
  (2) and `strike_window_days` (30). Operators set it under System settings →
  Security → Usage policy violations. `controller/option.go` rejects an
  unknown mode, negative numbers and a window under one day.
- **A refusal becomes a `violation_records` row.** The Claude adaptor marks
  the request when it sees `stop_reason: "refusal"`, streamed or not, on the
  Messages and the OpenAI-compatible routes, and keeps `stop_details.category`.
  After the response has been sent, `service.RecordUpstreamRefusal` records
  the refusal off the request path.
- **A strike suspends relay access for `suspend_hours`; `ban_strikes` strikes
  in the window disable the account.** The account is disabled through
  `User.Update`, which also revokes browser sessions and token caches.
- **Refusals from one incident count once.** Claude Code runs subagents in
  parallel, so one violation can produce several refusals at once. Counting
  each one would make two strikes, and so a ban, out of a first offence. A
  refusal adds a strike only when the conversation has no strike yet in the
  window and the user's last strike is older than the suspension period (at
  least ten minutes). The second condition is a conditional `UPDATE` on
  `user_violation_states`, so concurrent refusals claim one strike. Every
  other refusal is recorded as `merged`.
- **A refused conversation stays blocked for the strike window.** Each request
  is fingerprinted by a chain hash over its human-written user messages. Tool
  results and `<system-reminder>` blocks are excluded, so the next turn of the
  same conversation reproduces the hash and an unrelated conversation that
  repeats one message does not. A request that carries a refused hash gets 403
  `violation_conversation_blocked`, and the client is told to start a new
  conversation or edit the message.
- **Both checks run in `controller.Relay` before billing and channel
  selection.** A blocked request costs the customer nothing and never reaches
  the pool. The Responses WebSocket enters the same handler.
- **Observe mode records and restricts no one.** Its rows record what enforce
  mode would have done, and the logs record what it would have rejected.
  Strikes count only within the mode that recorded them, so enforce mode
  starts from zero. Without this, a customer struck while observe mode was on
  would be banned by the first refusal after the switch, and the last observe
  strike would merge away the first enforce strike. Conversations refused in
  observe mode are still blocked once enforce mode is on.
- **The refused message is kept for review while strikes count.** A record
  holds the last human message of the refused request, cut to 4 KB, so
  operators can see what was refused and tune earlier filters against what
  Anthropic actually declined. It is shown only in the admin table, and each
  new record clears the messages of records older than the strike window.
- **Administrators are recorded as `exempt` and never restricted.**
- **`POST /api/user/:id/violations/lift`** ends the suspension, unblocks the
  user's refused conversations and stops earlier strikes from counting. It is
  audited as `user.manage` with action `lift_violations`. It does not
  re-enable a disabled account. An operator who re-enables one in user
  management should lift first; otherwise the next refusal bans the account
  again. `GET /api/user/violations` lists the rows for the console table. Both
  routes are admin-only and declared for personal access tokens as
  `user:read` and `user:write`.
- **Suspensions and refused conversations are cached in process memory,** and
  loaded from the database on first use. One new-api instance serves the
  relay. Every strike and lift writes the database first.

## Alternatives considered

- **Review each request with a model before forwarding it.** It is the only
  way to stop the first violating request, but it adds a full review call to
  every request's time to first token, including every tool-loop turn.
  Reviewing in parallel with the upstream call does not help, because the
  content has already reached Anthropic. Reviewing with a pool Claude account
  sends the content to Anthropic anyway.
- **corecode-engine's request audit (`request_audit`).** It reviews only new
  content and caches verdicts, but every request with new content still waits
  for one JEV call, and it passes requests when JEV times out or fails. It also
  sees only new-api's single access key, so it cannot attribute a violation to
  a customer.
- **Broaden the sensitive-word list.** It matches the whole context, blocks a
  conversation for good on one hit and tells the client which word matched.
- **Strike on every refusal.** Parallel refusals from one incident would ban a
  first offender.

## Consequences

- The first violating request of a conversation still reaches Anthropic. The
  guard bounds what follows: that conversation is not resent, the customer is
  suspended, and a repeat offender loses the account.
- With several new-api instances, each one caches only its own copy. A
  suspension or block made on another instance takes effect there after a
  restart.
- A disabled account is restored only through user management, and its strikes
  are cleared only by a lift.
- Refusals that Anthropic reports as an HTTP 400 input-validation error are
  not counted. Only `stop_reason: "refusal"` is.

## Verification

- `TestViolationStrikePolicy` passes on SQLite 3.50.4, MySQL 8.0.46 and
  PostgreSQL 17.11, three runs each under `-race`. It checks that:
  - eight concurrent refusals record one `suspend` and seven `merged`;
  - resending the refused conversation after the suspension adds no strike,
    and a refusal in another conversation bans the account;
  - observe mode restricts no one and enforce mode does not count its strikes;
  - administrators are exempt;
  - a lift ends the suspension and resets the count;
  - a refused conversation stays blocked after a restart reload, while a new
    conversation passes;
  - a refused message older than the strike window is cleared.
- `TestViolationConversationKeys` checks that tool results and reminder-only
  messages are excluded, that a later turn reproduces the refused key, and
  that the same text in another conversation does not.
- Migration, on SQLite, MySQL 8.0.46 and PostgreSQL 17.11, with the binary run
  twice each time:
  - on an empty database, the schema of both tables is identical after the
    second start;
  - on a database first created by the `main` binary with a customer row
    added, the schema matches the fresh one, and the row and the `users`
    indexes are unchanged.
- `go test` passes for `service`, `model`, `controller`, `relay/...`, `i18n`,
  `pkg/perf_metrics`, `setting/...`, `router`, `middleware` and `constant`.
  `GOWORK=off go build ./...` passes in `relaykit`.
- Frontend: `bun run typecheck` passes, and `bun run test
  src/features/system-settings` passes 204 tests. oxlint and oxfmt report
  nothing in the changed files. `bun run lint` and `bun run copyright:check`
  fail only on files this change does not touch.
- End to end, against a local build on SQLite and a fake Anthropic upstream
  that refuses with `category: cyber`, in enforce mode:
  - a streamed refusal suspends the customer;
  - the next request gets 403 with the suspension end time in Chinese;
  - the record lists `cyber`, `suspend` and `enforce`, and the refused
    message without the injected `<system-reminder>` block;
  - after a lift, requests pass again;
  - with `suspend_hours` 0, a non-streamed refusal records a `strike`;
  - resending that conversation gets 403 `violation_conversation_blocked`,
    and a fresh conversation passes;
  - the upstream received neither blocked request.
