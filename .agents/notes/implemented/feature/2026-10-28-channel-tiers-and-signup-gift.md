# Agent Note: Channel tiers and a gift plan given at sign-up

Status: implemented

## Problem

The operators split promotion channels into two kinds:

- **Retail channels**: KOLs and ranking sites such as apiranking and Magpie.
  - Up to 30% first-level commission, no second level.
  - Cash withdrawals.
  - A $3 trial for every user they bring in.
- **Distributor channels**: business resellers.
  - Commission with the 5% second level.
  - Cash withdrawals.
  - The $20 trial plan for every user they bring in.

The one `affiliates.channel` mark gave second-level commission, cash
withdrawals and gifting together, so a 30% channel without a second level
could not withdraw. Gifting was a button the channel clicked per invitee, and
the operators want the trial given automatically, bound to the code the user
signed up with. Ordinary inviters' invitees get nothing, and users who
signed up before the change are not gifted afterwards.

## Decision

- **`affiliates.tier`** is `""`, `retail` or `distributor`.
  - Both tiers can withdraw. `channel` stays, kept equal to `tier != ""`,
    because the withdrawal check and the consoles in production read it.
  - Only `distributor` earns second-level commission (`affiliateCreditsFor`).
  - At startup, `MigrateAffiliateTiers` turns every `channel = true` row
    without a tier into `distributor`, which is what a channel was. It is
    idempotent, so two servers starting during a blue/green release are safe.
- **`PUT /api/affiliate/admin/users/:id` takes `tier`.** A console from
  before tiers sends only `channel`: `true` keeps the user's tier or makes
  them a distributor, `false` clears it. The audit entry records the tier.
- **One gift plan per tier.** `affiliate_setting.gift_plan_id` keeps its
  name and becomes the distributor's plan. `retail_gift_plan_id` is new. `0`
  gives that tier's invitees nothing.
- **The gift is given at sign-up.** All three sign-up paths call
  `giveAffiliateSignupGift` after the user is committed: password
  registration, the emailed link, and OAuth.
  - It creates the subscription with source `affiliate_gift` and emails the
    invitee in the background, as the manual gift did.
  - A failure is logged and never fails the sign-up.
  - The purchase block on a gifted plan and the registration-window bypass
    are unchanged.
- **`affiliate_signup_gifts`** holds one row per handled invitee: the
  inviter, plan, client address and status (`gifted`, `ip_used`,
  `cap_reached` or `email_blocked`).
  - Its unique `user_id` means a user is handled once.
  - A withheld gift is never given later.
- **Risk limits.** Each counts `gifted` rows of the last 24 hours:
  - An address that already received a gift receives no second one.
  - A channel stops giving once it reaches `gift_daily_cap` (default 50; 0 is
    no limit). The inviter's `affiliates` row is locked first, so concurrent
    sign-ups through one channel count the cap one at a time.
  - `gift_blocked_email_domains` lists domains, one per line. A domain and
    its subdomains receive nothing.
- **The manual gift is retired.** `POST /api/affiliate/self/invitees/:id/gift`
  answers with "Invitees now receive the gift plan automatically when they
  sign up" until no console calls it. The invitations page reports
  gifted/owned and has no button.
- **Console.**
  - The user's invitation dialog chooses ordinary / retail / distributor
    with one line each on what the tier means.
  - The root list shows the tier and filters by it.
  - The settings tab has both plans, the cap and the blocked domains.
  - The invitee total shows the last 24 hours' gifts given and withheld.

## Alternatives considered

- **Keep `channel` and add a second-level switch.** That needs two booleans
  for three states, one of them meaningless (second level without a
  channel). The gift plan also follows the kind of channel.
- **Use new-api's `QuotaForInvitee`.** It credits balance that never expires,
  to every invitee of every inviter, at one amount for all.
- **Gift balance instead of a plan.** Balance never expires. A 7-day plan
  bounds what an abused trial costs and reuses the gift email and the
  purchase block.
- **A per-affiliate gift amount.** The operators set gifts per kind of
  channel; one setting changes every retail channel at once.
- **Count the address limit across channels under a global lock.**
  Concurrent sign-ups from one address through different channels can both
  pass the address check. A global lock would serialize every channel's
  sign-ups to close that rare race.

## Consequences

- Production needs, after the release:
  - Create the $3 plan (7 days). Set its "Registered on or after" to a date
    far in the future, so no one can buy it and only holders see it.
  - Set it as the retail channel gift plan. Keep the $20 plan as the
    distributor plan.
  - Mark apiranking and Magpie as retail at 30%.
- The address is the client IP new-api sees behind the proxy. A shared NAT
  or office gets one gift per 24 hours.
- New-api can count withheld gifts but cannot alert on them. A relay-watch
  check in corecode-infra on `affiliate_signup_gifts` (a spike of `gifted` or
  any `cap_reached`) is the follow-up.
- The server ships before the console, as with every release. The console in
  production keeps working: it reads `channel`, sends `channel`, and its gift
  button gets the retirement message.

## Verification

- `TestAffiliateSignupGiftDatabaseMatrix` and `TestAffiliateTiersDatabaseMatrix`
  pass, with the existing affiliate tests, on SQLite 3.50.4, MySQL 8.0.46 and
  PostgreSQL 16.15 under `-race`. They cover:
  - no plan configured, an ordinary inviter, each tier's plan, and a user
    handled once;
  - purchase blocked after the gift, and administrator binding;
  - the address limit, including expiry after 24 hours;
  - blocked domains and subdomains;
  - eight concurrent sign-ups against a cap of five;
  - rate 0, a disabled plan, the program off, and the wrong inviter;
  - the invitee list's gifted/owned states and the registration window;
  - the migration run twice;
  - retail commission without a second level, and retail withdrawal.
  The cap test fails on MySQL and PostgreSQL with the row lock removed.
- `TestMagicLinkSignUpGivesTheChannelGiftPlan` signs up through the emailed
  link with a retail code and checks the subscription and the email. It fails
  with the call removed from `registerMagicLinkUser`.
- Migration, on all three databases: start the PR #91 binary on an empty
  database, add one channel and one ordinary affiliate, then start the new
  binary twice. The channel becomes `distributor`, the ordinary row stays
  empty, and the schema after the second start equals the first.
- End to end on a local SQLite build, in the browser:
  - set the retail plan in settings;
  - make a user a 30% retail channel with code `apiranking`;
  - register two users through that code from one address. The first
    received the plan; the second was recorded `ip_used`.
  - The overview showed one given and one withheld.
- `go test` passes for `model`, `controller`, `router`, `middleware`,
  `service`, `setting/...`, `i18n` and `common/...`. `bun run typecheck`
  passes. vitest over affiliates, invitations, wallet, users and
  system-settings passes except `quota-display.test.tsx`, which fails on the
  base branch too.
