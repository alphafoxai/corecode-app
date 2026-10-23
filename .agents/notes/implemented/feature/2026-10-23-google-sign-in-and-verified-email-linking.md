# Agent Note: Google signs in through the OIDC slot and links by a confirmed address

Status: implemented

## Problem

Customers sign in with an emailed link, and the owner wants Google beside it. new-api
already has one generic OIDC slot that Google fits, but it had two gaps:

- It copied the `email` claim into a new account without checking `email_verified`.
  The emailed link opens whichever account holds an address. Someone holding an
  identity-provider account with an unconfirmed address could create the console
  account for that address first. The real owner's link would then open an account
  the claimant can still reach through the provider.
- A customer who already had an account was refused with "Email address is already
  in use" the first time they chose Google. The owner wants Google to sign them into
  that account.

## Decision

- **Google uses the OIDC slot.** No new column, table or route. The callback is
  `https://corecode.live/oauth/oidc`.
- **OIDC sign-in requires `email_verified`.** `oauth/oidc.go` refuses user info
  unless the claim is `true` or the string `"true"`; an absent claim is refused too.
  It then sets `OAuthUser.EmailVerified`, which no other provider sets.
- **A confirmed address links to the account that holds it.**
  `linkAccountByVerifiedEmail` in `controller/oauth.go` runs when no account is
  bound to the subject yet. A confirmed address is the same evidence the emailed
  link accepts, and that link already opens the one account holding the address.
  The rules:
  - Exactly one account must hold the address. Several holders are refused as
    "Email address is already in use".
  - `model.LinkUnboundIdentityWithTx` writes only an empty `oidc_id`. An account
    bound to another Google subject is refused and keeps its binding.
  - An account with TOTP or a passkey is refused with the existing "link it in
    account settings" message. The binding would otherwise be written before the
    second factor is checked.
  - A disabled account is returned unlinked, and the login refuses it as before.
  - Every link sends the "login linked" security mail and writes a
    `user.binding_bind` audit row with `verified_email_matched`.
- **The OIDC button shows the Google mark when the authorization endpoint is
  `https://accounts.google.com/`.** The endpoint decides, not the editable display
  name.

## Alternatives considered

- **A dedicated built-in Google provider.** Rejected: a three-database migration, a
  settings form, binding UI and a status field, for the protocol the OIDC slot
  already speaks, and a wider upstream sync.
- **A custom OAuth provider for Google.** Rejected: `oauth/generic.go` has the same
  missing `email_verified` check, and fixing it there needs a per-provider field
  path.
- **Link second-factor accounts and let the challenge guard the session.** The
  session would still need TOTP, but the binding would be written by someone who
  has not passed it. The legacy GitHub path solves this by carrying the rewrite into
  the challenge transaction. That plumbing is GitHub-specific, and the case is rare
  enough to send to settings.
- **Drop the email instead of refusing an unconfirmed one.** Rejected: an account
  without an address cannot receive the link or any mail.

## Consequences

- An account email set without proof would now also open through Google, as it
  already does through the emailed link. Accounts carry no per-address verified flag.
- An OIDC provider that never sends `email_verified`, such as some enterprise IdPs,
  can no longer sign anyone in through this slot.
- Switching Google on is an operator action in the dashboard. `corecode-infra`'s
  `init-relay.sh` writes only the credentials; the order is in that repository's
  `notes/workspace/implemented/architecture/2026-10-23-google-sign-in.md`.

## Verification

Run on 2026-10-23 in a worktree at `feat/google-oidc-verified-email`.

- `go vet ./oauth/ ./controller/ ./model/` is clean.
- `go test ./oauth/ ./controller/` passes. It includes
  `TestOIDCProvider_GetUserInfoRequiresVerifiedEmail`, which fails with the
  `oauth/oidc.go` check reverted, and six cases in
  `controller/oauth_verified_email_test.go`: link, repeat sign-in, unconfirmed,
  existing binding, second factor, disabled account, unknown address.
- `bun run typecheck` passes. `bunx vitest run src/features/auth` passes, including
  the Google case in `__tests__/oauth-entry.test.tsx`. oxlint and the formatter
  report nothing for the changed files.

OWASP references: ASVS 5.0 V10 (OAuth and OIDC), which says an identity-provider
email is used only when the provider asserts it as verified; the OWASP Authentication
Cheat Sheet on account linking. Not verified end to end against Google before
production.
