# Agent Note: Accept `?ref=` as an invitation code

Status: implemented

## Problem

Invitation links carry the code as `?aff=CODE`. Some channels share links in the
`?ref=CODE` form, for example `https://corecode.live/sign-in?ref=magpie`. The
console ignored `ref`, so a user from such a link signed up with no inviter, and a
retail channel's invitee missed the sign-up gift plan.

## Decision

- `captureAffiliateCodeFromUrl` reads `aff`, or `ref` when `aff` is absent or
  empty. `aff` wins when a link carries both.
- The root route and the password sign-up form call it instead of reading `aff`
  themselves, so every page that read `?aff=` now also reads `?ref=`. Each
  reader truncates to the server's 32-character limit.
- The server is unchanged: the console still sends the stored code as `aff`.
- The links the console generates keep `?aff=`.

## Alternatives considered

- **Redirect `?ref=` to `?aff=` in Caddy.** Every console route would need the
  rewrite, and the console would still ignore `ref` when served by any other
  front.
- **Let `ref` fill only an empty stored code.** Then `aff` would replace a stored
  code and `ref` would not, so which code binds would depend on the parameter's
  name. Both follow the latest link.

## Consequences

- A `?ref=` added by another site, for example `?ref=producthunt`, replaces a
  stored code, exactly as a second `?aff=` link already does. A code that matches
  no inviter binds no one.
- Caddy sends every `/` with a query string to the console, so `/?ref=CODE` is
  captured. `/en/` is served statically whatever the query, for `aff` and `ref`
  alike.

## Verification

- `magic-link.test.tsx` covers `?ref=magpie` prefilling and sending the code,
  and `?ref=` with `?aff=` keeping the `aff` value. The test fails with the
  `storage.ts` change reverted.
- `vitest run src/features/auth` passes (122 tests). `bun run typecheck`,
  `bun run format:check` and oxlint on the changed files pass.
