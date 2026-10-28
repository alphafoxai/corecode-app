# Agent Note: Count cache tokens in the rankings, and keep them out of token_used everywhere

Status: implemented

## Problem

On 2026-10-28 the week view of `/rankings` showed claude-opus-5-5 at 57M
tokens. Production's `quota_data` held 7.18B for the same week: 57M of
`token_used`, 6.97B of cache reads and 154M of cache writes. The rankings
summed `token_used` alone.

`token_used` is `prompt_tokens + completion_tokens` of the consume log, and
the two usage forms disagree about what `prompt_tokens` holds:

- Anthropic usage reports `input_tokens` without the cache reads and writes.
  Every Claude request is in this form.
- OpenAI usage counts them inside `prompt_tokens`. gpt-6-astra's week was
  19.9M of `token_used`, 18.3M of which were cache reads.

So the rankings left out nearly all of Claude Code's traffic, and also showed
GPT models at about a third of Opus's volume when they had about 0.3% of it.

The cache columns were added on 2026-10-22, so the rows before that date hold
no cache tokens at all.

## Decision

- **`token_used` is uncached input plus output, for every usage form.** The
  cache reads and writes are only in `cache_read_tokens` and
  `cache_creation_tokens`, and the three columns add up to every token. A
  consume log whose `prompt_tokens` counts the cache (`PromptIncludesCache`,
  set by `PostTextConsumeQuota` on the same rule it bills by) has the cache
  subtracted, clamped at zero, before the row is written. Anthropic rows
  already had this form.
- **The rankings sum all three columns**, both the totals and the per-bucket
  series.
- **`bin/backfill_quota_data_tokens.sql` rewrites the history** from the
  consume logs in the same form. It recomputes each ended and flushed hour,
  so it fixes the GPT rows, restores the cache tokens before 2026-10-22, and
  changes nothing when run again. A key that both hosts wrote in the
  2026-10-26 move is split between their rows by request count.

## Alternatives considered

- **Make `token_used` the total, cache included.** The console's
  `calculateDashboardStats` and the site insights' cache share already add the
  cache columns to `token_used`, so they would count the cache twice, and the
  console releases separately from the server.
- **Decide per model in the rankings query.** The form belongs to each
  request, not the model: Claude reached through OpenAI-shaped endpoints is
  tagged per log. Only the write path and the logs know it.

## Consequences

- The dashboard total and the site insights' cache share now also hold for
  GPT rows, which previously counted their cache twice.
- The console's token charts (`charts.ts`, `flow.ts`) still plot `token_used`
  alone, which is uncached input and output. That is a separate console change.
- The backfill is PostgreSQL only and needs the logs in the main database,
  which is the production layout. Hours whose logs were deleted keep their
  values.
- Order: release the server, wait two full hours so every unsettled hour was
  written by it, then run the backfill.

## Verification

- `TestPostTextConsumeQuotaKeepsCacheOutOfQuotaDataTokens` writes an OpenAI
  and an Anthropic request with the same tokens and expects the same
  `quota_data` row; without the write-path change the OpenAI row holds 12050
  instead of 1050. `TestRankingQuotaCountsCacheTokens` covers the totals and
  buckets.
- `go test ./model/ ./service/ ./controller/` passes.
- The ranking query run read-only on production PostgreSQL returns
  claude-opus-5-5 at 7.21B for the week.
- The backfill run on production inside a transaction that was rolled back:
  94 of 796 rows changed, no ended hour lacked logs, and the rewritten rows
  matched the logs' totals within rounding (cache reads equal, `token_used`
  and cache writes within 0.001%).
