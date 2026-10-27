# Agent Note: Mark the console's not-found screens noindex

Status: implemented

## Problem

The server answers every console path with the app shell and status 200 (`router.NoRoute` serves `index.html`). An unknown path such as `/no-such-page`, or an unknown model at `/pricing/<name>`, therefore renders a "not found" screen that search engines see as a normal 200 page: a soft 404, which can be indexed.

## Decision

- **`useNoIndex(active)`** adds `<meta name="robots" content="noindex">` while `active` is true and removes that same element when it turns false or the caller unmounts, so client-side navigation to a real page leaves no tag behind and a tag the page shipped with is never removed.
- **`NotFoundError`** (the root `notFoundComponent` and `/404`) calls it and titles the tab `404 · <site>` through `useDocumentTitle`.
- **`ModelDetails`** calls it once pricing has loaded and the model name matches nothing.

This is the second strategy in Google's guidance for client-rendered apps (developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics, "Avoid soft 404 errors in single-page apps"): add `noindex` to error pages from JavaScript.

## Alternatives considered

- **Return 404 from the server for unknown paths.** The server would need the console's route table, which ships separately (the console releases without a server restart), and dynamic segments such as `$modelId` can only be judged after data loads.
- **JavaScript redirect to a path the server answers with 404.** Also in Google's guidance, but it changes the URL the visitor sees and needs a server route.

## Consequences

- Crawlers that do not run JavaScript still see a 200 app shell for unknown paths; `corecode-infra`'s `robots.txt` already disallows the console's signed-in routes, and the indexed pages are the static site.
- Other client-side "not found" states would need the same hook.

## Verification

- `src/hooks/__tests__/use-no-index.test.tsx`: the tag appears while active, goes away when inactive and on unmount, and a pre-existing robots tag is left alone.
- `bun run typecheck`, `bun run test` (238 files, 2,683 tests), `bun run build`. Lint reports nothing in the changed files.
- Production build under `rsbuild preview` against corecode.live's API, in a browser: `/no-such-page` had `noindex` and title `404 · CoreCode`; after its home button (client-side navigation) the tag was gone; `/pricing/no-such-model` had `noindex`; `/pricing/claude-opus-5-5` had none.
