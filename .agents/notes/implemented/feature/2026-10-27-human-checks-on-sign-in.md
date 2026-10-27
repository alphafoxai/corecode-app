# Agent Note: Self-hosted proof of work, and Turnstile on the emailed link

Status: implemented

## Problem

The operators want a human check in front of sign-in and registration. new-api
ships Cloudflare Turnstile, but most customers are in mainland China and
`challenges.cloudflare.com` is not guaranteed to be reachable there. With
Turnstile on, an unreachable widget blocks password sign-in, registration and
the emailed link for every customer behind it. The emailed link was also not
covered at all: it was left out when it shipped, pending an operator decision,
and it is now the main way customers sign in and the only way they register by
email. Every send spends a Resend mail.

## Decision

- **A proof-of-work check served by this server.** `GET /api/pow/challenge`
  returns `sha256(salt + n)` for a secret `n` in `[0, PowMaxNumber]`, a salt
  that carries its expiry, and an HMAC over salt and challenge. The browser
  tries every number and sends the answer as base64 JSON in `X-Pow-Solution`.
  `middleware.PowCheck` verifies it without storing challenges. Nothing loads
  from a third party, so the check works wherever `corecode.live` does.
- **The signing key is derived from `CRYPTO_SECRET`.** Both server colors share
  it during a release, so a challenge issued by one verifies on the other, and
  no new secret has to be provisioned or rotated.
- **A solution passes once.** After verifying, the signature is marked used in
  Redis with `SETNX` until the challenge expires, so a replay to the other color
  is refused too. Without Redis there is one process and a map is enough. A
  Redis error refuses the request instead of allowing a replay. Every attempt,
  failed sign-ins included, costs a new solve.
- **Difficulty is an option.** `PowMaxNumber` defaults to 100000, about 50k
  hashes on average: half a second on a laptop and a second or two on a phone
  in the browser, about 20 ms in native code. Proof of work only raises the
  cost of each request and turns away clients that do not implement it; it does
  not tell people from machines. Operators raise the number during an attack,
  between 1000 and 10000000.
- **The console solves in the background.** `useProofOfWork` fetches and
  solves a challenge when a form mounts, hands each solution out once, and
  starts the next, so the customer rarely waits. A solution within 30 seconds
  of expiry is solved again. Nothing is rendered; when a solution cannot be
  made the form says so and sends nothing.
- **The same five routes take both checks.** Password sign-in, registration,
  the verification mail, the reset mail and the link send run
  `TurnstileCheck` and then `PowCheck`; each is a no-op while its switch is
  off. Redeeming a link or a code is not guarded: the mailed one-time secret is
  the credential, and the link may be opened on a device that never ran the
  check. The enterprise application form keeps Turnstile only.
- **Turnstile now covers the link send too, and its widget renders reliably.**
  `MagicLinkForm` renders a fresh widget per send, as the password form does.
  `Turnstile` returned early when another instance had inserted the script tag,
  so a widget that mounted while the script was loading never rendered; it now
  waits for the script's `load` event.
- **The switches stay operator actions.** No deploy writes `PowCheckEnabled`,
  `PowMaxNumber` or `TurnstileCheckEnabled`. Production keeps them off until
  `corecode-infra`'s deploy scripts stop signing in by password; the order is
  in that repository's
  `notes/workspace/implemented/architecture/2026-10-27-human-check-and-a-deploy-token.md`.

## Alternatives considered

- **Turnstile alone.** Rejected as the default: its reachability from mainland
  China is not guaranteed, and when it fails, sign-in fails.
- **A mainland CAPTCHA service (Tencent Cloud, Alibaba Cloud, GeeTest).** Real
  bot detection with mainland nodes. Deferred: it needs a cloud account with
  real-name verification, costs per call, and sends customer IPs and behavior
  to the vendor. Worth adding at registration if organized sign-up abuse
  appears.
- **The ALTCHA libraries.** Same scheme. Rejected for now: the server side is
  about a hundred lines with no dependency, and the widget's look and copy would
  differ from the console; the console needs no visible widget.
- **Solve in a Web Worker.** Rejected at this difficulty: `crypto.subtle`
  resolves off the main thread, so the page stays responsive without a worker
  bundle.

## Verification

- `go test ./service -run Pow`: the issued answer passes; a wrong or negative
  number, a forged signature, a self-made or extended salt, another
  deployment's key, malformed and oversized input fail; a solution expires at
  its deadline; it passes once in memory and once across instances with Redis
  (miniredis), with the used mark kept for the challenge's lifetime; a Redis
  outage refuses.
- `go test ./middleware -run PowCheck` and `go test ./router -run 'Turnstile|Pow'`:
  with either switch on, all five entry points refuse a request without the
  check before the handler runs (the link-send case fails without the route
  change); the challenge endpoint is uncached and solvable.
- `go test ./router ./middleware ./service ./controller ./model`. `go test ./...`
  also fails `relay/channel/advancedcustom`, identically on `origin/main`: the
  local DNS proxy resolves the test's `.invalid` host.
- End to end against this branch's binary on SQLite: setup, difficulty bounds
  enforced, PoW on, password sign-in refused without a solution, accepted with
  one solved by the console's `proof-of-work.ts`, refused on replay, a wrong
  password with a fresh solution gets the ordinary failure, and sign-in works
  without a solution once the switch is off.
- Vitest: the solver finds the number and stops on abort; the link form sends a
  solution and solves a new one for the resend, and sends nothing when no
  challenge can be fetched; the Turnstile cases; password sign-in, registration
  and both mails carry the header, registration never puts it in the body. The
  `auth`, `enterprise`, `system-settings` and `components` suites pass.
- `bun check -b`; `oxlint` error count unchanged from `origin/main`; changed
  files pass the format check. Not checked in a real browser: the settings
  section layout and the background solve on a phone.

OWASP: ASVS 5.0.0 V2.4.1 (anti-automation on costly functions) and V6.3.1
(credential stuffing and brute force), with the Authentication Cheat Sheet's
advice that a CAPTCHA-style control is defense in depth beside rate limiting,
which stays in place. Unresolved: proof of work does not stop an attacker
willing to spend CPU; the mitigation is the difficulty option and the existing
per-IP and per-mailbox limits.
