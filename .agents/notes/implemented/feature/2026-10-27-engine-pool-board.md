# Agent Note: Show the whole engine pool on the root dashboard

Status: implemented

## Problem

The capacity view's pool panel listed 4 of the engine's 9 accounts. It read
`/api/home/subscription-accounts`, the engine home page's summary, which
returns only some accounts. The engine's own capacity page
(`/group-concurrency`) shows every group and account, but it is served on
the relay's private port behind its own login, so the operator had to open
a tunnel to see it.

## Decision

- **Read `/api/group-concurrency` and `/api/group-concurrency/pool-estimate`,**
  the endpoints the engine's capacity page uses, over the same compose
  address and control key (`EngineControlURL`, `EngineControlKey`). The app
  stops reading `/settings`, `/groups` and the home summary.
- **A new root-only `pool` tab** (`GET /api/site-insights/pool`, PAT scope
  `ops:read`, refreshed every 15 seconds) shows:
  - schedulable accounts, slots, in-flight requests, accounts needing
    attention, and the pool estimate's 5-hour and 7-day dollars left;
  - each group's schedulable and total accounts, in-flight requests against
    its limit, slots and quota budget;
  - each account's status, in-flight requests and sessions, 5-hour and
    7-day usage with dollars left and reset time, spend per hour, and
    successes and failures over 24 hours with the last failure. Accounts
    can be filtered by group and to those not schedulable.
- **An account is eligible when the engine marks it available and its group
  is enabled;** the engine already marks accounts over a quota budget.
  Slots add up, per enabled group, eligible accounts times the per-account
  limit, capped by the group limit.
- **Emails are masked in the app** (`b***@example.com`) before they reach the
  browser; the engine returns them in full.
- **The tab is read-only.** Group limits, budgets and routing stay in the
  engine's console.
- The capacity view keeps a pool summary with a link to the tab. The
  response keeps every field the released console reads.

## Alternatives considered

- **Proxy or embed the engine's page.** It has its own login and frontend;
  exposing it through the app would expose its write actions too.
- **Page through the home summary.** It is a summary by design, not a list
  of every account.

## Consequences

- The dashboard depends on the shape of two engine endpoints; a change
  there shows as an error in the tab while the rest of the dashboard works.
- Usage is in percent here, converted from the engine's fractions.

## Verification

- `TestFetchEnginePool` serves both endpoints from a fake engine: every
  account of every group, eligibility with a cooling account and a disabled
  group, slots capped by a group limit, masked emails, activity, and
  estimate dollars joined by account.
- `go test ./router/ ./middleware/ ./service/ ./controller/` passes,
  including the PAT route-coverage test.
- `bun run typecheck`, `oxlint` and `oxfmt` on the feature.
- End to end: a local build read real responses captured from the relay's
  engine, replayed by a local stub. The tab showed 6 groups, 9 accounts,
  8 schedulable and 40 slots, as the engine's page does, and the group
  filter narrowed the table.
