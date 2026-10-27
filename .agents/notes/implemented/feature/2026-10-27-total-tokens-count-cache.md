# Agent Note: Count cache tokens in the dashboard's total tokens

Status: implemented

## Problem

The "Total Tokens" card on `/dashboard/models` summed `quota_data.token_used`,
which is prompt plus completion tokens. Every request here goes upstream as
Claude Messages, whose `input_tokens` excludes cache reads and writes, so the
card left out almost everything a Claude Code session sends. In production a
request that processed about 416,000 tokens added 435 to the card: 2 uncached
input, 433 output, 413,321 cache read and 1,807 cache write.

## Decision

- **`calculateDashboardStats` adds the cache read and cache write tokens to
  `totalTokens`,** so the card shows every token processed. The two cache
  cards are unchanged and still show their parts.
- **Average TPM follows,** because it divides the same total by the range.
- **The sum is made in the console.** `quota_data` already stores the cache
  counts per hour and model, so no server change or migration is needed, and
  historical rows show the new total too.

## Alternatives considered

- **Store processed tokens in `token_used` at log time.** Only new rows would
  change, so a range spanning the release would mix two meanings, and the
  admin flow chart and every upstream reader of `token_used` would change with
  it.
- **Rename the card instead.** The customer wants the processed total, not a
  clearer name for a number that leaves out the cache.

## Consequences

- The sum assumes Anthropic usage, where input excludes the cache. An
  aggregate row no longer says which convention its requests used, so an
  OpenAI-style upstream, whose prompt tokens include cached ones, would be
  counted twice. All production traffic in the seven days before this change
  converted to Claude Messages; revisit this if a non-Claude channel is added.
- The admin flow page's "By tokens" metric still reads `token_used` alone.

## Verification

- `bunx vitest run src/features/dashboard` passes, including
  `lib/__tests__/stats.test.ts`, which checks the new total and that non-finite
  or negative cache counts add nothing.
- `bun run typecheck` passes; `oxlint` reports no error in the changed files.
  `bun run format:check` reports the same 26 files with and without this
  change, none of them changed here.
