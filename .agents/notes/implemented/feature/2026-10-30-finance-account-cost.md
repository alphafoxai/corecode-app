# Agent Note: Split the funds view by vendor and set Claude's account cost beside its usage

Status: implemented

## Problem

The owner wants one place on the funds view that answers four things for the chosen
range: what new-api charged for Claude, what gpt-load spent on the same requests at
official prices, the ratio between them, and what the pool's accounts cost. An account
costs a monthly price by plan (Pro $20, Max 5x $100, Team Standard $25, Team Tier 1
$125), and a range costs that month spread over 30 days, so 24 hours is a thirtieth.

The view had the charge, the official cost and their multiple, spread over a chart and
a small totals panel, but no account cost. The finance response listed only plans with
a measured weekly capacity, so it could not count every account either.

## Decision

- **The finance response adds `plan_accounts`**: every pool account counted by plan
  and tier, whatever its status, with how many are eligible now. An account costs its
  price while it is listed, so a suspended or budget-limited account still counts.
- **It adds `start_time`, `end_time` and `matched_since`.** `matched_since` is where the
  engine's reported days begin within the range. gpt-load keeps request logs for its own
  retention, so on a 30-day range it may report a week. Both ratios against cost set the
  charge and the official cost (already limited to reported days) against the cost of the
  same span, and the panel says how many days that is.
- **Prices live in the console** (`ACCOUNT_PRICES` in `site-insights/lib.ts`), keyed
  by the exact plan and tier the engine reports. The pool also holds Gemini (`Pro` with
  no tier), Codex (`Pro 20x`) and Grok accounts. A loose match on `Pro` priced the three
  Gemini accounts as Claude Pro, which the production check caught, so a plan without an
  exact entry is listed, greyed, and not counted.
- **The funds view leads with one Claude panel**: three amounts (new-api charge,
  official cost, account cost in the range) and three ratios (new-api ÷ official,
  official ÷ account cost, new-api ÷ account cost). A colored dot ties each amount to
  its ratios and to its chart series. The daily chart keeps the two charges as bars. A
  day's account cost, about $16 beside bars of $1,500, would not read as a bar, so the
  tooltip lists it with that day's official ÷ cost. Below come the account cost table
  and the per-account value table, each full width. The value table gains a value ÷ price
  column.
- **The funds view splits new-api's charge by vendor, a tab each**: Claude, Codex,
  Grok, Gemini, and Other only when an unrecognised model was charged for. The finance
  response adds `vendor_usd` to each day and `vendor_models` (charge and requests per
  model) to the range. A model is its vendor's by name prefix (`claude-`; `gpt-` and
  `codex-`; `grok-`; `gemini-`): the site's vendor metadata leaves `claude-haiku-5-5`
  and `codex-auto-review` without a vendor. Only Claude's tab counts account cost. The
  owner does not count the other vendors' accounts yet, so their tabs show new-api's
  charge, requests, charge per request, share, the daily charge and the models.
- **Claude's account table lists only accounts with a rate-limit tier.** The engine
  fills the tier from Claude's seat or rate-limit tier, so Codex, Gemini and Grok
  accounts report none. A line under the table counts the accounts left out.

## Alternatives considered

- **Store prices as an option row.** Four fixed prices that only this view reads do
  not justify a setting and its editor; a console release changes them without a
  restart.
- **Keep plans without a measured capacity in `plans`.** That would change what the
  value table means; a separate count keeps both readings clear.
- **Classify by new-api's vendor metadata.** It is set by hand per model and misses
  two models sold now.
- **Draw the daily account cost as a third bar.** Tried against production data: the
  bar was a hairline.

## Consequences

- The account count is the pool now, not as it was over the range; the help text says so.
- Until the server is released, the console gets no `plan_accounts` and shows no cost
  ("No accounts in the pool"). The response only adds fields.
- A new Claude plan needs a price entry before it counts.

## Verification

- `TestEnginePlanCounts` and `TestMatchedSince` cover the counting and the span.
  `TestModelVendor` covers the prefixes; `TestSiteInsightsDatabaseMatrix` covers the
  day's charge by vendor and the models, root included.
