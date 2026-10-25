# Agent Note: Credit a tiered bonus on online top-ups

Status: implemented

## Problem

CoreCode's retail pricing moved to 1.75× with top-up incentives that bring a
customer who pays in bulk back toward the old 1.5×. The pricing research
compared a discount on the payment (plan B, configurable today through
`payment_setting.amount_discount`) with extra quota on top of it (plan C).
The operators chose the bonus form: "top up ¥1000, get ¥1100" reads better
than "10% off".

new-api has no bonus. Its discount also matches the amount exactly, so a
customer who types ¥1200 gets nothing from a ¥1000 tier.

## Decision

- **`payment_setting.amount_bonus`** maps a minimum top-up amount to a bonus
  fraction, for example `{"300":0.05,"1000":0.1,"2000":0.15}`. Tiers are
  ranges: a top-up gets the rate of the highest tier at or below its amount.
  `controller/option.go` rejects non-integer or non-positive amounts and
  rates outside (0, 1]. It is empty by default, so deploying changes no
  price. "No tiers" is `{}`. An empty value is rejected because the option
  loader skips a value it cannot parse, which would leave the previous tiers
  running until a restart.
- **The order fixes the bonus.** `RequestEpay` computes the bonus from the
  order's quota and stores it in the new `top_ups.bonus_quota` column. A
  tier changed while the customer pays does not change what they were shown.
  The pre-payment capacity check includes the bonus.
- **Completion credits it.** `RechargeEpay` and an administrator's
  `ManualCompleteTopUp` credit the paid quota plus `bonus_quota` in the same
  transaction and conditional update as before, so a repeated callback still
  credits once. The usage log names the bonus apart from the total.
- **Bonus is recorded apart from what was paid.** `money` and `amount` keep
  what the payment bought, and `bonus_quota` what was given. A refund is
  handled by hand and returns only what was paid.
- **Only epay top-ups earn it.** That is the only gateway CoreCode runs.
  Stripe, Creem and Waffo compute their quota on their own paths and are
  unchanged; the console shows the bonus only for epay methods.
- **It stacks with `amount_discount`.** The two are independent. An operator
  who configures both for the same amount should price the combination.
- **`/api/user/topup/info` returns `bonus`** beside `discount`, and top-up
  records carry `bonus_quota`, so the console shows the bonus on the preset
  buttons, for a typed amount, in the payment confirmation and in the
  history.

## Alternatives considered

- **Only use `amount_discount` (plan B).** No code, but it matches amounts
  exactly, and the operators preferred the bonus wording.
- **Compute the bonus at completion instead of at order time.** Simpler, but
  a tier changed while the customer pays would credit something other than
  what the confirmation showed.
- **Credit the bonus as a separate gift (log or redemption) after the
  top-up.** Two writes that can drift apart; the order would not record what
  it gave.

## Consequences

- The invite commission (`2026-10-25-affiliate-commission.md`) counts only
  `money`, so bonus quota never earns commission.
- A customer who pays through a non-epay gateway sees and gets no bonus.
- Raising the tiers raises every later order's credit without a deploy. The
  pricing research proposed a floor of 20% of the official price; stacking
  a bonus, a discount and invite commission can go below it.

## Verification

- `TestEpayTopUpBonusDatabaseMatrix` passes on SQLite 3.50.4, MySQL 8.0.46 and
  PostgreSQL 17.11, three runs each under `-race`. It checks that:
  - an order fixed at a 10% bonus credits 1100 once, and a repeated
    callback credits nothing;
  - the order keeps `bonus_quota`;
  - an administrator's completion credits the bonus too;
  - an order without a bonus credits exactly what was paid;
  - the log names the bonus only when there is one.
  The test fails when completion drops the bonus.
- `TestTopUpBonusTiers` loads the tiers from the option row and checks the
  range boundaries (299 → 0, 300 → 5%, 1200 → 10%, above the top tier →
  15%) and the option validation.
- Migration on the same three databases, with the binary run twice each time:
  - on an empty database, `top_ups` is identical after the second start;
  - on a database first created by the `main` binary with an order added,
    the upgraded `top_ups` matches the fresh one except the position of the
    appended `bonus_quota` column (`bigint NOT NULL DEFAULT 0`);
  - the existing order reads `bonus_quota` 0, and `users` is unchanged;
  - neither second start issued an `ALTER`.
- End to end, against a local build on SQLite, a fake epay merchant and a
  notify signed with its key:
  - an invalid tier is rejected and `/api/user/topup/info` returns the
    tiers;
  - a ¥1000 order stored a 100 bonus and kept it after the tier was raised
    to 20%;
  - the signed notify credited 1100, and a repeated notify credited
    nothing;
  - a ¥1200 order took the 1000 tier and a ¥299 order none;
  - the usage log read "amount added: ＄1100 including a bonus of ＄100".
- In a browser against that build, checked:
  - the preset buttons with their bonus labels;
  - the typed-amount hint for the next tier;
  - the payment confirmation, showing +$100 and $1,100 credited for ¥1000
    by Alipay;
  - the bonus in the order history;
  - the tier editor in the payment settings.
  The bonus line overflowed the preset buttons until they were allowed to
  grow (`h-auto`).
- Frontend: `bun run typecheck` passes, and `bun run test src/features/wallet
  src/features/system-settings` passes 247 tests. The new tests cover the
  range tier selection, epay versus Stripe/Creem/Waffo display, and the
  editor's saved `{"300":0.05}`. oxlint and oxfmt report nothing in the
  changed files.
