# Agent Note: Pay invite commission on what invitees pay for and consume

Status: implemented

## Problem

CoreCode wants customers and promotion channels to bring in new users, and to
pay them for it. new-api's own invitation reward does not fit:

- It credits the inviter a fixed amount when an invitee registers, so a
  throwaway account earns as much as a paying customer.
- It has no per-user rate, no channels, and no second level.
- The emailed sign-in link, the only sign-up path in production, never read the
  invite code, and an OAuth sign-up rewarded the inviter without storing
  `inviter_id`. In practice no relationship was ever recorded.

The rules the operators set:

- A customer whose paid top-ups reach ¥100 can apply for a 10% code.
  Superseded on 2026-10-26: every customer has the 10% default without
  paying or applying; see `2026-10-26-invitation-summary-and-topup-report.md`.
- An administrator can grant any rate up to 30% and mark a user as a
  promotion channel.
- An invitee of an invitee is recorded, but only a channel earns from it, at
  a fixed 5%. For a chain A (30% channel) → B (10%) → C:
  - C's consumption pays B 10% and A 5%.
  - B's consumption pays A 30%.
  - Users C invites earn nothing for B or A.
- Channels can be paid out in cash. Everyone else moves commission into
  their own wallet.

## Decision

- **`affiliate_setting`** holds `enabled` (default off), `self_serve_rate`
  (10), `self_serve_min_topup` (100), `max_rate` (30), `second_level_rate`
  (5) and `min_withdrawal` (100). Rates are whole percents; money is in the
  payment currency. `controller/option.go` rejects rates outside 0–100 and
  negative amounts. Operators set it under System settings → Billing →
  Invitation program.
- **An `affiliates` row grants invite rights.** It holds the rate, the
  channel mark, and the commission balance and total. A customer creates it
  in the wallet once gateway-paid top-ups reach the threshold; an
  administrator sets it from the user's row menu. Rate 0 removes invite rights
  and blocks re-applying. The balance is kept apart from `users.aff_quota`,
  which keeps upstream's fixed sign-up reward.
- **Only an affiliate's code binds while the program is on.** All three
  sign-up paths resolve the code through `model.InviterIdForAffCode`. The
  emailed link carries the code in its `auth_flows` payload, so it survives
  opening the mail on another device. `User.Insert` and `InsertWithTx` now
  store `inviter_id`. With the program off, any code binds as before.
- **Commission is paid on consumption, capped by what the invitee paid.** An
  `affiliate_referrals` row per invitee stores how much of its `used_quota`
  has been settled (`used_mark`) and how much has earned commission (`base`).
  `base` never exceeds the invitee's gateway payments converted to quota at
  list price. Over an invitee's life, discount, bonus and gifted quota
  therefore earn nothing. The commission is the same as consumption ×
  (paid ÷ credited), but it is earned earlier: the first consumption counts
  in full and the last part earns nothing. This needs nothing from the
  payment gateways beyond the `top_ups` rows they already write.
- **Paid means a successful `top_ups` row not paid from the wallet.** Plan
  purchases paid through a gateway count; wallet-funded purchases, redemption
  codes and manual adjustments do not. Money converts to quota at the
  `price` option, the rate top-ups are charged at.
- **Settlement runs hourly on the master node and is idempotent.** Each
  invitee settles in one transaction that locks its referral row and moves
  both marks with the credits, so repeated or concurrent runs pay once.
  Consumption keeps counting against the paid cap when the program is off or
  the inviter is ineligible (disabled, rate 0); it just earns nothing. That
  period is never paid later.
- **Invitees that predate counting start where they are.** An invitee bound
  while the program was off has no referral. The first settlement after the
  program is on starts one at the invitee's current consumption and payments.
  Nothing from before counts, including the unspent part of earlier
  payments.
- **`affiliate_commissions` records every credit** with its level, rate,
  base and amount. Affiliates see source names masked; administrators see
  them whole.
