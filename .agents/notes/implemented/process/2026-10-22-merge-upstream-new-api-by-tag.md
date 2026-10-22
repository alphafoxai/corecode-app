# Agent Note: Take upstream new-api by merging its release tags

Status: implemented

## Problem

`corecode-app` began as a plain tree. Root commit `1897f73a5` copied the derouter
monorepo's `services/new-api` submodule without its history, so this repository
shared no commit with `QuantumNous/new-api`. A merge from upstream had no base:
git either refused it or, with `--allow-unrelated-histories`, treated every file
as a two-sided addition. GitHub does not mark the repository as a fork either,
and an existing repository cannot be turned into one, so the "Sync fork" path
was never available.

The submodule pointed at `alphafoxai/new-api@db76827` on its `derouter` branch.
That commit's tree is byte-identical to `1897f73a5`, and it sits six CoreCode
commits (N1–N5 and the theme) above upstream `633b4c5b1`, which is
`v1.0.0-rc.44` plus later fixes.

## Decision

- **One `-s ours` merge records the vendored commit as an ancestor.**
  `git merge -s ours --allow-unrelated-histories db76827` adds `db76827` as a
  second parent and keeps every file as it is. That claim is exact, because the
  root tree equals `db76827`'s tree. From then on, `git merge-base` with any
  upstream tag resolves to `633b4c5b1` or later, so only lines both sides changed
  conflict.
- **Upstream arrives by merging a release tag.** Fetch
  `https://github.com/QuantumNous/new-api.git` as the `upstream` remote and run
  `git merge <tag>` on a `chore/sync-upstream-<tag>` branch. A tag is a version
  upstream itself shipped, and the merge commit names it.
- **A sync pull request lands as a merge commit, never squashed or rebased.**
  A squash keeps the tree but drops the upstream parent, so the next sync falls
  back to the last recorded base and conflicts again on everything in between.
  The repository allows all three merge methods; this one is a rule, not a
  setting.
- **Upstream tags stay local.** `git push` without `--tags` sends only the
  branch. The upstream tags are reachable through the merged history and are
  not republished under this repository.
- **`gh` is pinned to this repository.** With a remote named `upstream`, the
  GitHub CLI resolves `upstream` as the base repository, so `gh pr create` and
  `gh run list` act on `QuantumNous/new-api`. `gh repo set-default
  alphafoxai/corecode-app` records the base in this repository's git config;
  scripts pass `-R alphafoxai/corecode-app` as well.

## Alternatives considered

- **Rebase the CoreCode commits onto `db76827` and force-push `main`.** It gives
  a linear history, but it rewrites a public default branch and breaks the
  commit references in merged pull requests and in `corecode-infra` image tags.
- **Cherry-pick selected upstream commits.** It needs no ancestry, but each sync
  becomes a manual selection, and fixes that build on skipped commits stop
  applying cleanly once upstream moves a few releases ahead.
- **Return to developing in `alphafoxai/new-api`.** That repository is the
  GitHub fork, but it is no longer what deploys, and keeping two trees means
  every change lands twice.

## Consequences

- The first sync, `v1.0.0-rc.46`, brings about 6,600 upstream commits into this
  public repository's history. Upstream is public under the same license, so
  nothing private is exposed.
- Where both sides changed the same lines, conflicts come back on each sync.
  `git config rerere.enabled true` in the sync checkout replays earlier
  resolutions. The recurring spots are the CoreCode branding in
  `web/index.html`, the i18n key lists, the token path that carries
  `UpstreamKey` (N1) and the administrator token route (N2), and the workflows
  upstream edits but this repository deleted.
- **A clean merge can still be wrong where code is positional.** In
  `v1.0.0-rc.46`, `model/token_cache.go` gained `AllowUserQuotaQuery` as the
  17th Lua argument while N1 had already put `UpstreamKey` there. Both sides
  moved the TTL from `ARGV[17]` to `ARGV[18]`, so git merged those lines without
  a conflict. The resolution numbers them 17, 18 and 19.
  Read every Lua `ARGV` list and every positional argument list a sync touches,
  not only the conflicted hunks.
- `alphafoxai/new-api` is redundant after the first sync. Archiving it is the
  maintainer's call.

## Verification

For the `v1.0.0-rc.46` sync: after the ancestry merge, `HEAD^{tree}` equals
`HEAD^1^{tree}`, and `git merge-base HEAD v1.0.0-rc.46` is `633b4c5b1`. The tag
merge auto-merged 291 files and conflicted in 13, all resolved on the sync
branch. On the merged tree `go vet ./...`, `bun run build`, `bun run test`,
and `bun run typecheck` pass. `go test ./...` passes except
`TestAdaptorMasksDialedHostsInDialFailure` in `relay/channel/advancedcustom`,
which fails the same way on an unmodified `v1.0.0-rc.46` checkout on the
same machine and is outside the packages CI tests.
