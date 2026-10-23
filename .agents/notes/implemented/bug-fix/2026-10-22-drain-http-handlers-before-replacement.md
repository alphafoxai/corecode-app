# Agent Note: Drain HTTP handlers before instance replacement

Status: implemented

## Problem

A process shutdown timeout cannot protect an HTTP stream if its container supervisor kills the process sooner. The deployment investigation supplied for this change correlates Caddy unexpected EOF errors on 2026-10-22 with container replacement. New API previously exposed no admission control or active-handler count for a deployer to wait on before stopping it.

## Decision

A small net/http handler in `pkg/deployment` wraps Gin at the existing listener. One mutex serializes admission, drain, resume and the active count. The decrement runs only after Gin returns, including its deferred cleanup. The original ResponseWriter reaches Gin unchanged, preserving streaming and hijacking interfaces. Admitted requests keep their existing contexts and may proceed through downstream work after drain begins.

Only actual loopback TCP peers can access the reserved deployment namespace; forwarded headers never grant authority. Controls run before normal middleware. GET health probes remain available and uncounted. Terminal signal handling permanently closes admission before the existing HTTP shutdown, preventing a concurrent resume from reopening it.

The API and rollout prerequisites are owned by the [deployment admission reference](../../../../README.md#corecode-deployment-admission). Infra owns deployment ordering, public proxy rejection and the first legacy-image maintenance bootstrap. The runtime image advertises support through `live.corecode.deployment-drain="1"`.

## Alternatives considered

- Increasing shutdown grace alone does not prevent new admissions or establish quiescence before replacement.
- Wrapping ResponseWriter risks losing Flusher or Hijacker. Counting the complete outer handler needs no writer wrapper.
- Gin-only middleware runs inside framework routing and lifecycle behavior. The listener wrapper also reserves unknown control descendants before those paths run.
- Canceling admitted contexts would recreate the truncated-response failure. Drain changes admission only.

## Consequences

New requests can receive retryable, pre-stream 503 responses; this is not zero downtime. An active hijacked handler can keep deployment waiting indefinitely, so the deployer must abort and resume rather than force replacement on a drain timeout. Resume preserves the active count. A lost control response leaves state inspectable and recoverable through a fresh request. Loopback proxies must reject the reserved namespace themselves because their local connections are indistinguishable from other local callers.

## Verification

`go test -race ./pkg/deployment` passed 21 tests. The real-listener regression preserves the complete streamed body and deferred cleanup across drain; it also covers hijack lifetime, cancellation-safe resume, remote-address restrictions and terminal shutdown protection. The actual application binary built with the existing console assets. An isolated Caddy → new-api → gpt-load → controlled upstream smoke received final content and `[DONE]` after admission closed, replaced the processes only after zero active work, and completed another stream after restart. A timed-out release kept the old process and let its stream finish. Production rollout is not performed or verified.
