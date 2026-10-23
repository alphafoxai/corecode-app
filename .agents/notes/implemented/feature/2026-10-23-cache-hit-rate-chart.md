# Agent Note: Show the cache hit rate and what the cache saved on model analytics

Status: implemented

## Problem

The overview shows 14 days of cache hit rate, but the model analytics page,
where customers look at their usage in detail, showed only raw cache read and
write token counts. A customer could not see:

- the hit rate over the range they are viewing, or per model;
- whether it improved on the period before;
- what the cache saved them in money.

## Decision

- **A cache hit rate panel on `/dashboard/models`,** at the bottom of the
  page, below the model call chart. It follows the page's time range, granularity and user filter, and
  reads the `quota_data` rows the page already loads. One bar per hour, day or
  Monday-based week; a bucket without cache use shows no bar instead of 0%.
- **The rate is reads ÷ (reads + writes),** the same as the overview, through
  `getCacheHitRate` in `web/src/features/dashboard/lib/cache-hit-rate.ts`.
  Models that recorded no cache use are left out.
- **A legend switches the series** between all models and one model. The
  headline rate and the savings follow the selected series.
- **Change against the previous period.** The panel fetches the period of the
  same length just before the range, and shows the rate change in percentage
  points and the savings change in percent.
- **Net savings are estimated on the client, with no backend change.**
  - Saved = reads × input price × (1 − cache read ratio).
  - Write premium = writes × input price × (cache write ratio − 1).
  - Net = saved − write premium.
  - Prices come from `/api/pricing`. A missing ratio falls back to the
    backend's defaults, 1.0 for reads and 1.25 for writes.
  - The group ratio of a model is that of the first `auto_groups` entry
    serving it, because the default key routes through `auto`. Without one,
    the cheapest group serving the model is used.
  - Per-call and tiered models are left out, and the panel says so.

## Alternatives considered

- **Return `use_group` from `/api/data/self` for an exact group ratio.** It
  changes a query that must be checked on SQLite, MySQL and PostgreSQL. For
  current traffic the auto-group rule already resolves the group that billed
  every Claude request.
- **Draw the bars with VChart like the other model charts.** Plain elements
  match the overview's cache chart, follow the theme tokens without a chart
  theme, and give each bar its own accessible label.

## Consequences

- Savings are an estimate at today's prices. A price change re-prices past
  periods.
- `quota_data` does not split 5-minute from 1-hour cache writes, so every
  write is priced at the model's write ratio. A customer using 1-hour caching
  sees the write premium understated.
- A customer whose key names a group other than the auto group sees savings
  at the auto group's ratio.
- The panel adds one `/api/data` request per range change, for the previous
  period.

## Verification

- `bun run typecheck` passes.
- `bun run lint` reports no issue in the changed files.
- `bun run format:check` passes.
- Vitest over `src/features/dashboard` passes 67 tests, including six new
  cases for bucketing, the per-model split, group-ratio selection and the
  savings net.
- Browser check against a local backend built from this branch, on SQLite,
  with a `Claude 满血` channel at group ratio 1.75 and 28 days of seeded
  `quota_data`:
  - the rate, the change and the savings breakdown render;
  - selecting a model in the legend switches the bars and the figures;
  - at 390 px wide the page does not scroll sideways, and the axis labels do
    not overlap;
  - dark mode renders.
