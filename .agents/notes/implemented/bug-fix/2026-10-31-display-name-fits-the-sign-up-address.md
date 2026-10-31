# Agent Note: Let the display name hold the address an emailed-link sign-up gives it

Status: implemented

## Problem

On 2026-10-31 saving `wayne7wang@outlook.com` in the admin user editor failed with
"输入不合法 Key: 'User.DisplayName' Error:Field validation for 'DisplayName' failed on
the 'max' tag". `registerMagicLinkUser` sets `display_name` to the full address, and
`Insert` does not run struct validation, so the row was stored with 22 characters.
`UpdateUser` and `UpdateSelf` validate the whole record against `max=20`, so every
emailed-link account whose address is longer than 20 characters could be saved by
neither an administrator nor its owner, even when the edit left the name untouched.

## Decision

`User.DisplayName` validates at `max=50`, the same limit as `Email`. Any address that
passes `Email`'s check now passes as a display name, and accounts already stored this
way become editable without touching their data. Only the validation tag changes; the
column definition does not.

## Alternatives considered

- **Name the account after `username` instead, and backfill.** That keeps upstream's
  limit, but it needs a production data rewrite, and it shows customers a truncated or
  suffixed name where they now see their mailbox.
- **Truncate the address to 20 characters at sign-up.** A cut address reads as a
  different address, and existing rows would still fail to save.

## Consequences

- The tag differs from upstream's `max=20`, a one-token conflict on an upstream sync
  that touches this line.
- An administrator or customer can now type a display name of up to 50 characters.

## Verification

- `TestMagicLinkSignsInAndRegistersUnknownAddress` now asserts the created account's
  display name is its 31-character address and that it passes
  `Validate.StructExcept(user, "Password")`, the check both edit handlers run. With the
  tag at `max=20` it fails with the production message.
- `go vet ./model ./controller` and `go test ./controller ./model` pass.
