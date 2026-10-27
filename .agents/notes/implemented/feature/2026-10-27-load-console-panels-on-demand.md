# Agent Note: Load settings panels, rich text and pricing details on demand

Status: implemented

## Problem

A cold console visit downloaded about 0.7 MB of brotli JavaScript before the
users page could render, and 1.3 MB for the pricing page. On a measured path of
roughly 25 KB/s from the mainland, that is 30–50 s. Code splitting was on, but
four static imports kept large code on every page:

- **Settings registries.** Each system settings route validates its section in
  `beforeLoad` against the ids in a `section-registry.tsx`, and the sidebar
  reads the same registries for its titles. Both run at startup. Every registry
  imported all its panels statically, so all 43 panels, with their forms and
  editors, were in the entry chunk.
- **The header's notification popover** renders `RichContent`, which imported
  `Markdown` (KaTeX, marked, DOMPurify): 0.6 MB of KaTeX on every console page.
- **The dashboard FAQ** imports `Markdown` directly, so KaTeX loaded there even
  when no answer contains math.
- **Pricing** imported `ModelDetailsDrawer` through the `components` barrel.
  The drawer pulls VChart (about 2 MB) through its charts and CodeMirror through
  its API examples, though it opens only when a model is clicked.

## Decision

- **Registries keep their ids and titles; panels load through `lazySection`**
  (`features/system-settings/utils/section-registry.ts`). `SettingsPage` wraps
  the section in `Suspense` with its existing loading message.
- **`RichContent` loads `Markdown` and `HtmlContent` lazily**, behind a
  `Suspense` with no fallback.
- **`Markdown` loads KaTeX and its stylesheet only when the text contains `$$`
  or a `math`, `katex` or `latex` fence** (`components/ui/markdown-katex.ts`).
  Until it loads, math renders as escaped code, and the component renders again
  once KaTeX is ready.
- **Pricing imports the drawer lazily**, and the barrel no longer re-exports
  `model-details`; the details page charts are lazy as well, so the standalone
  `/pricing/$modelId` page also defers VChart.
- **The ⌘K command menu and its header search button are removed.** They listed
  the same pages as the sidebar.

## Alternatives considered

- **Split each registry into an ids file and a panels file.** Routes would then
  import only ids, but the sidebar needs titles too, so the split would leave
  two lists to keep in step. Lazy panels inside the one registry leave nothing
  to synchronize.
- **Change the `vendor-ui-primitives` and `vendor-tanstack` cache groups from
  `chunks: 'all'` to `'initial'`.** The entry chunk fell from 295 KB to 195 KB
  brotli, but each page's total moved by under 3% either way, and the single
  vendor chunk is what a visitor keeps cached between pages and releases. The
  groups are unchanged.

## Consequences

Brotli JavaScript a cold visit downloads, counted from the build's chunk graph
(initial chunks, the authenticated layout's chunks and the route's own chunks):

| Page | Before | After |
|---|---|---|
| Entry chunks | 579 KB | 295 KB |
| Users | 723 KB | 471 KB |
| Pricing | 1297 KB | 471 KB |
| Dashboard | 720 KB | 473 KB |
| Usage logs | 749 KB | 515 KB |
| Wallet | 718 KB | 453 KB |
| API keys | 719 KB | 496 KB |
| Profile | 708 KB | 426 KB |

- Opening a settings section, a notification, a model's details or math in
  Markdown for the first time costs one extra chunk request.
- Channels (735 KB) still loads CodeMirror for its editors; it is an admin page
  and was left alone.
- The locale files (about 0.6 MB raw each, the current language plus `en`) and
  the start-up order that waits on them are not changed here.
- The polluted-prototype Markdown test now waits for KaTeX's output, so it still
  checks KaTeX rather than the code fallback.
