# Agent Note: Readable site insights

Status: implemented

## Problem

The root-only `/site-insights` page had the figures an operator needs, but
reading them took work. On 2026-10-28, against production:

- **No figure had a reference.** Every tab opened with six equally weighted
  cards and no earlier period or threshold to compare against, so 25,446
  requests or a 2% failure rate could not be judged good or bad.
- **Color did not mean one thing.** Amber marked good news (54 activated),
  neutral figures (balances owed) and bad news (81 limit rejections); green
  marked both a 2% failure rate and "0 need attention".
- **Figures misread.** A model with no time-to-first-token reading showed
  `0ms / 0ms`. A model with 10 requests weighed as much as one with 33,000.
  Funnel cells packed a count and a rate into `30 · 14.2%`. Every pool group
  repeated `5h 90% · 7d 98%`.
- **Charts lacked axes.** Bars had only a max and a zero label and only the
  first and last dates; 168 hourly bars had no day boundaries; dollar labels
  overlapped.
- **Structure.** Capacity repeated the pool tab's totals. Eight tabs sat in
  one row with names (体验, 业务, 活跃) that did not say what they held.
  Panel subtitles were formulas, not findings. The risk tab listed the
  operator's own account among shared addresses.

## Decision

- **An overview tab opens the page** (`components/overview-tab.tsx`). It reads
  the capacity, pool, quality, finance and risk views, the same queries those
  tabs use, and the previous period of quality, finance and risk. It shows
  headline figures and a "needs attention" list: each signal names the tab
  that explains it. Signals fire at the thresholds the tabs color by, kept in
  `lib.ts` (`failureTone`, `SMALL_SAMPLE`, `DEBT_ALERT_USD`, `ATTENTION`) so
  a signal always matches a colored figure. The debt line is -$1, matching
  corecode-infra's negative-balance alert.
- **Every ranged view is also read for the period before it**, the same length
  and ending where the current one starts, and the figures that are flows
  (requests, revenue, consumption, sign-ups, rates, latency) show the change.
  Shares change in percentage points; a figure that more than doubled shows
  as a multiple (×8.6), because the site's first weeks otherwise produce
  four-digit percentages. Cohort figures (activated, paid) get no delta: an
  older cohort has had longer to convert, so the comparison would mislead.
- **One color meaning.** Red needs action, amber needs a look, a figure that
  is merely fine is uncolored, and green marks only a change for the better.
- **Hierarchy.** Each tab leads with one featured card, wider, with a
  sparkline of the figure over the range; the other cards are fewer, with
  minor figures moved into hints. The sparkline answers hover, and focus with
  the arrow keys, with a guide, a dot and the point's date and value: a line
  that looks readable but says nothing when pointed at was the first thing
  the owner reported after release.
- **Panels state a finding** in their subtitle ("最高 10，出现在 10/26 21:34，
  占账号池 70 个并发的 14.3%"), and definitions move behind a `?` icon
  (`Panel.help`).
- **Charts** (`BarSeries`) round the value axis to even steps with gridlines,
  label up to seven points on the time axis (each bar when there are 14 or
  fewer, with its total above it), mark day boundaries in hourly series, use
  compact currency on axes, and draw remainder series grey (`muted`).
- **Tables** drop to 40 px rows with muted headers, fade rows under 100
  requests (`SimpleTable.faded`), split counts from rates (`CountRate`), show
  `—` for an unmeasured duration, color failure rates by threshold, and show a
  pool group's budget only where it differs from the pool default.
- **Tabs are grouped and renamed**: 概览 | 运维: 容量, 账号池, 服务质量 |
  经营: 资金, 增长, 活跃与留存, 模型与推广 | 风控. The pool tab shows "实时 ·
  每 15 秒刷新" in place of the range buttons. Capacity keeps one line of pool
  totals with a link to the pool tab.
- **The viewer's own account is left out of shared addresses**, and an address
  left with one account is not listed.
- **Currencies stay as they are paid.** Revenue is in CNY and consumption in
  USD at list price; cards and charts label the unit instead of converting.

## Alternatives considered

- **Convert everything to CNY.** The site sells $1 of credit for ¥1 while
  `USDExchangeRate` is 6.8, so there are two defensible rates and either one
  would put a made-up number on the card. The ratio card keeps "revenue per
  list-price dollar" and says so in its help.
- **Compute deltas on the server.** The view endpoints already take any range,
  and the previous period is one more request started at the same time, so
  the comparison adds no round trip to the chain. It doubles the server's
  work per tab open; previous-period results stay fresh for five minutes and
  do not refetch on the capacity and pool intervals.
- **A summary endpoint for the overview.** It would duplicate five views'
  logic. Reading the views keeps one definition per figure, and their cached
  results make the next tab open instantly.
- **A chart library.** `@visactor/vchart` is installed, but the tabs' bars,
  tooltips and keyboard focus already live in `BarSeries`; axes and gridlines
  were the missing part.

## Consequences

- Opening the page runs the capacity (about 0.5 s), quality (about 0.35 s) and
  finance, risk and pool reads together, plus three previous-period reads.
  Before, it ran capacity alone. The page is root-only, so this is one
  operator's load.
- The overview refreshes capacity every 30 s and the pool every 15 s, as their
  tabs do.
- Thresholds are fixed in code; changing one changes the tab's color and the
  overview's signal together.

## Verification

- `readability.test.tsx` covers the delta colors, points and multiples, the
  rounded value axis, segment labels, faded rows, and the overview's empty
  state and danger-first ordering; the existing pool-tab and simple-table
  tests pass.
- `bun run typecheck`, oxlint on the feature, and `bun run i18n:sync` passed.
- Viewed in a browser against production data through a local dev server; the
  overview listed debt, shared plan buyers, pool-full 429s, limit rejections,
  claude-haiku-5-5 at 7.4% failures, and alias emails, each matching the
  colored figure in its tab.

## Addendum: definitions open on a click too

The owner reported that the dotted labels showed nothing. Their definitions were
tooltips: a tooltip opens on hover and focus only, closes on a click, and never opens
on a touch screen, so clicking a label to read it closed what was there, and a tap did
nothing. `HelpLabel` and `HelpIcon` now open a popover that also opens on hover (150 ms)
and stays open after a click or tap until the reader clicks elsewhere or presses
Escape. The trigger is a button, and the popover names the figure above its
definition. Value readouts on charts and meters stay tooltips: they follow the pointer.

The funds view's figures that had no definition gained one: revenue, Claude's six
figures, the account tables' columns, the vendor figures, and each wallet credit row.

`help-label.test.tsx` covers hover, click-and-leave, Escape, keyboard and a plain label.
In a browser against production data, gliding the pointer opened all twelve checked
definitions, a click held one open after the pointer left, and an emulated tap opened
one on a 390 px screen.
