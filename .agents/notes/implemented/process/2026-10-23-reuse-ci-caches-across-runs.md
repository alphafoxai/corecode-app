# Agent Note: Reuse Go, Bun and Docker cache mounts across CI runs

Status: implemented

## Problem

A main push took about 8.7 minutes before the deploy job, and three caches were
missing or stale even when dependencies had not changed. Run `39890749089` shows
all three:

- **The image's Go build was cold every time.** The Dockerfile keeps the Go
  module and build caches in `--mount=type=cache` mounts, which live in the
  builder, and a hosted runner starts with an empty builder. `go build`
  downloaded 131 modules and compiled every package from scratch: 77 to 83 s in
  each of the last three runs.
- **The check job's build cache froze.** `setup-go` keys its cache on `go.sum`
  alone and skips the save on a key hit, so the cache kept the state of the last
  dependency change.
- **`node_modules` was a 314 MB layer.** A registry cache hit on the separate
  `bun install` layer still pulled and unpacked it: 33 s, of which 26 s was
  unpacking.
- **The check job had no Bun package cache.** `bun install` took 9 s.

## Decision

- **The check job replaces `setup-go`'s cache** with its own restore and save
  steps. Go modules and build output share one key, which hashes `go.sum` and
  every `.go` file. A miss restores the closest earlier entry. Pull requests
  only read the cache. Main and manual runs save a new entry when the key
  misses.
- **The Dockerfile installs and builds the console in one `RUN`.**
  `node_modules` stays inside that step and never becomes a layer, so a web
  change no longer pulls 314 MB from the registry cache. The registry cache
  export also loses that layer.
- **The Dockerfile's cache mounts start empty in CI, and the check job has no
  Bun cache.** Both were tried and removed after measurement, as described
  below.

## Alternatives considered

- **Persist the Docker cache mounts with `buildkit-cache-dance`.** This shipped
  in PR #19 and was removed after measurement. The mounts held 772 MB of Go
  build cache and 1.6 GB of Bun cache. Run `39905602738` built the same commit
  twice. With the cache injected, restoring took 23 s and injecting 58 s, and
  `go build` took 2.6 s instead of 80.6 s. So even a fully warm build only broke
  even. Run `39904181846` showed the cost of saving. Extracting the mounts after
  the build took 2m44s and the save took 14 s. Extraction happens on every key
  miss, which means every push that changes Go code.
- **A Bun cache in the check job.** Restoring took 8 s and saved 6 s on
  `bun install` (runs `39896814433` and `39897709519`).
- **Build the Go binary on the runner and copy it into the image.** That reuses
  the check job's cache, but CI and a local `docker build` would then build the
  binary in two different ways.
- **Key the check cache on the run ID.** Every main run would then upload a
  cache. Keying on the inputs saves only when the content can differ.

## Consequences

- The image's Go build stays cold, at about 80 s. Making it warm requires a
  cache that loads faster than buildkit's cache-mount injection, or a binary
  built outside the image.
- The check job's save adds about 13 s to a main push that changes Go code. Pull
  requests never pay it.
- Actions caches count against the repository's 10 GB cache limit, which evicts
  the least recently used entries first.
- The workload identity provider rejects refs other than main, so a branch run
  cannot verify the publish job (run `39896814433`). Measuring a publish change
  without deploying needs a workflow that builds without pushing.

## Verification

- `actionlint` v1.7.7 reports no findings for `.github/workflows/ci.yml`.
- `docker buildx build` of the one-step console stage succeeds locally (Docker
  29.8.2, arm64). The image serves the console bundle and `/api/status` returns
  200.
- Run `39905602738` measured the cache-mount injection with a temporary
  workflow on a throwaway branch. It built without pushing and used no
  credentials.
