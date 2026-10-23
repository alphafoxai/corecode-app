# Agent Note: The sign-in email carries a code beside the link

Status: implemented

## Problem

The emailed sign-in worked only through its link. A customer reading mail on a phone
while signing in on a laptop had to forward the link or retype a long URL. The owner
asked for a code in the same email that can be typed on the sign-in page, with the
link still working.

`2026-10-21-magic-link-customer-signin.md` rejected "a 6-digit code instead of a link"
for three reasons:

- codes are easier to phish;
- they need a second page to type into;
- the fork's `GenerateVerificationCode` truncates a UUID, which is not a code worth
  sending.

This change adds a code beside the link rather than replacing it, so each reason is
answered below.

## Decision

- **The code and the link are one credential.** `model.CreateMagicLink` draws six
  digits from `crypto/rand` and stores
  `HMAC(SessionSecret, "magic-link-code-v1:", address:code)` as `CodeHash` in the same
  `auth_flows` payload as the link. Spending either one spends the row. Issuing a new
  email still supersedes the old row, so one mailbox holds one live code. The code
  expires with the link after 10 minutes.
- **Five wrong codes burn the row.** The link burns with it. `ConsumeMagicLinkCode`
  counts misses in the payload with a compare-and-swap on the payload it read, so
  concurrent guesses cannot share one attempt. A guess whose write loses counts as
  wrong. No row lock is needed: `lockNormalizedEmail` locks nothing on MySQL for an
  address with no account.
  - With the send cap of 10 per mailbox per hour, a guesser gets at most 50 tries an
    hour against a million codes.
  - Burning creates no new denial path. Anyone who can request mail for an address can
    already supersede its link.
- **`POST /api/magic_link/code` takes `{email, code}`** and goes through the same
  account path as the link (`signInMagicLinkAddress`): unknown addresses register when
  allowed, and `setupLogin` still runs any second factor. A wrong, expired, spent or
  superseded code and an unknown address all answer
  "Code is incorrect or has expired". The route has the same `CriticalRateLimit` as
  the link route.
- **The sign-in form has two steps.**
  - First the providers, then the email field.
  - After the send, a "Check your email" step with a six-box code input: paste and
    one-time-code autofill allowed, numeric keypad, submits on the sixth digit,
    errors inline with `role="alert"`.
  - Below the code: a reminder that the link also works, "Use a different email", and
    the resend countdown.
- **The email shows the code first**, large and monospaced, then the link. The subject
  stays code-free so notification previews do not show it.

Against the earlier rejection:

- **Phishing.** The link still exists and needs no transcription, which is the WCAG 2.2
  accessible-authentication alternative. A code bound to its address, limited to five
  tries and valid for ten minutes is no weaker than the password form the console
  already offers.
- **The second page.** The code is typed on the sign-in page the customer is already
  on.
- **Code quality.** The code comes from `crypto/rand`, not a truncated UUID, and is
  never stored in plain text.

## Alternatives considered

- **Count misses in a new column.** Clearer than a payload field. Rejected: it needs a
  three-database migration of `auth_flows` for one integer, and the compare-and-swap
  on the payload is equally atomic.
- **Lock the address with `lockNormalizedEmail`.** Rejected: it serializes nothing on
  MySQL when no account holds the address yet, which is exactly the registration case.
- **An 8-character alphanumeric code.** Stronger per guess, but harder to type from a
  phone. The attempt cap already bounds guessing.
- **Put the code in the subject.** Faster to read, but it shows on lock screens and in
  notification previews.

## Consequences

- An email sent before this deploy has no code; its link still works and its code
  field never existed.
- A customer who mistypes the code five times needs a new email.
- `auth_flows.payload` is rewritten on each miss; a row gains at most five writes.

## Verification

Run on 2026-10-23 in a worktree at `feat/magic-link-code`, rebased on `main` after the
Google change.

- `go vet` is clean, and `go test` passes for `controller`, `model`, `router`, `i18n`
  and `oauth`. `controller/magic_link_code_test.go` covers:
  - the code signs in and spends the link, and the link spends the code;
  - the code is bound to its address;
  - four misses then the right code succeed, while five misses burn both the code and
    the link;
  - a superseded email's code fails;
  - an expired code fails.
- `bun run typecheck` passes. `bunx vitest run src/features/auth` passes 106 tests,
  including auto-submit, inline error and retype, and returning to the email field.
  oxlint and the formatter are clean for the changed files.
- Screenshots against a local mock (production `/api/status`, no mail sent) at
  1440×900 light and 390×844 dark, of the email step, the code step and a wrong code.
  There is no horizontal overflow at 390 px.
- Not covered by a test: concurrent guesses racing on one row. The compare-and-swap
  is the guard, and SQLite serializes writes in the test database.

OWASP references: ASVS 5.0 V6 (authentication), on one-time out-of-band codes: random,
single use, short-lived, attempt-limited and stored hashed. Authentication Cheat Sheet
on brute-force protection. WCAG 2.2 SC 3.3.8 (accessible authentication) for paste,
autofill and the link alternative.
