# Agent Note: Per-user concurrency limits

Status: implemented

## Problem

The concurrency limit is per user since
`2026-10-27-user-concurrency-limit.md`, but its value comes only from the
user's group. Operators need to raise or lower it for single customers, and
plan to tier it by cumulative top-up later.

## Decision

- **`token_setting.user_concurrency_limits`** maps a user id to that user's
  limit. It replaces the group limit for that user; 0 lifts the limit. The
  server rejects a key that is not a positive user id in canonical form, or
  a negative value. The config loader replaces stored maps rather than
  merging, so removing a user from the map removes the override.
- **`EffectiveUserConcurrencyLimit(userID, group)` is the one resolver,**
  returning the limit and its source (`user` or `group`). The limiter and
  the site insights dashboard both call it. A rule by cumulative top-up goes
  between the override and the group fallback, so neither caller changes.
- **The editor is a panel on the dashboard's capacity tab,** root only. It
  accepts a user id or an exact username, lists each override with the
  group limit it replaces and the user's requests in flight, and saves by
  writing the whole map through `PUT /api/option/`. The in-flight table
  marks limits that come from an override.

## Alternatives considered

- **A column on users.** It needs a migration and a user-edit path for a
  setting a handful of customers have; the option map is read in memory on
  every request already.
- **Per-group limits only, with a group per tier.** Groups also select
  channels and prices, so moving a customer between groups to change
  concurrency would change what they pay.

## Consequences

- Two operators editing at once can overwrite each other's change, since
  the panel saves the whole map.
- An override for a deleted user stays in the map until removed; the panel
  shows it without a username.

## Verification

- `TestUserConcurrencyOverride` (under `-race`) checks that an override
  caps a user above the group limit, 0 lifts the limit, and other users keep
  the group limit; `TestEffectiveUserConcurrencyLimit` and
  `TestValidateUserConcurrencyLimits` cover the resolver and validation.
- `go test ./router/ ./controller/` passes.
- Frontend: typecheck, all 2,658 vitest tests, `oxlint` and `oxfmt` pass.
- End to end on a local SQLite build signed in as root: adding a limit by
  username and by id stored `{"2":20,"3":0}`, removing one stored
  `{"3":0}`, and an invalid key was rejected with its message.
