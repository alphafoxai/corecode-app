# Agent Note: The customer overview is built around connecting Claude Code

Status: implemented

## Problem

The overview at `/dashboard/overview` was upstream new-api's operator page. It
showed a setup guide with an OpenAI `curl` to `/v1/chat/completions` using
`gpt-4o-mini`, a request CoreCode refuses because its keys accept only Claude
Code. It also showed three summary cards and three content panels. On
production the API-info, announcements, FAQ and uptime panels render empty
boxes reading "not configured" unless the operator fills them. A customer had
to find the setup snippet in `/docs/`, copy their key from a row menu on
`/keys`, and paste the two together themselves.

The highest-ranked relays on apiranking.com, most of them sub2api, put the
connection steps and the key on the same screen, and rank providers on billing
accuracy and cache hit rate. Both are things a customer cannot easily check
from new-api's console.

## Decision

- **One component explains how to connect.**
  `web/src/features/keys/components/client-setup-guide.tsx` shows the snippets
  from `/docs/#claude-code` with the customer's key filled in:
  settings.json, macOS/Linux, Windows, CC Switch and Magpie.
  `features/keys/lib/client-setup.ts` builds them and strips a trailing `/v1`
  from the base URL, because Claude Code then requests `/v1/v1/messages`. The
  overview embeds the component, and each enabled row on `/keys` opens it in a
  dialog (the "Connect Claude Code" icon).
- **The screen shows a masked key; the clipboard gets the real one.** The copy
  button calls `POST /api/token/:id/key` and copies the snippet with the full
  key. If that call fails, nothing is copied. The full key is cached in the
  query client for five minutes and never written to the DOM.
- **The overview leads with what a customer acts on.** In order:
  - balance with a runway estimate (the average of the last seven days that
    had any spend);
  - the setup guide;
  - today's spend and requests;
  - cache hit rate and average time to first token over the last 100 requests;
  - a 14-day spend chart and the six latest requests.

  Announcements, FAQ and uptime render only when the operator has filled them.
  Admins still see the performance panel at the end.
- **Cache hit rate follows the billing semantics in the log.** Anthropic usage
  excludes cached tokens from `prompt_tokens`, so the denominator there is input
  plus cache read plus cache write. OpenAI-shaped usage already includes cached
  tokens in `prompt_tokens`. `features/dashboard/lib/customer-overview.ts` owns
  the rule. The grade thresholds are 80% and 50%, because a sticky Claude Code
  session normally re-reads most of its context from cache.
- **The balance stays visible everywhere.** `components/layout/components/sidebar-balance.tsx`
  adds a footer to the sidebar that links to `/wallet` and turns red at zero.
- **Motion and type follow the Claude Design System notes.** The notes are in
  `Caho1/open-claude-ui`. `styles/corecode-brand.css` sets every
  `transition-*` utility to a 160 ms swift ease-out, uses grayscale
  antialiasing in dark mode, and tints text selection with the brand color.
  The palette already came from the same source and is unchanged.

## Alternatives considered

- **Open the guide right after a key is created.** `POST /api/token/` does not
  return the new token's id, so the console cannot look up the key it just
  made without a backend change. A permanent row action reaches the same place
  in one click and also works for keys created earlier.
- **Draw the spend chart with VChart, as `/dashboard/models` does.** Fourteen
  bars need no axes or legend. Plain elements follow the theme tokens with no
  chart theme, and give each bar a focusable, labelled target.
- **Keep the API-info panel.** It lists the same base URL the guide already
  shows, and production's second entry (`/v1/models`) does not help a customer
  connect.

## Consequences

- The `api_info` option no longer appears on the customer overview. The
  "API Addresses" popover on `/keys` still reads it.
- The runway and cache figures are estimates from recent data. A customer with
  fewer than 100 requests sees a rate based on what exists, and the note under
  the figure gives the sample size.
- Adding a client (Codex, Cursor) means adding a target to
  `CLIENT_SETUP_TARGETS` and a branch in `buildClientSetupSnippet`. CoreCode
  keys accept only Claude Code today, so no other client is listed.

## Verification

- `bun run typecheck`: passed.
- Vitest:
  - `features/keys/lib/__tests__/client-setup.test.ts`
  - `features/keys/components/__tests__/client-setup-guide.test.tsx`
  - `features/dashboard/lib/__tests__/customer-overview.test.ts`
  - `features/dashboard/components/overview/__tests__/overview-dashboard.test.tsx`

  33 new cases, all passing. The full suite has one failure,
  `usage-logs/.../detail-preview.test.tsx`. It fails the same way on
  `origin/main` without this change and passes when run alone.
- `bun run lint`: no findings in the changed files. Earlier errors elsewhere in
  the tree are unchanged.
- Checked in a browser against a local SQLite instance seeded with 420 requests:
  - light and dark themes at 1440 px;
  - 390 px wide, with no horizontal scroll;
  - the setup dialog on `/keys`.
