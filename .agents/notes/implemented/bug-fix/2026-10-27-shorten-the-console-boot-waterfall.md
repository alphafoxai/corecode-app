# Agent Note: Shorten the console's boot waterfall

Status: implemented

## Problem

From mainland China, the console at `/console` reached a usable dashboard about
7 s after navigation with a cold cache, even after the edge switched to BBR
(corecode-infra `2026-10-27-bbr-on-the-edge`). The browser timeline showed four
serial phases:

1. The entry scripts and CSS, about 340 KB with brotli.
2. The locale chunks, because `main.tsx` renders only after `i18nReady`:
   `zh.json` at 139 KB and the `en` fallback at 89 KB with brotli.
3. The root and `/_authenticated` guards (`/api/setup`, the session refresh),
   which the router starts only once it mounts.
4. The route code for `/dashboard/overview`, about 220 KB, which the router
   also requests only after it mounts.

Two of those costs are avoidable. Translation keys are the English source
text, and i18next renders a missing key as the key itself, so in `en.json` only
72 of 8,085 entries change what is shown. The route code does not depend on the
locale, so it can download while the locale does.

## Decision

- **English overrides only.** `config.ts` imports `./locales/en.json?overrides`.
  An Rspack rule runs `web/scripts/i18n-en-overrides-loader.cjs` on that
  request, which keeps only the entries whose value differs from the key. The
  English chunk falls from 568 KB to 6.5 KB. `en.json` stays complete on disk,
  so `bun run i18n:sync` and the other locales are unchanged.
- **Fetch route code while the locale loads.** `main.tsx` resolves the legacy
  redirect, maps `/dashboard` to its default section, and calls
  `router.loadRouteChunk` for each matched route. It runs from a zero-delay
  timer queued after i18next's, so the locale request goes first on the
  connection. It skips protected routes when no session hint cookie is
  present, since those redirect to sign-in.

## Alternatives considered

- **`router.preloadRoute` to run the guards early as well.** A redirect thrown
  with `href`, as the root guard's legacy redirect and the signed-in sign-in
  page do, is passed back to `preloadRoute`. That calls `buildLocation`, which
  ignores `href` and builds the current location again, so the same guard
  throws again and the preload recurses.
- **Drop the `en` fallback for other languages.** It changes what a key
  missing from one locale renders, so this change kept the fallback. It
  shipped later, on top of the overrides, in
  `../feature/2026-10-28-overlap-console-boot-requests.md`, with
  `locales.test.ts` requiring every locale to carry every `en` key. The
  overrides now serve English visitors and languages the console does not
  offer.
- **A generated `en.overrides.json` beside the locales.** `sync-i18n.mjs`
  treats every JSON file in `locales/` as a locale, and a generated file can
  drift from `en.json`.

## Consequences

- An entry added to `en.json` with a value equal to its key costs nothing at
  runtime; one whose value differs ships in the overrides chunk.
- A signed-in visitor whose route redirects elsewhere downloads that route's
  code without using it.
- `preloadCurrentRouteCode` knows that `/dashboard` redirects to its default
  section. Another redirect-only index route gets the parent's code only.

## Verification

- `src/i18n/en-overrides.test.ts` renders every `en.json` key in `en` and
  `zhCN` with the full English bundle and with the overrides, and requires
  identical output. Removing the dotted keys from the overrides made it fail on
  `auth.resetPasswordConfirm.backToLogin`.
- `bun run typecheck`, `bun run format:check` and the full `bun run test`
  passed; oxlint reported nothing on the changed files.
- A/B in a signed-in browser on 2026-10-27: CDP `Fetch` served `/console` and
  `/static/*` from the production build or from this build, through one
  simulated link (200 ms round trip, 150 KB/s shared, close to the edge with
  BBR), with `/api/*` going to production. Two loads each:

  | Milestone | Production | This change |
  |---|---|---|
  | Locale ready (`/api/setup` sent) | 4.83–4.85 s | 4.16–4.17 s |
  | Dashboard mounted (`/api/data/self` sent) | 6.70–7.21 s | 5.53–5.55 s |
  | Last static file | 7.15–7.66 s | 5.99–6.00 s |

  Both rendered the Chinese overview with no exceptions or console errors.
