# Agent Note: Inviter change, full invitee details, and the gift plan

Status: implemented

## Problem

- A user who signed up without an invite code stayed unbound. An
  administrator could see a user's inviter but not change it.
- The operators want inviters to see who their invitees are. The invitation
  page showed masked usernames and no email.
- The operators want promotion channels to give their invitees the
  新人体验包 plan once, free, and a user who received it must not be able to
  buy it.

## Decision

- **`PUT /api/affiliate/admin/users/:id/inviter`** sets `users.inviter_id`.
  `0` clears it. `SetUserInviter` refuses the user themselves, a user that
  does not exist, and anyone the user invited directly or through others,
  because a loop would pay second-level commission around it. The admin
  dialog finds the new inviter through `GET /api/user/search` by username or
  email. The change is audited as `set_inviter` with the old and new ids.
- **Commission follows the new inviter only from the change on.** A referral
  that is already counting keeps its marks. A user without one gets one at
  the next settlement, which starts at that moment's consumption and
  payments, so money paid before the change earns no one commission. That is
  the existing rule for invitees found after the fact. Commission already
  credited stays with whoever earned it.
- **The invitee list shows the full username and the email.** This reverses
  the masking that `2026-10-26-invitation-summary-and-topup-report.md`
  chose. Commission records stay masked, because a channel's records also
  name second-level users who are not its own invitees.
- **`affiliate_setting.gift_plan_id`** names the plan inviters can gift. `0`,
  the default, turns gifting off. A plan that is disabled or deleted turns it
  off too. The option is set in the invitation program settings.
- Superseded on 2026-10-28: invitees receive their channel tier's plan at
  sign-up and the manual gift is retired; see
  `2026-10-28-channel-tiers-and-signup-gift.md`.
- **Only a promotion channel can gift:** an `affiliates` row with
  `channel = true` and `rate > 0`. Rate 0 removes invite rights, so a revoked
  channel loses gifting too. `AffiliateGiftPlan(userId)` answers nil for
  anyone else, so the invitation page shows ordinary inviters no gift column.
- **`POST /api/affiliate/self/invitees/:id/gift`** creates the subscription
  with source `affiliate_gift`. The caller must be a channel and the
  invitee's direct inviter, and the invitee must hold no subscription to
  that plan from any source. The invitee's row is locked first, as purchases lock it. The
  platform bears the cost; the inviter pays nothing. Both users get a log
  entry.
- **A user with an `affiliate_gift` subscription to a plan cannot buy that
  plan.** `checkSubscriptionLimitTx` enforces this beside `MaxPurchasePerUser`
  for every source except `admin`. The four payment controllers call the
  same check through `CheckSubscriptionPurchase` before they create an order,
  so a payment is not taken for a plan that cannot be delivered. The wallet
  shows the plan as received rather than offering it.
- **`CreateUserSubscriptionFromPlanTx` reads database time through its
  transaction** (`getDBTimestampTx`). Reading it through `DB` takes a second
  connection while the transaction holds a row lock. With one connection,
  the SQLite test setup, that deadlocks.

## Alternatives considered

- **Charge the gift to the inviter's wallet or commission balance.** It
  would stop an inviter from farming free plans through accounts they invite
  themselves, but the operators chose a free gift. Each invitee can still
  receive it only once, and only channels, which an administrator grants,
  can gift.
- **Let every inviter gift.** The first release did, with gifting still off
  because no plan was configured. The operators then limited it to channels
  before any plan was set.
- **Find the plan by its title.** Renaming the plan would silently turn
  gifting off.
- **Rely on `MaxPurchasePerUser = 1`.** It blocks a purchase after a gift only
  while the plan is configured that way, and it would also block an
  administrator from binding the plan again.
- **Pay the new inviter commission on the invitee's earlier consumption.**
  That would pay for spending the inviter did not bring in, and could pay
  twice where a previous inviter was already credited.

## Consequences

- A gift made between a user creating a payment order and the payment
  completing makes the completion fail, as the purchase limit already does.
  The window is the time a customer spends on the payment page.
- The `subscription.source` column now holds `affiliate_gift`. The admin
  subscription dialog shows it as stored.

## Verification

- `TestAffiliateGiftDatabaseMatrix` covers gifting off, an ordinary
  inviter, a channel at rate 0, a non-invitee, an
  invitee's invitee, a successful gift, a second gift, buying after a gift
  (pre-check and wallet purchase), an administrator binding after a gift, an
  invitee who bought the plan, the list's `gifted`/`owned` states, and a
  disabled plan.
- `TestSetUserInviterDatabaseMatrix` covers self, a missing user, direct and
  indirect loops, binding, commission only after the change, moving to
  another inviter, and clearing.
- Both pass, with the existing affiliate tests, on SQLite 3.50.4, MySQL
  8.0.46 and PostgreSQL 16.15. The change adds no table or column.
- The console tests cover gifting with a confirmation, the gifted and owned
  states, and finding and removing an inviter in the admin dialog.
