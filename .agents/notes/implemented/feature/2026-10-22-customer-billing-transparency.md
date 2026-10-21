# Agent Note: Customers can check charges, price a workload, and see credits arrive

Status: implemented

## Problem

apiranking.com compares relays on three things:

- whether the charge matches the posted price;
- how much of the input hits the prompt cache;
- how money gets in.

new-api's console made all three hard to answer:

- **Usage log.** The details dialog listed unit prices next to a total, but not
  the arithmetic between them.
- **Model square.** Each model showed only one cache price, the read price,
  though Claude Code pays the write price whenever a session grows. Prices were
  per million tokens, not per day of work.
- **Wallet.** With online payment off — production today, and USDC top-up in
  `corecode-infra/docs/architecture.md` is still tentative — the wallet showed
  two grey warnings and nothing else to do.

## Decision

### Cost check on each request

`web/src/features/usage-logs/lib/cost-check.ts` rebuilds a per-token charge from
the logged ratios, using the arithmetic of `calculateTextQuotaSummary` in
`service/text_quota.go`:

- Anthropic input excludes the cache.
- OpenAI-shaped input has cache reads and writes taken out, clamped at zero.
- Split 5m/1h writes use their own ratios.
- The sum is rounded half away from zero, with a floor of one unit.

The logged `group_ratio` is already the effective ratio, because a user-group
override replaces it in `HandleGroupRatio`.

The details dialog shows each line (tokens × unit price after the group ratio)
and its subtotal, then the expected and the charged amounts. The cost column
marks matching rows. A gap larger than one unit is labelled as items the
breakdown does not list, without treating it as an error: other ratios and tool
surcharges are not itemised in the log.

The token column shows each request's cache hit rate, and the overview reads it
from the same function.

### Cache prices and a workload estimate on the model square

Cards and the table list both cache read and cache write.
`features/pricing/lib/claude-code-estimate.ts` prices a Claude Code workload:

- context per turn, cache hit rate, output per turn and turns per day are inputs;
- cached context is billed as reads and the rest as cache writes, because Claude
  Code writes each new turn to the cache;
- the result is shown against the same workload billed as plain input.

The estimate appears below the model list and on each token-priced model's
detail page.

### A wallet that says how credits get in

The balance leads, with its runway and the last seven days of spend.
`useDailySpend` and `useBalanceStatus` are shared with the overview so the two
pages word it the same way.

The add-funds card describes what is open:

- **Online payment open:** the payment form, as before.
- **Only redemption codes open:** the redeem field.
- **Neither open:** says credits are added by the operator, with a contact
  button when `top_up_link` is set.

A credit history lists the latest type-1 logs. That type covers redemptions,
payments and operator top-ups, because `controller/user_quota.go` records
admin adjustments as top-ups.

## Alternatives considered

- **Show "official price" against "charged" on every row.** Production's only
  group is 1.5×, so that comparison would show a markup rather than a check. The
  cost check compares against CoreCode's own listed price, which is what
  apiranking measures.
- **A cache hit rate trend across all requests.** Cache tokens live in the log's
  `other` JSON, not in a column. Aggregating them in SQL on SQLite, MySQL and
  PostgreSQL needs a schema change and the three-database verification. The rate
  per request and over the last 100 requests needs no backend change.
- **Turn on a payment method.** Payment and compliance are operator decisions;
  this change only describes the state the operator chose.

## Consequences

- A backend change to the per-token formula must update `cost-check.ts`. Three
  fixtures from `service/text_quota_test.go` are repeated in its tests, so the
  frontend suite fails until it does.
- The estimate assumes the miss share is written to the cache. A client that
  sends uncached input would see a lower real cost, never a higher one.
- Setting `top_up_link` makes the wallet's contact button appear.

## Verification

- `bun run typecheck`: passes.
- Tests added: `cost-check`, `cost-check-section`, `cost-display`,
  `claude-code-estimate`, `claude-code-estimator`, `model-cards`, `add-funds`,
  `wallet-balance`. Each runs green in its feature's suite.
- `bun run lint`: no findings in changed files.
- Checked in a browser against a local instance with production's prices
  (opus 2 / sonnet 1 / haiku 0.5, group 1.5×):
  - usage logs and the cost-check dialog, where the line arithmetic equals the
    logged charge;
  - the model square at 1440 px and 390 px;
  - the wallet in light and dark at 1440 px and 390 px.
