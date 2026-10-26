# Agent Note: Show the balance on the CC Switch card right after import

Status: implemented

## Problem

The console's "Import to CC Switch" deep link created a provider card with no
usage script. CC Switch shows a balance on the card only when the link carries
one, so a customer who clicked "Open CC Switch" saw a provider with no balance
and had to open the console to learn how much credit was left.

## Decision

- **`buildCCSwitchURL` adds `usageScript`, `usageEnabled=true` and
  `usageAutoInterval`.** The script is Base64 of UTF-8 text, as CC Switch's
  [site integration guide](https://github.com/farion1231/cc-switch/blob/main/docs/guides/deeplink-site-integration-guide-zh.md)
  specifies. `usageEnabled` is for versions before 4.0.10, which only start a
  script when it is set. Every app the dialog offers gets the same script.
- **The script calls `GET /api/usage/token/` with the `sk-` key.** That
  endpoint already authenticates by key, so the link carries no access token or
  user id. The URL is `{{baseUrl}}` with a trailing `/` and `/v1` removed,
  because the Codex endpoint carries `/v1` and the route is outside it. It
  stays on the provider's origin, which CC Switch requires.
- **What the card shows**, in order:
  1. `data.user_quota`, the account balance, when the key has
     `allow_user_quota_query`.
  2. The key's own quota when the key is not unlimited.
  3. Otherwise no balance, and an `extra` line that names the console switch
     "允许查询用户额度". The key is valid, so `isValid` stays true.
  An error body (`success: false` or no `data`) marks the card invalid with the
  server's message.
- **Quota is divided by 500000 and shown as USD.** One quota unit is the
  console's display unit; the site bills 1 CNY as 1 USD of quota. The
  constant is written into the script because CC Switch's sandbox cannot read
  `/api/status`.
- **The refresh interval is 10 minutes.** Each customer polls our API at that
  rate, and `/api/usage` sits behind `CriticalRateLimit` (20 requests per 20
  minutes by default). 10 minutes uses 2 of those per customer, leaving room
  for manual refreshes and for several customers behind one address.
- **The two cache-miss explanations link to `/docs/cache/#auto-mode`.** The
  overview alert and the non-streaming branch of `CacheMissTooltip` reuse the
  existing "Learn more" string, so no locale file changes. The link opens in a
  new tab because the docs are a static page outside the console's router.

## Alternatives considered

- **`usageAccessToken` plus `/api/user/self`.** It is what the guide shows for
  New API sites, but it puts a system access token, which can do far more than
  an API key, into a link.
- **Fetching `quota_per_unit` at link time.** The ratio is fixed for this
  deployment; a runtime read would add a request for no change.
- **A 5-minute interval.** Faster, but 4 of the 20 allowed requests per
  window for every customer.

## Consequences

- A key with "允许查询用户额度" off and unlimited quota shows a plan name and a
  hint instead of a balance. New keys default to the switch being on (the
  console form and the create API both default to true), so this is the case
  of a key edited or created with the switch off.
- The script text is part of the link, so changing it changes what CC Switch's
  confirmation dialog shows. Customers see the full script before importing.
- `/docs/cache/#auto-mode` is served by the docs site, not this repository. If
  that anchor is renamed, both links land at the top of the page.

## Verification

- `bunx vitest run src/features/keys src/features/usage-logs src/features/dashboard`
  decodes the Base64 script from the generated link and runs its extractor on
  an account-balance, a limited-key, an unlimited-key and an error response.
- `bun run typecheck`, and `bun run lint` and `bun run format:check` on the
  changed files.
