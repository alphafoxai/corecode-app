# Agent Note: Load console locales on demand instead of in the entry bundle

Status: implemented

## Problem

`web/src/i18n/config.ts` imported all seven locale files statically. Each is
0.5–0.8 MB, so 4.1 MB of the 5.26 MB entry chunk `index.js` was translations,
and every first visit downloaded 1.5 MB of gzip for that one file before the
console could render. Mainland China users reach the relay across a lossy
international link, so that download dominated their page load.

## Decision

`config.ts` registers a small i18next backend that maps each supported
language to `import('./locales/<file>.json')`. Each locale becomes its own
async chunk. i18next requests the current language and the `en` fallback, so a
Simplified Chinese visitor loads `zh` and `en`, an English visitor loads `en`,
and switching language loads the new file before `changeLanguage` resolves.

`config.ts` exports `i18nReady`, the promise from `init`, and `main.tsx`
renders after it settles, so the first paint is already translated. i18next
settles that promise on a failed load too; the console then renders keys as
their English source text instead of staying blank.

## Alternatives considered

- **`i18next-resources-to-backend`.** The same mapping as a dependency; the
  inline backend is eight lines.
- **Render immediately and let `useTranslation` suspend.** There is no
  Suspense boundary above the providers, and a first paint of English keys
  before the locale arrives is the flash this avoids.
- **Drop the `en` fallback for other languages.** 7,462 of 7,534 `en` values
  equal their keys, so it would save 109 KB gzip, but the remaining entries are
  plural and interpolation forms that other locales fall back to.
- **Drop the five locales CoreCode does not offer in the header.** They are
  upstream files and the profile page still lists them; lazy loading makes
  them free for everyone who does not pick them.

## Consequences

- First load for a `zhCN` visitor: `index.js` drops from 1,500 KB to 275 KB
  gzip, and the whole first load from about 1,955 KB to 1,044 KB.
- The locale request starts after `index.js` runs, adding one round trip
  before the first paint.
- `config.ts` diverges from upstream; an upstream sync that touches its
  imports or `resources` conflicts here.

## Verification

- `bun run build`: `index.*.js` is 1,055 kB (275 kB gzip), down from
  5,263.8 kB (1,500 kB gzip); the seven locales are separate async chunks of
  109–205 kB gzip.
- `bun run typecheck` passes. `bun run test`: 218 files, 2,513 tests pass; no
  test loads `config.ts`, which `src/test-setup.ts` replaces with its own
  i18next instance. Lint and format report nothing in the changed files.
- A Go binary built with this `web/dist`, run against SQLite, checked in a
  browser. With `zhCN`, only the `zh` and `en` chunks loaded and the first
  text in `#root` was Chinese; with `en`, only `en` loaded. Switching from EN
  to 中文 loaded the `zh` chunk and re-rendered the setup page in Chinese.
