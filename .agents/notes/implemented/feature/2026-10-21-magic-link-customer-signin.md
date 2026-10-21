# Agent Note: Customers sign in with an emailed link

Status: implemented

## Problem

The customer console on `corecode.live` signed people in with a username and a
password. That meant inventing a password at sign-up, a reset flow to secure, and
support tickets when someone forgot — none of which is the product. The console
also carried two pages, sign-in and sign-up, that the operator had to keep
consistent.

new-api gives the fork no passwordless option to turn on. Its mail codes carry
only the `v` (verify address) and `r` (reset password) purposes, `Login()`
refuses a request with no password, and the codes live in a process-local map
capped at 10 entries, so a restart drops every pending code and two instances
never share one. Password reset already emails a link that opens a console page,
but that page mints a random password rather than a session.

## Decision

- **One field, one page.** `web/src/features/auth/sign-in` asks for an email
  address and sends a link. The address decides what the link does: unknown
  creates the account, known signs it in. `/sign-up` shows the same email form
  while the link can register, and keeps the password form when it cannot.
  `controller/magic_link.go` owns both endpoints.
- **The account appears on redemption, not on request.** Asking for a link
  creates nothing, so an address nobody controls never becomes a user, and the
  request cannot reveal whether an account exists.
- **`auth_flows` carries the link; no table was added.** `model/magic_link.go`
  stores a link as an `AuthFlow` row with purpose `magic_link`, the normalized
  address in `provider` and the issuing client address in `session_id`. That
  reuses the fork's existing one-time-ceremony table: 32 random bytes, persisted
  only as an HMAC of the token, atomic single consumption, expiry column, and a
  cleanup task already sweeping expired rows. The process-local code map is not
  on the sign-in path, so a restart or a second instance cannot lose a link.
- **A mailbox holds one live link.** Issuing marks earlier unconsumed links for
  that address consumed inside the send transaction, under the existing
  `lockNormalizedEmail` lock. An older message in the inbox stops working after
  a newer request, and two live links cannot race into two accounts. Superseded
  rows are kept, so the send throttle counts links actually issued.
- **Throttles read the database, not a counter in memory.** The send endpoint
  refuses a second link to one address inside `MagicLinkSendInterval`, and caps
  10 links per hour per address and 20 per hour per client IP against
  `auth_flows` rows. `CriticalRateLimit` and `EmailVerificationRateLimit` still
  apply per IP at the route. Turnstile is deliberately not wired to these two
  routes yet — an operator decision tracked separately.
- **Redemption returns an ordinary login.** After consuming the token,
  `LoginWithMagicLink` calls the same `setupLogin` every other primary method
  uses, so session issuance, refresh cookie, login audit, and any enrolled 2FA
  or passkey step-up behave exactly as they do for a password sign-in.
  `login_method` is recorded as `magic_link`.
- **Registration is the existing switch, split by method.** Two option rows gate
  the flow: `MagicLinkLoginEnabled` for both endpoints and
  `MagicLinkRegisterEnabled` for whether an unknown address may create an
  account. Both default on in code; `RegisterEnabled` still governs every
  registration path. The console hides the customer password form when
  `PasswordLoginEnabled` is off, which is the intended production setting and an
  operator action this change does not take: a deploy that resets it silently
  changes what customers can do.
- **Password login stays open for the root account when the switch is off.**
  `Login` checks `PasswordLoginEnabled` after credentials verify and rejects
  non-root accounts only. Two operators need that door: `corecode-infra`'s
  `init-relay.sh` logs in as root on every deploy to write SMTP and pricing
  options, and mail itself cannot be the way back in when mail is broken. The
  check runs after verification so a rejected non-root attempt is
  indistinguishable from any other failed password login.
- **The mail is rendered in the recipient's language.** `SendMagicLink` is an
  anonymous route, so nothing loads the account's setting for it; it reads
  `i18n.StatedLang(c)` and overrides it with the account's saved language when the
  address has one, then calls `i18n.Translate` explicitly — the same shape
  `SendPasswordResetEmail` uses. Rewriting the `Accept-Language` header does not
  work: `middleware.I18n` has already cached the request language in the context,
  which `StatedLang` reads before the header.
- **A magic-link account has no password.** `prepareForInsert` already leaves an
  empty password empty, and `ValidateAndFill` refuses an empty hash, so a
  passwordless account cannot be signed into by password and there is nothing
  stolen in the database. `username` and `display_name` are derived from the
  address; `email` stays the identity the link resolves.
- **The token never stays in the address bar.** The link opens
  `/email-login?token=…`, which posts the token once, rewrites the URL before
  awaiting, and never puts the token in a link the page renders. The consume
  route is POST, so the token does not reach a server access-log query string.
  An in-app `?redirect=` rides the link and is validated by
  `SafeMagicLinkRedirect` (single leading slash, no host, no backslash or quote,
  length-capped), then sanitized again client-side by the shared
  `sanitizeAuthRedirect` before navigation.

## Alternatives considered

- **Reuse the in-memory verification-code map with a new purpose.** It matches
  what password reset does today and is less code. Rejected: capped at 10
  entries, single process, lost on restart, and its `VerifyCodeWithKey` does not
  consume, so a code stays replayable until it expires. A sign-in token is a
  credential, and a credential that outlives its first use is not one.
- **A new `magic_link_tokens` table.** Clearer ownership of the rows. Rejected:
  `auth_flows` already provides token hashing, atomic claim, expiry, purpose
  isolation, retention cleanup, and a three-database migration that is already
  shipped. A second table would duplicate all of it and need its own migration
  and sweeper.
