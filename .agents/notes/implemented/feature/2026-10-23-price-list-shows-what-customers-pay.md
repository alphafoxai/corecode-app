# Agent Note: The price list shows what customers pay, in CNY

Status: implemented

## Problem

`2026-10-22-model-square-price-board.md` gave the price list a header with a
subtitle and a toggle between group and official prices, and showed every
group as a radio card with its ratio. Each row already carries the official
price struck through, so the official-only view repeated it; with a single
group, the radio card offered a choice that did not exist. The rules strip
explained the exchange rate rather than what the table means, and the Claude
Code estimate below the table still reported USD.

## Decision

- The price list header — its title, subtitle, and the group or official
  toggle — is gone. The section keeps "Price list" as its accessible name, and
  the savings column always shows.
- With one group, it shows as a single, larger card, centered, with its name
  and discount, and without the ratio line. Two or more groups keep the radio
  cards.
- The group description is labelled "说明" ("Usage note"). The admin group
  editor keeps "Group description", so the label has its own key.
- The rules strip says the table shows what the customer actually pays and
  that usage is charged in USD at the same discount, then the recharge price.
- Models are listed from the cheapest input price to the most expensive.
- `ClaudeCodeEstimator` takes `priceRate` and reports CNY: its group-ratio USD
  cost × `Price`, the same formula as the table's group price. The pricing page
  and the model details drawer both pass it.
- The page is named "模型定价" ("Model Pricing") instead of "模型广场": the top
  nav, the page heading and the admin header-navigation setting use the
  existing `Model Pricing` key. The Chinese admin strings about showing or
  hiding a model there say "模型定价页". The English admin strings still say
  "model square"; they are upstream keys.
- The strings the removed header, toggle and exchange-rate line used had no
  other user and are removed from the locale files.

## Alternatives considered

- **List prices in USD.** Tried in this change and reverted: CoreCode prices
  its groups in CNY, and the recharge is in CNY.
- **Keep the official-price toggle.** Every row already shows the official
  price struck through.
- **Format the estimate with `formatBillingCurrencyFromUSD`.** That follows
  the site's quota display setting, which shows USD credit; the estimate has
  to match the table's CNY.

## Consequences

- The console FAQ that points customers to the page lives in
  `corecode-infra`'s `branding/console.json` and is renamed there; it reaches
  the site when `brand-newapi.sh` next runs on the relay.
- Adding a second group brings back the radio cards and the ratio line with no
  code change.
- The estimate uses the cheapest group the model is in. With several groups it
  can differ from the group picked above the table.

## Verification

- `bun run typecheck`: passes.
- `bunx vitest run`: 218 files, 2513 tests pass.
- `bunx vitest run src/features/pricing`: 17 files, 303 tests pass, including
  the single-group card, the multi-group picker, the cheapest-first order, and
  the estimate in CNY.
- `bun run lint` reports nothing in the changed files.
- Checked in a browser on `/pricing` against production data: CNY table,
  single-group card, "说明" label, new rules text, and the estimate in CNY.