- **Channels withdraw through `affiliate_withdrawals`.** A request takes the
  quota out of the balance at once. An administrator marks it paid after
  paying offline, or rejects it, which returns the quota. Both are
  conditional on `pending`, so a request is processed once. Transfers,
  applications and withdrawals require the payment compliance confirmation,
  like upstream's reward transfer.
- **Routes** live under `/api/affiliate/self` (user) and
  `/api/affiliate/admin` (administrator). Personal access tokens are
  declared as `wallet:*`, `user:*` and `billing:*`. Administrator changes
  are audited as `user.manage` with actions `set_affiliate`,
  `pay_affiliate_withdrawal` and `reject_affiliate_withdrawal`.

## Alternatives considered

- **Commission on each top-up when it is paid.** Simplest, but unspent balance
  and later refunds would carry commission, and the operators asked for
  commission on consumption.
- **Commission on consumed quota alone.** Discount and bonus quota would earn
  commission. With the planned 15% top-up discount and a 30% channel, the
  effective price would fall to about 0.96× list, below the floor the
  pricing research set.
- **An exact paid ÷ credited ratio per request.** Needs the credited quota of
  every payment path, including upstream gateways CoreCode does not use. The
  cap reaches the same lifetime total with one sum over `top_ups`.
- **Store the commission in `users.aff_quota`.** It would mix the new
  commission with upstream's sign-up reward and reuse a transfer path that
  has no channel or withdrawal concept.

## Consequences

- The program is off after deploy; nothing changes until an operator turns it
  on and grants rates.
- Commission appears up to an hour after the consumption, plus the
  batch-update delay of `used_quota`.
- A customer can invite a second account of their own and collect the
  self-serve rate on it. The rate is capped at 10%, and only administrators
  grant more.
- A refund is handled by hand. Commission already credited is not clawed
  back automatically.
- Changing `price` reprices the paid cap of every invitee, because payments
  are converted when they are settled, not when they are made.

## Verification

- `TestAffiliateCommissionDatabaseMatrix` passes on SQLite 3.50.4, MySQL
  8.0.46 and PostgreSQL 17.11, three runs each under `-race`. It walks the
  A → B → C chain above and checks:
  - which codes bind;
  - the ¥100 application threshold, excluding wallet-funded and pending
    orders;
  - the 10% / 5% / 30% credits and the paid cap;
  - that users C invites pay only C;
  - that eight concurrent settlements pay once;
  - that the program-off and disabled-inviter periods earn nothing;
  - that a legacy invitee starts at its current state;
  - transfers, and channel-only withdrawals with reject and pay;
  - masking.
  It fails with the paid cap removed, and on MySQL with the row lock
  removed.
- `TestMagicLinkSignUpBindsTheInviterFromItsCode` registers through the
  emailed link with an affiliate's code and checks `inviter_id` and the
  referral. It fails with the code dropped.
- Migration, on the same three databases, with the binary run twice each
  time:
  - on an empty database, the four new tables have the same schema after
    the second start;
  - on a database first created by the `main` binary with an invitee row
    added, the new tables match the fresh schema, and the `users` and
    `top_ups` schemas and indexes and the row are unchanged.
  The two starts differ only in the order MySQL lists the indexes of a new
  table.
- `go test` passes for `model`, `controller`, `service`, `router`,
  `middleware`, `setting/...`, `i18n`, `common/...` and `constant`.
- End to end, against a local build on SQLite:
  - an option out of range and a rate over `max_rate` are rejected;
  - a code binds only once its owner is an affiliate;
  - the threshold blocks an application until a ¥100 payment;
  - a restart's settlement credits the chain at the server's price;
  - a non-channel cannot withdraw;
  - a rejected withdrawal returns its quota and cannot then be paid;
  - a customer gets 403 on the administrator routes.
  In the browser, checked: the sign-in page prefilled from `?aff=`, the
  affiliate and not-yet-eligible wallet cards, the records dialog, the
  administrator's invitation dialog, and the settings section.
- Frontend: `bun run typecheck` passes. `bun run test src/features/wallet
  src/features/auth src/features/users src/features/system-settings` passes
  367 tests. oxlint and oxfmt report nothing in the changed files.
