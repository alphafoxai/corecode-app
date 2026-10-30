# Agent Note: Gate new console lint findings against a baseline

Status: implemented

## Problem

`bun run lint` in `web/` reported 157 errors and 67 warnings, and no CI job ran
it. 152 of the errors and 64 of the warnings come unchanged from upstream: an
unmodified `v1.0.0-rc.47` checkout reports 155 errors and 66 warnings with the
same oxlint. Upstream does not lint its console in CI either. Three errors and
three warnings were CoreCode's own, in `features/invitations/index.tsx`,
`lib/localized-text.ts`, and two tests.

## Decision

- **Fix CoreCode's findings, leave upstream's.** Rewriting the 84 upstream files
  would put CoreCode edits on lines upstream keeps changing, and every tag merge
  (see `2026-10-22-merge-upstream-new-api-by-tag.md`) would conflict on them.
- **CI rejects only what is new.** `web/scripts/check-lint-baseline.mjs` counts
  oxlint findings by file and rule and fails when a count exceeds
  `web/lint-baseline.json`. The `web` job runs it as `bun run lint:check`.
  Counting by rule rather than by line keeps the baseline stable when upstream
  moves code within a file.
- **The baseline is refreshed on purpose.** After an upstream sync, or a change
  that removes findings, run `bun run lint:check -- --update` and commit the
  result. A sync that brings new upstream findings fails `lint:check` until then,
  which shows how much lint debt the tag added.

## Alternatives considered

- **Fix every finding.** About two thirds are auto-fixable, but the conflict cost
  recurs on each sync for no behavior change.
- **Run `bun run lint` in CI as is.** It fails on every commit until upstream is
  clean.
- **Lint only the files a pull request changes.** A CoreCode edit to an upstream
  file would then have to fix all of that file's upstream findings.

## Consequences

- A new finding in a file the baseline already lists for that rule passes if the
  same change removes one; the count, not the location, is guarded.
- The baseline records upstream's debt only. A file CoreCode adds starts at zero.

## Verification

After the fixes, oxlint reports 154 errors and 64 warnings, all also present on
`v1.0.0-rc.47`. `bun run lint:check` passes; adding a nested ternary to
`src/lib/localized-text.ts` makes it fail with
`eslint(no-nested-ternary) 0 -> 1`. `bun run format:check` passes. The affected
vitest files pass except `users/components/__tests__/quota-display.test.tsx`,
and `bun run typecheck` reports `src/components/page-transition.tsx:78`; both
fail the same way on `origin/main` without this change.