- **A 6-digit code instead of a link.** Codes are easier to phish, need a second
  page to type them into, and the fork's own `GenerateVerificationCode` truncates
  a UUID, which is not a code worth sending. A link lands the user in the console
  in one click.
- **Sign in on GET, when the link is opened.** One click instead of two, but the
  token then sits in server access logs, referrer headers, and any prefetch, and
  a link that signs in on sight can be consumed by a mail scanner. POST from the
  landing page keeps the usable session behind a request the browser makes
  deliberately.
- **Separate register and login pages, as before.** Two pages to keep in step and
  a user who must guess which one they need. Rejected by the request itself:
  registration and login are one action here.
- **Longer-lived links (an hour or a day).** Shared inboxes and mail archives are
  the threat model. `MagicLinkTTL` is 10 minutes and single use, matching the
  reset link the product already sends.
- **Delete superseded links instead of consuming them.** Fewer rows. Rejected:
  consumption keeps the per-address throttle honest, because deleting the
  evidence of a send lets a caller reset its own counter.

## Consequences

- Customers cannot sign in while outbound mail is down. The root password door is
  the recovery path for the console itself; it is not a customer account.
- `auth_flows` gains one row per sign-in request, and `DeleteExpiredAuthFlows`
  retains rows for `AuthFlowDefaultCleanupRetention` after expiry. At the
  per-address cap this is bounded, and no new sweeper was added.
- The console answers the same way for a known and an unknown address while
  registration is open, so the UI cannot say "welcome back" from that response.
  Copy stays identical for both.
- Two link systems now exist in the set, on purpose and on different surfaces:
  this one serves the customer console on `corecode.live` (this repository's
  `/api/magic_link/*`), and `corecode-provider`'s BFF serves the internal
  operator console on `ai.corecode.live/login`. They share no token store,
  no user table, and no rate limiter; an operator signs into the BFF with their
  mailbox and a customer signs into the console with theirs.
- Password sign-up is not offered by the console any more: `/sign-up` shows the
  email-link form while the link can register. `PasswordRegisterEnabled` still
  exists and is an operator setting this change does not write; leaving it on
  would keep the password form reachable on a deployment where the link cannot
  register. Existing password accounts keep their hashes and can still change one
  from account settings.

## Verification

Run on 2026-10-21 in a worktree at `feat/magic-link-auth`.

- `go build` and `go vet` clean for `model`, `controller`, `router`, `common`,
  `i18n`, `service`, `middleware`; `gofmt -l` reports only the pre-existing
  `e2e/doc_parse_test.go`.
- `go test` for `controller`, `router`, `model`, `service`, `service/authz`,
  `common`, `middleware`, `i18n`: all pass.
- Three-database matrix on the authentication subset (`TestMagicLink*`,
  `TestSafeMagicLinkRedirect`, `TestPasswordLoginStaysAvailableForRootWhenDisabled`,
  `TestSendMagicLinkRejectsInvalidEmail`, `TestAuthFlow*`, and
  `TestAccessTokenRouteRulesCoverEveryDashboardRoute`) through
  `TEST_SECURITY_DIALECT`: SQLite 3.50.4 (embedded), MySQL 8.4.11 and PostgreSQL
  16.15 — real loopback servers with a database created per case by
  `newAuditTestDatabase`. No table, column, or index changed — the link reuses the
  shipped `auth_flows` schema and the new options are `options` rows — so no
  migration matrix applies beyond these passing on each engine.
- `controller/magic_link_test.go` drives the send endpoint against a real loopback
  SMTP server and reads the link back out of the delivered message. It covers: link
  signs in and registers an unknown address with no password; a spent, replayed,
  expired or superseded token gets one identical rejection message; a second send
  inside the resend window answers 429; an unknown address with registration closed
  answers success and sends nothing, while a registered address still receives its
  link; the link URL carries token and redirect but never the mailbox; a non-root
  password login is refused with `PasswordLoginEnabled` off while root succeeds.
  `TestSafeMagicLinkRedirect` pins the open-redirect rejects. Two controls proved
  the newest cases actually detect their bug: with the recipient-language override
  disabled, `TestMagicLinkMailFollowsTheRecipientsSavedLanguage` fails on English
  mail; with the supersede update disabled,
  `TestMagicLinkIsSingleUseAndSuperseded` fails on the retired token. Both were
  restored and re-passed.
- `router/access_token_scope_test.go` lists both new routes as anonymous; its
  whole-panel-route coverage test passes, which is what fails closed if a future
  route is added without a PAT rule decision.
- Frontend, in `web/`: `bun run test` 2249 passed (187 files), including
  `src/features/auth/__tests__/magic-link.test.tsx` — 10 cases covering the posted
  payload and continuation path, the server-supplied resend lockout, a rejected
  send not rendering the delivered state, consent gating the send, redemption
  applying a session, the token leaving the URL, a spent token offering a new link,
  the no-token state, and `/sign-up` choosing the link form or the password form.
  `bun run typecheck` and `bun run build` pass; `bun run i18n:sync` reports zero
  missing or extra keys across all seven locales after 21 keys were added to each.
  `oxlint` is clean on every file this change touches; the two remaining errors in
  the auth area are pre-existing in `src/features/auth/lib/validation.ts`, which
  this change does not edit.
- Not verified: a real click from a real mailbox against the deployed console, and
  the production option values. `init-relay.sh` is unchanged because it still logs
  in as root, which the root door keeps working; the deploy that moves
  `PasswordLoginEnabled` off has to be the one that ships this image.