- `finance-tab.test.tsx` covers the 24-hour cost, the plan rows and their order, the
  unpriced Gemini Pro and Max 20x, the ratios over a partly reported range, the daily
  readout, and the state before the server's release.
- Checked against production data through a read-only proxy that computed the new
  fields from the live pool: 9 Claude accounts at $490 a month, $114.33 for 7 days,
  $16.33 for 24 hours. The Claude and Codex charts answered hover at 40 of 40
  positions. Over 7 days the vendor tabs read Claude $10,049, Codex $405, Grok $14.6
  and Gemini $0.03. Leaving tierless accounts out of Claude's table is covered by
  tests only.
- `finance-tab.test.tsx` also covers the tab totals, a vendor tab's figures, chart
  and model rows, and the Other tab appearing only when charged for.

## Addendum: new-api's charge is in yuan

new-api prices its quota in dollars, but customers pay ¥1 for each quota dollar (the
`Price` option is 1). What new-api charged is therefore yuan, while the engine's
official cost and the account prices are dollars, so the first release compared yuan
with dollars: it showed a 1.96× multiple where the dollars give 0.29×.

- The finance response adds `usd_exchange_rate`, the site's `USDExchangeRate` (6.8 at
  release). The console divides every new-api charge on the vendor tabs by it and shows
  `$x (¥y)`, the yuan being what new-api counted. Every ratio uses the dollars.
- Until the server sends the rate, the console uses the one `/api/status` already
  gives, so a console released first does not compare yuan with dollars.
- A charge per request below a dollar shows four places; two rounded most to $0.00.
- The cards above the vendor tabs (customer consumption at list price, earned per $1
  consumed, balances owed) still read new-api's quota dollars as dollars. They are
  unchanged here.

`finance-tab.test.tsx` covers the converted charge, the three ratios and the daily
readout at 6.8, a vendor tab's charge and charge per request, and the fallback to the
status's rate. Checked against production through a read-only GET proxy with the
fallback rate: Claude $1,487.75 (¥10,116.70) over 7 days, multiple 0.29×, new-api ÷
account cost 13.01×; the Claude chart answered hover at 40 of 40 positions.

## Addendum: two ledgers at the head of the funds view

The cards above the vendor tabs read new-api's quota dollars as dollars and left root
out, so consumption did not match the vendor tabs and "earned per $1 consumed" divided
yuan by yuan under a dollar label. The owner set the logic: root is internal use and
counts; new-api's side is read in yuan, for what customers topped up, used and are
owed; its dollars are for comparing with gpt-load.

- **Cash** (yuan): revenue and revenue earned, unchanged.
- **new-api credit** (yuan first, `≈ $` beside it at `usd_exchange_rate`):
  consumption with root's internal use, split into paid, gifted and root, which nobody
  pays for; earned per ¥1 consumed, root included, with paid use and cash basis; and
  balances owed. Root's balance stays out of the balances: internal credit is not owed.
- The vendor tabs keep dollars first and now state the rate they convert at.
- Every other new-api amount on the view (credit issued, balances, adjustments, the
  daily readout, the overview's consumption and debt) reads in yuan. A debt reads -¥3.93.
- The server adds `root_consumption_usd` to each day, so the daily readout includes it.
- The vendor tab list scrolls on a narrow screen instead of widening the page.

`page-transition.tsx` now wraps the route key in `String`. `bun check` infers TanStack
Router's `routeId` there as `{}` depending on unrelated files: this change's tests
alone flipped it, after 3c9728650 had annotated the return type for the same error.

`finance-tab.test.tsx` covers the cash figures, consumption in yuan and dollars with
its three parts, earned per ¥1 with root, the balances in yuan, and the daily readout.
Checked against production through a read-only GET proxy: over 7 days consumption
¥10,578.26 (≈ $1,555.63), of which root ¥3,707; earned per ¥1 ¥0.2508; balances owed
¥10,364.85. Every label's definition opened on hover; the revenue sparkline answered at
20 of 20 positions; nothing was wider than a 390 px screen.
