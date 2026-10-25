# Agent Note: Name Claude Code auto mode as a cause of non-streaming cache misses

Status: implemented

## Problem

The console explains a costly cache miss (see
[usage insights](2026-10-22-usage-insights.md)) with three causes: a new
session, a model switch mid-session, or a pause past the 5-minute cache
lifetime. A customer with a low cache rate in October 2026 matched none of them:

- 230 of 233 requests stayed on one pool account, so affinity held.
- Streaming requests in the same session hit the cache 95% of the time.
- 82 non-streaming requests each read 0.07K to 13K cached tokens and wrote
  about 65K new ones, which the next request did not reuse. 74 of them were
  sent within 3 seconds of a streamed reply, median 0.8 seconds.

That shape matches Claude Code auto permission mode: before a tool call its
classifier sends the conversation to the model as a separate, non-streaming
request, and only a fixed prefix of 1-2K tokens caches. The console's
explanation sent the customer looking for a session or relay fault instead.

## Decision

- **`isNonStreamCacheMiss`** in
  `web/src/features/usage-logs/lib/cost-check.ts` is a costly miss on a log
  with `is_stream` false. Claude Code streams every main-conversation turn, so
  this separates classifier checks from the causes already listed.
- **The overview alert switches explanation by majority.**
  `summarizeRecentLogs` counts `nonStreamMisses`. When more than half of the
  costly misses did not stream, the alert explains auto mode, says how to tell
  whether it is on (`--permission-mode auto` or Shift+Tab), and says that the
  cost is expected rather than a relay fault.
- **Per-request flags use a tooltip.** `CacheMissTooltip` replaces the native
  `title` on the usage log's "Cache miss" badge and on the recent-requests
  cache rate. A native `title` appears late, is unreachable by keyboard, and
  never shows on touch screens. A non-streaming miss gets the auto mode
  explanation; a streaming one keeps the old text.
- **The copy says "likely".** The logs do not record request bodies, and
  another client or SDK can send non-streaming requests too.

## Alternatives considered

- **A tooltip on the cache hit rate card.** It can only describe causes in
  general, while the alert and the per-request flags point at specific
  requests. Left out.
- **A hit rate over streaming requests only.** It would match how the session
  feels, but it changes the metric's definition and stops matching the daily
  cache chart, which `quota_data` cannot split by stream mode.
- **A site-wide banner.** Only customers who turn auto mode on see these
  misses; a banner would interrupt everyone else.

## Consequences

- A customer in auto mode now reads that the extra cache writes are the price
  of auto mode, which can lead them to turn it off. That choice stays theirs.
- A non-Claude Code client that sends long non-streaming requests also gets
  the auto mode wording. The alert only switches when such misses are the
  majority, which limits this to accounts where the shape dominates.

## Verification

- `bunx vitest run src/features/usage-logs src/features/dashboard` covers
  `isNonStreamCacheMiss` and the `nonStreamMisses` count.
- `bun run typecheck`, and `bun run lint` and `bun run format:check` on the
  changed files.
