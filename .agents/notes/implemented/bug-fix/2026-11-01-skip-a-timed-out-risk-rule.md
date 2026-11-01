# Agent Note: Skip a timed-out risk rule and keep checking the rest

Status: implemented

## Problem

The structured risk policy (`../feature/2026-10-28-risk-gate.md`) runs each
operator regex in JavaScript with a 200 ms bound per call. When a call ran
past the bound, `pkg/riskpolicy` returned at once:

- a hard rule that timed out skipped every later hard rule;
- a distillation pattern that timed out skipped the rest of the distillation
  stage and every hard rule.

`CheckRiskGate` records that fault as `fail_open` and lets the request
through. A customer who can make one early rule backtrack, for example with a
long repetitive text, therefore passes every rule after it. Production
recorded four such faults from 2026-10-28 to 2026-11-01: two on
`vm2api.jailbreak.05` (stage `hard_regex`) and two on the distill-tagged hard
rule `vm2api.distill.16` (stage `distill`). Each one meant the later rules
never saw the request.

## Decision

- **A rule whose regex fails is skipped, and the next rule runs.** This
  applies to distillation patterns, the contest pattern and hard rules. A
  hit after a skipped rule is reported as usual, so it blocks in enforce
  mode. A fault in the distillation stage no longer stops the hard rules.
- **The fault is still reported when nothing hits.** `Evaluate` returns the
  first fault as a `*StageError`, so `CheckRiskGate` keeps writing the
  `fail_open` event that names the first timed-out rule, and the verdict is
  still not cached as clean.
- **The runtime's interrupt is cleared after a timeout.** A moejs interrupt
  that arrives while nothing runs stops the next call on that runtime, and the
  timer can also fire just after a call returns. `regexSession.call` now calls
  `ClearInterrupt` whenever the timer fired, so the same session can run the
  next rule. Without it, a rule after a timed-out rule in the same session
  fails too.

Rule order, the first-hit-wins verdict, client exemptions and every other
vm2api parity behavior are unchanged.

## Alternatives considered

- **Treat a timeout as a block in enforce mode.** A slow regex is an
  operator's rule fault, not evidence against the customer, and the
  2026-10-28 decision is that a gate fault never rejects a request.
- **Raise the bound.** Backtracking grows exponentially with the text, so a
  longer bound only needs a longer text, and every rule costs more on every
  request.
- **Cap the scanned text.** That changes what the rules see and so breaks
  parity with vm2api, and a short text can still backtrack badly.

## Consequences

- A request that times out several rules costs up to 200 ms per timed-out
  rule. Before, it stopped at the first one. The cost is bounded by the
  number of rules, and the rules that time out are the ones an operator
  should fix.
- `fail_open` events now mean "nothing matched and at least one rule could
  not run", not "the gate stopped at this rule".

## Verification

- `TestRegexFaultCarriesStageAndIsNotCached` is a table of seven cases on a
  4,000-character `abab…` text against `(\w+)+\1x`: a later hard rule after a
  hard timeout, after a distill hard-rule timeout and after a pattern timeout,
  and a later pattern after a pattern timeout, all hit; a timeout alone
  returns a `StageError` with the right stage, twice, so it is not cached.
  The four hit cases fail on `origin/main` and pass with the change. With the
  `ClearInterrupt` line removed, the three cases that continue in the same
  session fail.
- `go test -race ./pkg/riskpolicy -count=1` passes.
  `go test ./service/ -run RiskGate -count=1` passes, including
  `TestRiskGateStructuredPolicyFaultsFailOpen`. `go vet ./pkg/riskpolicy` and
  `gofmt -l pkg/ service/` report nothing. `go build ./...` passes with a
  placeholder `web/dist/index.html`, since the console is not built here.
