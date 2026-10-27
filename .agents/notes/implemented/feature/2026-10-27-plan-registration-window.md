# Agent Note: Limit a subscription plan to users who registered in a window

Status: implemented

## Problem

The ¥9.9 trial plan ($20 of quota, 7 days, one per user) is the newcomer
offer and also the plan promotion channels gift their invitees
(`AffiliateSetting.GiftPlanId`). The operator wants users who register from
now on to be offered a ¥29.9 plan ($50, 7 days, one per user) instead, while
the ¥9.9 plan stays giftable and stays on sale to users who registered
before the change. A plan had no way to tell users apart by when they
registered.

## Decision

- **A plan carries a registration window**: `registered_after` and
  `registered_before`, Unix seconds, 0 for no bound. A user may buy the plan
  when `users.created_at` falls at or after the first and before the second.
  The ¥9.9 plan gets `registered_before` = the cutoff, the ¥29.9 plan
  `registered_after` = the same cutoff, so every user sees exactly one of
  the two.
- **Only purchases check the window.** `checkSubscriptionLimitTx` applies it
  to orders and balance payments; an administrator's binding and an
  inviter's gift skip it, so channels keep gifting the ¥9.9 plan to new
  invitees. A refused purchase returns "This plan is not available to your
  account".
- **`GET /api/subscription/plans` hides a plan outside the caller's window**
  unless the caller already holds a subscription of it. A gifted invitee
  therefore still sees the ¥9.9 plan, marked as gifted, and the wallet card
  keeps the subscription's title, which it looks up in that list.
- The plan drawer has two date-time pickers for the window. Saving a window
  whose start is not before its end fails with "Invalid registration window".
- SQLite builds `subscription_plans` by hand
  (`ensureSubscriptionPlanTableSQLite`), so both columns are added there as
  well as through `AutoMigrate`.

## Alternatives considered

- **Disable the ¥9.9 plan and gift it anyway.** `AffiliateGiftPlan` refuses a
  disabled plan, and users who registered earlier would lose the offer.
- **An option listing newcomer plan ids and a cutoff.** It keeps eligibility
  away from the plan it governs and allows one cutoff for all plans; the
  plan drawer is where an operator already sets the purchase limit.
- **Compare with the user id instead of the registration time.** Ids are
  not readable as dates in the console, and a cutoff by time is what the
  operator asked for.

## Consequences

- Users whose `created_at` is 0 (rows from before the column existed) count
  as registered before any cutoff.
- The update handler writes both columns on every save. A console from
  before this change sends neither, so saving a plan from it clears the
  window; the console release follows the server's within the same deploy.
- Production needs two edits after the release: set the ¥9.9 plan's
  "Registered before" to the cutoff, and create the ¥29.9 plan with
  "Registered on or after" at the same instant.

## Verification

- `TestAffiliateGiftDatabaseMatrix` covers the window on SQLite 3.50.4,
  MySQL 5.7.44 and PostgreSQL 9.6.24: a later registrant cannot buy the
  ¥9.9-style plan but can be gifted it, the newcomer plan refuses an earlier
  registrant by balance payment, and an administrator can bind it to anyone.
- Migration on all three databases, starting the binary twice: an empty
  database keeps the same schema on the second start, and a database created
  by the `main` binary with a plan row upgrades to the fresh schema (column
  and index order aside) with the row unchanged and both columns 0.
- End to end on a local SQLite build: a user registered before the cutoff
  is listed the trial and a monthly plan, one after it the newcomer and the
  monthly plan; each is refused the other's plan; the newcomer buys once and
  is then refused by the purchase limit; after a gift the newcomer is also
  listed the trial; the admin API rejects an inverted window and stores a
  valid one.
