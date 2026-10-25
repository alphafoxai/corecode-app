# Agent Note: Show subscription plan prices in the payment currency

Status: implemented

## Problem

The ¥9.9 starter pack showed as "$9.90" on the wallet, in the purchase
dialog, and in the admin plan list. new-api prints every plan price with a
hard-coded `$`, but the price is not in USD: the epay order passes
`price_amount` through as the amount charged, and CoreCode's epay charges
CNY. The plan's `currency` column does not help; the controller overwrites it
with `"USD"` on every create and update.

The purchase dialog also showed a balance box for plans that disallow
balance payment: "Required $9.9", the customer's balance, a refusal, and a
disabled button. The box quotes the price as quota in the display currency,
so next to "¥9.9" it read as a second, different price.

## Decision

- Every plan price goes through `formatPaymentMoney` from
  `features/wallet/lib`, the formatter the affiliate work introduced for
  money customers actually pay: the wallet plan card, the purchase dialog's
  amount due, the admin plan list, and the admin grant-plan picker.
- The purchase dialog renders the balance box only when the plan allows
  balance payment. A plan that allows it still shows the quota price there,
  in the display currency, because that is what balance payment deducts.

## Alternatives considered

- **Format by the plan's `currency` field.** It is always `"USD"`, so it
  would keep the bug. Making it meaningful needs a server change and an
  admin control for a field no channel in use reads.
- **Keep the balance box and only hide its price.** The box would still
  offer a button that can never be pressed.

## Consequences

- A deployment that sells plans through Stripe or Creem in USD would now see
  `¥` on those prices. CoreCode enables only epay. If that changes, plan
  prices need a per-channel currency, as top-ups already do.

## Verification

- `features/subscriptions/__tests__/purchase-dialog.test.tsx` renders the
  dialog for a 9.9 plan: the amount due reads `¥9.9`, no `$9.9` appears
  when balance payment is off, and the balance button is still there when it
  is on. Restoring the `$` formatter fails two of the three.
- `bun run typecheck`, oxlint and oxfmt on the changed files, and the
  wallet and subscriptions test suites (47 tests) pass.
