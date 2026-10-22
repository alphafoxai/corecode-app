# Agent Note: The model square is a CNY price list

Status: implemented

## Problem

The model square showed USD list prices on cards, behind a filter sidebar and
a toolbar. The discount against the official price was a badge and a dialog,
so a customer still had to work out what a model costs in yuan and how much
cheaper it is. Comparable relays lead with a CNY table: our price, the
official price struck through, and the share saved.

## Decision

`/pricing` renders `components/price-board.tsx` instead of the sidebar, toolbar
and card or table views:

- **A pricing-rules strip** with the exchange rate, the recharge price, and the
  "计费说明" dialog.
- **Group cards**, cheapest first, each with its ratio and discount. The chosen
  group's `usable_group` description sits under them.
- **A price table** of input, output, cache write and cache read, per million
  tokens:
  - group price = official USD × group ratio × `Price`;
  - official price = official USD × `USDExchangeRate`, struck through;
  - savings = 1 − (`Price` ÷ `USDExchangeRate` × group ratio), shown only when
    positive.
  A toggle shows official prices alone. Below `md` each model is a card.
- `lib/unit-prices.ts` reads the four base prices. A context-priced model is
  evaluated through `expressionTurnCost` at zero context, which is its first
  tier, and the row says longer contexts cost more.
- The Claude Code estimate and the details drawer stay.

## Alternatives considered

- **Delete the sidebar, toolbar, card grid, table and filter hook.** They are
  upstream new-api code. This fork syncs upstream by tag, and a deleted file
  that upstream later edits is a modify/delete conflict on every sync. They
  stay in the tree, unused by `/pricing`.
- **A third view mode next to card and table.** It keeps two layouts that
  answer the same question; with four models and one group the filters were
  noise.
- **A separate `/prices` page.** Two pages would describe the same prices.

## Consequences

- Per-request and task-priced models have no row. Production has none today;
  adding one needs a row type here.
- The Claude Code estimate still reports USD.

## Verification

- `bun run typecheck`: passes.
- `bunx vitest run src/features/pricing`: 17 files, 301 tests pass, including
  new `unit-prices` and `price-board` tests.
- oxlint and `oxfmt --check` on the changed files: clean.
- Checked in a browser at 1440 px and 390 px against production's
  `/api/status` and `/api/pricing` through the dev proxy, in both price modes.
