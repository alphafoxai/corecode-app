# Agent Note: Give an emailed-link sign-up a free username

Status: implemented

## Problem

On 2026-10-26 an invitee signing up from an invitation link landed on
"此登录链接无效或已过期" with a fresh link. Emailed-link sign-up names the
account after the mailbox's local part, and an existing customer at another
domain with the same local part already held that name. The insert
failed on `uni_users_username`, and the controller maps that failure to the
same "invalid or expired" message as a bad token. `ConsumeMagicLink` spends
the link before the insert runs, so the code and the link both failed on
every retry. Any two addresses with the same local part hit this, invited or
not.

## Decision

`registerMagicLinkUser` keeps the local part when it is free and otherwise
uses its first 15 characters plus `_` and four random alphanumerics, staying
within the 20-character limit. A deleted account still holds its name in the
unique index, so `CheckUserExistOrDeleted` with deleted rows counts. After
five taken candidates the sign-up fails as a database error.

## Alternatives considered

- **Spend the link in the same transaction as the insert.** That would keep
  any failed sign-up retryable, not only this one. It spans `auth_flows` and
  `users` and the referral write, so it is a larger change. It stays a
  follow-up.
- **Name the account after the full address.** Most addresses exceed the
  20-character display limit.

## Consequences

- A check-then-insert race can still collide when two sign-ups pick the same
  name at once. The random suffix makes that unlikely.
- The username changes only for the second holder of a local part. The
  display name stays the full address.

## Verification

- `TestMagicLinkSignUpSurvivesATakenMailboxName` signs up through the link
  while another account holds the local part, and expects a session and a
  suffixed name. Without the fix it fails with "Sign-in link is invalid or
  has expired, please request a new one", the production response.
- `go test ./controller/ ./model/ -count=1` passes.
