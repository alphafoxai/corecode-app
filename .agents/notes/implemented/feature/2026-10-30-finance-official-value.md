# Agent Note: Show what a new-api dollar and a pool account are worth at official prices

Status: implemented

## Problem

The owner wants two figures the funds view did not give. The first is the real
multiple: for each dollar new-api charges for Claude, how many dollars of
official-price cost the subscription pool spends. The second is what one account of
each plan serves in a week at official prices, and so what it is worth in new-api
dollars. Whether the balance spent was gifted or paid does not matter for either.

The activity view already showed corecode-engine's official-price cost beside new-api's
charge, but the charge covered every model, it gave no ratio, and nothing
converted an account's capacity.

## Decision

- **The finance endpoint adds the engine's official-price Claude cost** for the range
  (`/api/usage/daily` with `model_prefix=claude-`, read in parallel with the database
  queries), and new-api's Claude charge, from `quota_data` rows whose model starts
  with `claude-`.
- **The ratio uses only the days the engine reported** (`matched_official_usd` over
  `matched_claude_usd`). A day the engine no longer keeps then drops out of both sides
  instead of lowering the ratio.
- **Each plan's weekly value comes from the engine's pool estimate.** The estimate
  already calibrates every account's full seven-day window in official-price dollars
  from that account's own requests. Accounts are grouped by plan and tier. The table
  shows the median of the measured accounts (sources `measured` and `recent`) with the
  smallest and largest. A `peer` capacity is left out because it is the median of
  other accounts, not a measurement. The pool read is the last one up to two minutes
  old, as on the capacity view.
- **The console divides by the ratio** to give an account's value in new-api dollars
  per week and per month, counting a month as 30/7 weeks. Plan prices are not stored:
  the table names the tier, and the owner knows what each one costs.

## Alternatives considered

- **Compute the ratio over the whole range.** The engine keeps request logs for its own
  retention period, so a long range would count new-api days with no engine cost.
- **Divide the weekly remainder by the unused share** to estimate capacity in the app.
  The engine already holds the calibrated capacity and its source, so the app would
  repeat its rounding and quota-budget rules.

## Consequences

- The funds view now waits on the engine for up to 8 s, as the activity view does. A
  failed read shows its error in the panel, and the rest of the view renders.
- An account with no measured week, such as one at its quota budget, does not count.
  A plan with no measured accounts has no row.
- The response only adds fields, so the released console keeps working before its own
  release.

## Verification

- `TestEnginePlanValues` covers the grouping, the median and range, and leaving out
  peer, zero and unmeasured capacities. `TestMatchClaudeCost` covers dropping a day the
  engine did not report. `TestFetchEnginePool` reads the capacity and its source.
  `TestSiteInsightsDatabaseMatrix` covers the Claude-only charge per day and in total.
- `finance-tab.test.tsx` covers the ratio sentence, a plan row's conversion, and the
  engine-error state.
