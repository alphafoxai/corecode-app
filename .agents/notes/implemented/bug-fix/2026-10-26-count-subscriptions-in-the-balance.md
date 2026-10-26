# Agent Note: Count active subscriptions in the balance, and start new keys on a routed group

Status: implemented

## Problem

On 2026-10-26 three customers bought the ¥9.9 starter plan and reported "no
credit". Each order was paid and each subscription was active with $20. The
wallet page, the overview and the sidebar showed the wallet alone: "$0 ·
Balance depleted" in the largest type on the page, with the plan's $20 in a
smaller card beside it. One of the three had already spent $1.81 from the plan
without trouble.

The same day, four of the new customers' keys sat in a group with no channel.
Production sets `DefaultUseAutoGroup` with `AutoGroups = ["Claude 满血"]` but
does not offer `auto` to users. The create form started on `auto`, then either
stayed blank (the token falls back to the user's `default` group) or was
corrected to `default`. Every request on those keys would fail.

## Decision

- `useBalanceStatus` reads the user's active subscriptions and adds what they
  have left to the wallet. Health, runway and the shown amount use the sum. A
  subscription with no total is unlimited and never reads as depleted. The
  wallet card and the overview card add "Includes $X left on your plan".
- When the create form cannot use `auto`, it starts on the first Auto group,
  and the group correction prefers that group over `default`.

## Alternatives considered

- **Leave the wallet figure alone and only enlarge the plan card.** The
  depleted badge, the sidebar warning and the overview alert would still fire
  for a customer who can spend.
- **Give `default` a channel.** That changes routing and pricing for every
  user and every blank key; it is an operator decision, not a console fix.

## Consequences

- `billing_preference = wallet_only` still shows the plan's remainder even
  though requests will not draw on it. No customer uses that preference today.
- Keys created by API with a blank group are unchanged.
