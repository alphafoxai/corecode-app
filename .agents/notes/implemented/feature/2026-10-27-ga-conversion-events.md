# Agent Note: Report sign-ups and purchases to Google Analytics

Status: implemented

## Problem

The console carries the GA4 tag, so GA counts visits and page views. It
cannot tell which visits turn into an account or a payment, so no report
shows which channel brings paying customers.

## Decision

The console sends GA4's recommended `sign_up` and `purchase` events from the
browser, through the gtag function the injected tag defines.
`web/src/lib/analytics.ts` holds both.

- **Only when GA is on.** new-api injects gtag.js only when a Google
  Analytics ID is set. Without it `window.gtag` is absent, nothing is sent,
  and the purchase check makes no request.
- **`sign_up`.** `handleLoginSuccess`, which every login transport reaches,
  reports a login as a registration when the account is at most 10 minutes
  old. `method` is the session's `login_method`: `magic_link` for the email
  link or code, and `oauth:oidc` for Google. The self-user DTO
  (`buildSelfUserData`) now carries `created_at` for this check; the
  login, refresh and `/api/user/self` responses all use it.
- **`purchase`.** epay credits an order in its asynchronous notify, often
  after the customer has left the payment page. So each time the console
  opens with a user, it reads that user's ten newest orders from
  `/api/user/topup/self`. It reports each successful order completed in the
  last 3 days with `transaction_id` = `trade_no`, `value` = `money` and
  `currency` = `CNY`. Orders paid from the balance are skipped, because
  their money was already counted at its top-up. Subscription purchases
  write a `TopUp` row too, so they are included. The request skips the
  global error handler, so a failure never reaches the customer.
- **Once per conversion.** A browser keeps the keys it has reported
  (`sign_up:<user id>`, `purchase:<trade_no>`, the latest 200) in
  localStorage under `corecode:analytics:reported`. GA also drops a repeated
  purchase with the same `transaction_id`, which covers the same order
  reported from a second browser.

## Alternatives considered

- **Send the events from the server with the Measurement Protocol.** The
  numbers would be exact. But an event without the browser's GA client ID
  has no session or source, which defeats the purpose. The epay notify
  carries no cookie, so each order would need the client ID stored at
  checkout (a new column in all three databases), plus an API secret and an
  outbound call in the payment path.
- **Fire `purchase` on the payment return page.** epay's return can arrive
  before its notify, so the order may still be pending. And a customer who
  closes the tab after paying never returns to it.
- **Mark a new account in the login response.** The register-on-login paths
  (magic link, OIDC) would each need to carry a flag through the
  verification challenge. `created_at` is a plain profile fact and needs no
  change to the authentication flow.

## Consequences

- A purchase is reported the next time the customer opens the console, in
  that session. An order paid and never followed by a console visit within
  3 days is not reported. GA's revenue is therefore a lower bound; the
  administrator top-up report stays the source for money.
- A login within 10 minutes of creating the account counts as the sign-up.
  An account created by an administrator and first used within 10 minutes
  is also counted.
- `currency` is fixed to `CNY` because CoreCode charges only through epay,
  as `formatPaymentMoney` already assumes. Enabling a channel that charges
  in another currency needs a per-order currency here too.
- `sign_up` must be marked as a key event in the GA property. GA marks
  `purchase` as a key event by default.

## Verification

- `web/src/lib/__tests__/analytics.test.ts`: 8 tests covering the
  registration window, dedupe, the order filters, the CNY payload, the
  request without the global error handler, a swallowed failure, and no
  request without the tag. `TestSecurityAccountProfileReadsPasswordStatusInOneQuery`
  now checks `created_at` in the profile and in `/api/user/self`; it fails
  without the model change.
- A local build on SQLite with `GOOGLE_ANALYTICS_ID=G-TESTLOCAL1`: a
  password login of a just-registered user pushed
  `["event","sign_up",{"method":"password"}]` to `dataLayer`. With four
  orders inserted (paid, pending, balance-paid, paid 4 days ago), a reload
  pushed one `purchase` for the paid order in `CNY`, and a second reload
  pushed none. Restarted without the ID, `gtag` was undefined and the
  console made no `/api/user/topup/self` request.
