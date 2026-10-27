# Agent Note: Fail CI when a Go test fails

Status: implemented

## Problem

The `check` job ran `go test … 2>&1 | tail -40` under `set -eu`. Without `pipefail`, a pipeline's status is its last command's, and `tail` exits 0, so a failing Go test left `check` green. corecode-infra's `release-app.yml` deploys a main commit once `check` and `web` pass, so a failing test would not have stopped a release. The gap was found on 2026-10-27 while reviewing PR #77. corecode-engine fixed the same pattern on 2026-10-21.

## Decision

The step that vets and tests the Go module runs under `set -euo pipefail`, so `go test`'s exit status fails the step. The output is still trimmed to the last 40 lines.

## Alternatives considered

- Dropping `| tail -40` would also propagate the status, but a failing run then prints the full test output. The trimmed output was chosen so the end of the log, where Go prints failures, stays readable.
- Setting `shell: bash` on the step would add `-o pipefail` implicitly. That is invisible to someone reading the script and lost when the step is copied.

## Verification

`bash -c 'set -euo pipefail; false | tail -1'` exits 1, and the same command under `set -eu` exits 0. On 2026-10-27 the test set passed locally on the commit under PR #77, so the stricter step is not expected to turn main red.
