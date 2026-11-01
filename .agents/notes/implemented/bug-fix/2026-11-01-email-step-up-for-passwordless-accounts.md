# Agent Note: A passwordless account verifies sensitive actions with an emailed code

Status: implemented

## Problem

An account created through the emailed sign-in link has an address and no
password. For the step-up scopes (set a password, set up 2FA, register a
Passkey, bind or unbind a sign-in method, create an access token, delete the
account) `securityVerificationPolicy` falls back to the password, and for an
account without one, to a linked OAuth provider. Most link accounts have
neither, so the dialog said "No linked OAuth provider is available." and every
one of those actions was closed, including the ones that would add a factor.
Feedback #342 (2026-11-01) reported it on changing the password.

## Decision

- **A new step-up method, `email`.** In the no-password fallback, an account
  with an address is offered `[oauth, email]`; a password account is not offered
  email, and an account with no address keeps `[oauth]`. Email is marked
  unavailable, with a reason, while `SMTPServer` is empty.
- **`POST /api/verify/email {scope, context}` mails a six-digit code** to the
  account's own address. The server binds the operation first, so the code is
  stored with its scope and context hash, the address it went to, and the user
  and session that asked. It is an `auth_flows` row (`email_step_up`) holding
  an HMAC of the code, never the code.
- **`POST /api/verify {method: "email", scope, context, code}` spends it** and
  issues the same proof as the other methods. The code is refused, with one
  message, from another session, for another operation, after the address
  changed, after its ten minutes, after a newer code, or once spent. Every write
  is a compare-and-swap on the row's payload, so concurrent guesses cannot share
  an attempt.
- **Limits:** five wrong codes spend a code; one code per minute and ten per
  hour per account, counted from rows; the send route carries `CriticalRateLimit`,
  `UserCriticalRateLimit("security-verification")` and
  `EmailVerificationRateLimit`. The audit log records each send
  (`user.security_email_code`) with its scope and outcome, never the code.
- **Access tokens** follow `POST /api/verify`: the route is open to them and the
  service's scope check decides, as it does for 2FA.
- **The console** adds an "Email code" tab with a send button, a resend
  countdown (`useCountdown`), the masked address, and a code field. A method the
  server marks unavailable is never the default, so this account opens on it.

## Alternatives considered

- **Reuse the email-binding flow.** It changes the address and needs a proof
  before it starts, so it cannot be the proof.
- **Reuse the magic-link row.** That row signs in and is keyed by address; a
  step-up code must be tied to one session and one operation.
- **Offer email to password accounts too.** It would add a second, weaker path
  beside the password for no account that needs one.

## Consequences

- Assurance: for these accounts the mailbox is already the only sign-in
  credential, so a code from it proves as much as signing in does, and no less.
  NIST SP 800-63B does not accept email as an out-of-band authenticator; this is
  re-authentication of a mailbox-only account, not a second factor. Accounts
  that want more can now set up 2FA or a Passkey, which take precedence.
- A send that fails to deliver spends its code, but its row still counts toward
  the one-minute delay.
- OWASP ASVS 4.0.3 requirements applied: 2.7.2 (expires within 10 minutes),
  2.7.3 (usable once), 2.7.6 (six random digits from `crypto/rand`), 2.2.1
  (attempt cap and send throttles), 7.1.1 (no code in logs; storage holds
  only its HMAC).

## Verification

Run on 2026-11-01 in a worktree at `fix/email-step-up`.

- `go vet ./...` clean (with the placeholder `web/dist/index.html` CI uses).
- `go test ./controller ./service/... ./model ./router ./i18n ./middleware
  ./common`: all pass. With the shell's proxy variables set,
  `TestUpstreamAddressesMaskOnlyConfiguredAddresses` fails on the proxy host
  name; it passes with them unset and is unrelated to this change.
- New cases in `controller/security_account_test.go`, against a loopback SMTP
  server: the policy for password, passwordless-with-address,
  passwordless-without-address and no-SMTP accounts across three scopes; send,
  masked address, resend wait (429), wrong code, the right code for another
  scope, the right code from a second session, success, replay of a spent code,
  no code in the audit log; the attempt cap, expiry, supersession and an address
  change each refuse the mailed code; a password account cannot ask for one.
  A control that dropped the scope and context check made
  `TestSecurityAccountEmailStepUpProvesOneOperationOnce` fail; restored, it
  passes.
- The new cases and the existing email-binding, method-policy and password-proof
  cases through `TEST_SECURITY_DIALECT`: SQLite (embedded), MySQL 8.0.46 and
  PostgreSQL 18.6, real loopback servers, 33 passed on each. No table, column or
  index changed (the code reuses `auth_flows`), so no migration matrix applies.
  The minimum versions, MySQL 5.7 and PostgreSQL 9.6, were not run: their images
  could not be pulled here. The only new SQL is `CASE WHEN COALESCE(email, '')
  <> ''`, which all of them support.
- Console: `bun run typecheck`, `bun run lint:check`, `bun run format:check`,
  `bun run build`, `bun run first-load:check` and `bun run test` (257 files,
  2807 tests) pass. Two new flow tests: a passwordless account opens on the
  email tab with the linked-account tab disabled, sends, sees the masked
  address and the countdown, cannot submit five digits, and gets the proof; a
  failed send shows the server's message and allows another send.
- Not verified: a real mailbox against the deployed console.
