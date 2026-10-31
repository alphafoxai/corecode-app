# Agent Note: Daily bars open at once, with no dead gaps

Status: implemented

## Problem

On 2026-10-31 the operator reported that hovering a day on the 充值记录 chart
(`/topups`, 每日充值金额) showed nothing. Each bar already had a tooltip, but it hid
behind two problems. First, the chart was not inside a `TooltipProvider`, so Base UI's
600ms default delay applied: a pointer that moved on within about 0.6s saw nothing.
Second, the space between bars was a flex `gap` on the list, outside every trigger, so
the pointer could stop on a pixel that belonged to no day. A 40-position pointer sweep
of the live chart opened 38 days. The miss at x=619 opened nothing within 3s.

The same pattern was in the customer dashboard's 14-day spend trend, in its cache hit
rate chart, and in the 30-day uptime strip on model details. Site insights' `BarSeries`
had already been fixed this way.

## Decision

Each of these charts now wraps its bars in `<TooltipProvider delay={0}>`, the same as
`BarSeries`, and moves the spacing from the list's `gap` into horizontal padding on each
trigger. The bars still look the same distance apart, but every pixel across the chart
now belongs to a day and opens it at once. Keyboard focus was already there and is
unchanged.

## Alternatives considered

- **Set `delay = 0` in the shared `Tooltip` root.** That would make every icon and
  help tooltip in the console open instantly. Those tooltips are meant to wait while the
  pointer passes over them on its way somewhere else.
- **One pointer-tracking overlay per chart.** That means a second implementation of
  hover, separate from the existing tooltips. Padding inside each trigger is enough to
  close the gaps.

## Consequences

- The stat-card `BarSparkline` gets no readout. It is `aria-hidden`, and no caller
  passes it values.

## Verification

- `topup-records-page.test.tsx` and `spend-trend-panel.test.tsx` cover three charts:
  the top-ups chart, the spend trend, and the uptime strip. Each test asserts the list
  carries no `gap-` class and each trigger carries the padding, then hovers a bar. The
  tooltip must appear within 200ms and must show that day's figures.
- With the component change reverted, all three tests fail. With the provider at 600ms,
  the top-ups test fails.
