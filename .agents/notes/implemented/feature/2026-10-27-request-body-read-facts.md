# Agent Note: Record how each request body was read

Status: implemented

## Problem

On 2026-10-27 a Claude Code user got `499 status code (no body)` three times. new-api waited 62–79 s for each body, then logged `Invalid request: unexpected EOF`. Nothing recorded how large the body was declared to be, how much of it arrived, or how long the read took, so whether the upload was slow, stalled or cut off had to be inferred from timestamps.

This is the new-api part of layer 1 in corecode-infra's `notes/workspace/proposed/feature/2026-10-27-diagnose-requests-without-storing-every-body.md`, which records request sizes and timings and never content.

## Decision

`common.GetRequestBody` is the one place a request body is read. The first read measures it and stores a `common.RequestBodyRead` in the gin context, read back with `common.GetRequestBodyRead`:

| Field | Meaning |
|---|---|
| `content_length` | The request's `Content-Length`, `-1` when unknown (chunked) |
| `bytes` | Bytes the handler received before the read ended |
| `read_ms` | Time spent reading, from the first read to the end |
| `error` | The read error's text, absent on success |

A later call returns the cached body or the cached error and leaves the measurement alone. `bytes` counts what the handler received, which for a compressed upload is the decompressed size while `content_length` is the size on the wire.

The measurement reaches two places:

- `AppendRelayLogAdminInfo`, which both consume and error logs call, writes it to `other.admin_info.request_body`. `formatUserLogs` strips `admin_info`, so customers never see it.
- `abortWithOpenAiMessage`, which answers every early invalid-request failure in middleware, appends `body read N bytes of content-length M in T ms` to its log line when the read failed. The line has a Chinese text in `common/log_text.zh-CN.json`.

## Alternatives considered

- Wrapping the read error with the counts would put them in every message that quotes the error, including the response the client gets and the usage log it reads. The counts belong to operators.
- Logging from each caller of `GetBodyStorage` would mean a dozen call sites that each must remember to log. All early failures already pass through `abortWithOpenAiMessage`.
- Measuring in a middleware around the request would also count time spent before the body is read, such as authentication and group lookup, and would not know the read's outcome.

## Consequences

An aborted upload, like the 499s, now shows in the log line as received bytes against the declared length, with the time it took. For a request that reaches relay, an administrator sees the same facts in the log's `admin_info`.

Requests rejected in middleware before relay are still not written to the logs table. Their facts exist only in the process log line.

A body read that fails later, inside the relay retry loop (`controller/relay.go`), records the facts in the error log's `admin_info`. Its process log line does not include them.

## Verification

- `TestGetRequestBodyRecordsHowTheBodyWasRead` covers a complete body, an upload that stops after 20 of 4096 declared bytes with `unexpected EOF`, and a chunked body, and checks that a cached second read leaves the measurement unchanged. Removing the measurement on the error path fails the cut-off case.
- `TestRelayLogAdminInfoCarriesRequestBodyRead` checks that consume and error logs carry `request_body`, and that a request whose body was never read carries none. Removing the `SetAdmin` call fails it.
- `TestRequestBodyReadIsAdminOnly` checks that `formatUserLogs` drops it and `FormatAdminLogs` keeps it.
- `TestRequestBodyFailuresReportTheirCause`, which already exists, prints lines such as `Invalid request: unexpected EOF | body read 26 bytes of content-length -1 in 0 ms`.
- `go vet ./...`, CI's `go test` set, and `go test -race ./pkg/deployment` passed locally.
