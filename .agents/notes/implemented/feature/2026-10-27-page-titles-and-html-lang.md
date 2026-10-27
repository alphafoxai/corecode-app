# Agent Note: Title the pricing pages and keep `<html lang>` on the interface language

Status: implemented

## Problem

Every console route had the same tab title, the site name from `/api/status`,
so search results and browser tabs for `/pricing` and `/pricing/<model>` read
"CoreCode". `index.html` declared `lang="en"` and nothing changed it, so a
Chinese page was announced as English to screen readers, browser translation
and search engines.

## Decision

- **`src/lib/document-title.ts` owns the title** as two parts, `<page> · <site>`.
  `main.tsx` sets the site part from the cached status and again after the
  network refresh; that refresh can land after a page has mounted, so writing
  `document.title` directly from both places would let it erase the page part.
- **`useDocumentTitle(title)`** sets the page part while the calling page is
  mounted and clears it on unmount. `/pricing` uses `Model Pricing`; a model
  page uses `<model> · Model Pricing`, both translated.
- **`<html lang>` follows i18next.** A `languageChanged` listener in
  `src/i18n/config.ts` writes `toIntlLocale(language)`, so `zhCN` becomes
  `zh-CN`. `index.html` says `zh-CN` for the first paint, matching its Chinese
  description and the main audience.

## Alternatives considered

- **TanStack Router `head` with `<HeadContent />`.** It would title every route,
  but the root layout does not render `HeadContent` today and a route's `head`
  runs outside React, so translated titles would not follow a language switch
  without more wiring. Two pages do not need it yet.

## Consequences

- Other routes keep the site name alone until they call `useDocumentTitle`.
- The static home page and docs are served by `corecode-infra`, which owns
  their titles and metadata (`scripts/site-seo.mjs` there).

## Verification

- `src/lib/__tests__/document-title.test.ts`: a site name set after the page
  part keeps the page part, and clearing the page leaves the site name.
- `src/i18n/html-lang.test.ts`: switching through all seven interface
  languages sets `zh-CN`, `zh-TW`, `en`, `fr`, `ja`, `ru` and `vi`.
- `bun run typecheck`, `bun run test` (237 files, 2,682 tests) and
  `bun run build` pass. `bun run lint`, `format:check` and `knip` report the
  same failures on `main`, none in the changed files.
- A production build served by `rsbuild preview` against corecode.live's API:
  `/pricing` read `模型定价 · CoreCode`, a model page
  `claude-opus-5-5 · 模型定价 · CoreCode`, going back restored the list title,
  `/sign-in` read `CoreCode`, and English gave `Model Pricing · CoreCode` with
  `lang="en"`.
