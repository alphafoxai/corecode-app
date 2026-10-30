# Agent Note: Type-check the console in CI

Status: implemented

## Problem

The `web` job builds with rsbuild, runs the lint baseline and the first-load budget.
None of them type-checks: rsbuild transpiles TypeScript without checking it, and the
tests import the files they cover but not `src/main.tsx`. Raising
`@tanstack/react-router` from 1.170.18 to 1.170.46 while bumping dependencies past
security advisories built, passed all 2776 tests, and stayed under the first-load
budget. In 1.170.46, `router.getMatchedRoutes()` returns a tuple. `src/main.tsx`
destructures it as `{ matchedRoutes }`, gets `undefined`, and throws on `.some()`
before the first render. `bun run typecheck` reported the error (TS2339). A merge to
main deploys the console without further approval, so CI would have shipped it.

## Decision

- **The `web` job runs `bun run typecheck`** after the build. It is `bun check -b`,
  the project's own build-mode check over every tsconfig reference. It is not
  `bunx tsc`: `web/` has no `tsc`, so `bunx` fetches and runs the unrelated npm
  package of that name and prints nothing (lesson
  `run-the-typecheck-script-not-bunx-tsc` in corecode-infra).
- **The check covers upstream's files too.** Unlike lint, the whole console
  type-checks clean on main, so there is no baseline to keep.

## Alternatives considered

- **Leave typecheck to authors.** `web/AGENTS.md` already asks for it before a
  release. A Dependabot pull request has no author to run it, and once
  version updates are enabled, those pull requests carry exactly this risk.

## Verification

- `bun run typecheck` on `origin/main`: no type errors in 1,581 files. With a
  planted `const planted: number = 'a'` under `src/`, it fails with TS2322.
- The same command with `@tanstack/react-router` 1.170.46 locked: TS2339 and TS7006
  at `src/main.tsx:128-129`. `bun run build` and `bun run test` both pass on that tree.
