# Agent Note: The model square explains its prices and drops the endpoint label

Status: implemented

## Problem

Model cards listed each model's endpoint types ("anthropic, openai"). Customers
reach every model through Claude Code or `/v1`, so the label told them nothing
they could act on. The page also gave no way to see how a card price relates
to the provider's official price.

## Decision

- **Endpoints leave the card and the detail page's model cell.** The sidebar
  endpoint filter and the API examples in the detail page stay, because they
  are where a developer chooses a protocol.
- **A "How billing works" dialog in the toolbar** shows the formula and works
  it through a chosen model and group:
  - exchange-rate factor = `Price` ÷ `USDExchangeRate`, both from `/api/status`;
  - group ratio, from `/api/pricing`;
  - combined factor = the two multiplied.
  `features/pricing/lib/billing-discount.ts` holds the arithmetic. The result
  reads as "X折" (Chinese) or a percentage below 1, "官方价 ×N" above 1, and
  parity when it rounds to 1.
- **Each card and the detail header carry a discount badge** ("≈2.2折"),
  computed by the same function at the group the card prices use. The dialog
  alone was not enough: customers open a model's details, see USD list prices
  and no discount. The badge renders only for a discount, never a markup.
- **Every number is live configuration.** When this shipped, production had `Price` =
  `USDExchangeRate` = 7.3 and one 1.5× group, so the dialog showed 1.5× the
  official price; the operator then set `Price` to 1. Lowering `Price` in
  the admin panel changes the dialog with
  no code change.
- **`USDExchangeRate` stays a hand-edited option.** It feeds only displayed
  figures; what a customer pays is set by `Price`. A drift of a percent or two
  does not move a discount shown to one decimal, so a daily FX sync would add
  an external dependency and a value that changes every day, for no visible
  gain.

## Alternatives considered

- **Hard-code a Packy-style "¥1 = $1" example.** It would describe a price the
  site does not charge.
- **Fetch the exchange rate on a schedule.** Rejected above; revisit if `Price`
  is ever derived from the rate automatically.

## Verification

- `bun run typecheck`: passes.
- `bunx vitest run src/features/pricing`: 15 files, 287 tests pass, including
  new `billing-discount` and `billing-explainer` tests.
- oxlint and `oxfmt --check` on the changed files: no findings.
- Checked in a browser at 1440 px against production's `/api/status` and
  `/api/pricing` through the dev proxy.
