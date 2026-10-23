# Agent Note: Reuse Go, Bun and Docker cache mounts across CI runs

Status: implemented

## Problem

A main push took about 8.7 minutes before the deploy job, and three caches were
missing or stale even when dependencies had not changed. Run `39890749089` shows
all three:

- **The image's Go build was cold every time.** The Dockerfile keeps the Go
  module and build caches in `--mount=type=cache` mounts, which live in the
  builder, and a hosted runner starts with an empty builder. The registry layer
  cache skipped `go mod download`, so `go build` downloaded 131 modules again and
  compiled every package from scratch: 77 to 83 s in each of the last three runs.
- **The check job's build cache froze.** `setup-go` keys its cache on `go.sum`
  alone and skips the save on a key hit, so the cache kept the state of the last
  dependency change.
- **`node_modules` was a 314 MB layer.** A registry cache hit on the separate
  `bun install` layer still pulled and unpacked it: 33 s, of which 26 s was
  unpacking.
- **The check job had no Bun package cache.** `bun install` downloaded 1196
  packages on every run (9 s).

## Decision

- **The publish job persists the cache mounts** with
  `reproducible-containers/buildkit-cache-dance`, pinned to the v3.4.0 commit,
  around one `actions/cache` entry under `RUNNER_TEMP`, which keeps it out of the
  build context. The key hashes `go.sum`, `web/bun.lock` and every `.go` file.
  A miss restores the closest earlier entry. An exact hit skips both the
  extraction and the save.
- **The check job replaces `setup-go`'s cache** with its own restore and save
  steps. Go modules and build output share one key, with the same rule. Bun's
  package cache is keyed on `web/bun.lock`. Pull requests only read the caches.
  Main and manual runs save a new entry when the key misses.
- **The Dockerfile installs and builds the console in one `RUN`.**
  `node_modules` stays in that step and never becomes a layer. The Bun cache
  mount, now persisted, makes the install fast.

## Alternatives considered

- **Build the Go binary on the runner and copy it into the image.** That reuses
  `setup-go`, but CI and a local `docker build` would then build the binary in
  two different ways.
- **Key the caches on the run ID.** Every main run would upload about 2 GB of
  cache. Keying on the inputs saves only when the content can differ.
- **Keep `node_modules` as a layer and only persist the Bun cache.** The layer
  pull, 33 s, was the cost, and persisting the Bun cache does not avoid it.

## Consequences

- The workflow now depends on a third-party action, pinned by commit, in the job
  that holds the Artifact Registry credential.
- A branch cannot verify the publish job. The workload identity provider's
  attribute condition rejects any ref other than main (run `39896814433`). The
  first main push fills the mount cache; the second one is the first that can
  show the gain.
- Actions caches count against the repository's 10 GB cache limit, which evicts
  the least recently used entries first. They are not Actions artifact storage.

## Verification

- `actionlint` v1.7.7 reports no findings for `.github/workflows/ci.yml`.
- `docker buildx build` of the new Dockerfile succeeds locally (Docker 29.8.2,
  arm64). The image serves the console bundle and `/api/status` returns 200.
  After a change under `web/`, the merged step reinstalled from the warm Bun
  cache in 7 s and finished the stage in 11.7 s.
- Manual runs on the branch exercised the check job. The cold run `39896814433`
  saved both caches (8 s and 7 s). The warm run `39897709519` restored both:
  `bun install` took 3 s instead of 9 s, and the job took 1m44s instead of
  3m17s. That warm run repeated the same commit, so every test result also came
  from the cache. A run that changes Go sources reruns the affected packages:
  `controller` alone takes 61 s.
- The publish job is unverified until two main pushes have run.
