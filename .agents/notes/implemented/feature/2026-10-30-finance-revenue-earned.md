# Agent Note: Revenue earned on the finance tab

Status: implemented

## Problem

The finance tab's "每 $1 消耗对应收入" divided the money paid in a range by
everything consumed in it, so two ranges of the same business read very
differently. On 2026-10-30, against production, 24 hours read ¥0.82 and 7
days ¥0.38. Read-only queries found three causes:

- **Root's own requests were consumption.** The finance view read
  `quota_data` unfiltered. Root used $3,191 of the 7 days' $9,508 (34%) and
  $508 of the last 24 hours' $1,895.
- **Given credit was consumption.** Administrators had added $11,606 to
  customer wallets (audit log), against $2,714 of paid top-up credit. One team
  account was given $4,100, paid ¥20, and used $2,032 in the 7 days and almost
  nothing in the last 24 hours. Inviter-given plans used $28 in 7 days.
- **Money is paid before it is used.** A plan's price lands on the day it is
  bought, and a top-up on the day it is paid; the use comes later. The 7 days
  took ¥3,688 while earning about ¥2,200 of it.

## Decision

- **Consumption counts customers only.** The finance view reads the hourly
  rollups instead of `quota_data`. `InsightUserHour` gains `Quota`,
  `WalletQuota` and `GiftQuota`; the hour's summary gains `RootQuota`. A
  request is split by `billing_source` and `billing_overflow_quota` from its
  log; plan use counts as given when the plan's source is `admin` or
  `affiliate_gift`. `insightHourVersion` goes to 2 so stored hours are
  rebuilt from the logs, which production keeps from 2026-10-17 on.
- **Revenue earned is the headline ratio.** A bought plan earns its price
  evenly over the time it runs. A wallet earns as it is spent, each unit at the
  wallet's average price: what the customer paid for top-ups, divided by every
  unit credited (top-up with bonus, manual adjustments, redemption codes)
  before the range ends. A wallet that was only ever given credit has a zero
  price, so the team account above earns nothing without being listed
  anywhere. The cash ratio stays as the card's hint.
- **Balances owed show what was paid for them** (`liability_paid_value`):
  $6,335 of the $8,978 owed sits in wallets that never paid.
- **Debt moves into the balance card** to keep the five-card row; the
  negative-balance table and the overview's signal still list it.

## Alternatives considered

- **Exclude root and leave the rest.** It fixes a third of the gap, but given
  credit to customers who also pay (5 payers received $5,006) would still
  count as paid use.
- **Count a wallet as paid once its owner has paid.** Simple, but those 5
  payers' wallets were 35% paid; it would overstate paid use by most of that.
- **Trace each spent unit to the credit it came from (FIFO lots).** Exact, but
  the wallet keeps one balance, so it means a ledger the billing path does not
  write. The average price needs only tables that exist.
- **Earn a plan by its use, with the unused part at expiry.** All plans today
  are one-off 7-day packs, so the two differ only in timing; the even spread
  needs no log reading and works for plans that reset.

## Consequences

- After release, every stored hour is recomputed: the rollup task stores 200
  hours per 10 minutes, and a view computes a missing hour on demand, so the
  first finance or capacity open may be slower for a few ticks.
- A wallet's price is computed at the end of the viewed range, so a later
  top-up changes the price a past range is earned at.
- Credit outside top-ups, adjustments and redemption codes (sign-up and
  invitation rewards, feedback rewards) is not counted, which leaves those
  wallets' price slightly high. An adjustment recorded for an offline payment
  counts as a gift.
- Orders do not name the plan they created; the k-th successful order of a
  user for a plan is matched with the k-th plan of that user, plan and source.
- When a wallet-first request overflows into a plan, the log does not name the
  plan, so that part counts as bought.

## Verification

- `TestFinanceRecognizesRevenueAsItIsEarned` covers root, a given plan, a
  bought plan, a plan bought with balance, wallet overflow, a log without
  `billing_source`, and the paid value of balances. Breaking the gift lookup
  failed it.
- `go test ./model/ ./service/ ./controller/` passed on SQLite 3.50.4,
  MySQL 8.0.46 and PostgreSQL 18.6.
- Upgrading `insight_user_hours` from the origin/main schema with a stored row
  kept the row, added the three columns as `NOT NULL DEFAULT 0`, and kept the
  primary key on all three databases; a second migration changed nothing.
- `finance-tab.test.tsx` covers the cards and the daily chart's readout;
  `bun run typecheck` (after failing on a planted error), oxlint on the
  feature, and `bun run i18n:sync` passed.
