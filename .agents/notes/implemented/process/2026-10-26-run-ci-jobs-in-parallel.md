# Agent Note: Run the CI jobs in parallel and keep the Go build off the console's path

Status: implemented

## Problem

A main push took about 9 minutes before the deploy job. Run `40273607268` shows
where it went:

- **Check and publish ran one after the other.** Check took 4m05s: 31 s to
  restore the Go caches, 75 s to build the console, 103 s to vet and test, and
  16 s to save the caches. Publish started only after it finished and took
  another 4m40s.
- **The image's Go build waited for the console.** `COPY --from=builder
  /build/web/dist` came before `go build`, so the 91.5 s build began only after
  the 86.6 s console build. The 131 `go: downloading` lines look like the cause,
  but downloading took under 5 s. The other 86 s was compiling, because the
  build cache mount starts empty on a hosted runner (see
  `2026-10-23-reuse-ci-caches-across-runs.md`).
- **`node_modules` was still exported to the registry cache.** Installing and
  building in one `RUN` kept it out of a separate layer, but it remained in that
  step's layer: 367 MB compressed. The cache export spent 56.7 s preparing it.
- **Check built the console only to satisfy `//go:embed web/dist`.** Vet and
  the tests never read the bundle.

## Decision

- **Publish no longer needs check.** Check, web and publish start together, and
  deploy needs all three. Pushing an image changes nothing in production, so
  publishing before the tests finish only leaves an unused tag in the registry
  when they fail.
- **The console build is its own `web` job.** Check writes an empty
  `web/dist/index.html` instead, which is enough for the embed. The web job keeps
  the console build on pull requests, where publish does not run.
- **The Dockerfile compiles every package except main before copying the
  console in.** It runs `go build` on `go list -e -deps .` minus the main
  package, with the same `-pgo` flag as the final build. BuildKit runs that step
  alongside the console stage. The final `go build` then compiles only the main
  package and links.
- **The console stage removes `node_modules` at the end of its `RUN`.**

## Alternatives considered

- **Merge check and publish into one job.** The only work they could share is
  the console build. The Go build caches do not match: check builds with cgo,
  without PGO, and with `-race` for one package, while the image uses
  `CGO_ENABLED=0`, PGO and `GOEXPERIMENT=greenteagc`. One job would also run vet,
  the tests and the image build one after another, which is slower than parallel
  jobs.
- **Pass the web job's bundle into the image build.** That needs an artifact
  upload and download between jobs, and once the Go packages compile alongside
  the console stage the bundle is no longer the image build's bottleneck.

## Consequences

- The time to deploy is the slowest of the three jobs rather than the sum of
  check and publish.
- A failing test no longer prevents an image from being pushed. It still
  prevents the deploy.
- The image's Go build still compiles from cold. It now does so while the
  console builds, instead of after it.

## Verification

- `actionlint` v1.7.7 reports no findings for `.github/workflows/ci.yml`.
- `go vet . ./router/...` passes in a clean worktree with an empty
  `web/dist/index.html`.
- `docker buildx build` on a new `docker-container` builder, whose cache mounts
  start empty (Docker, arm64), succeeds. The step that compiles everything but
  main took 14.5 s alongside the 56.0 s console stage. The final `go build` took
  1.7 s, so it found the packages in the build cache. The image serves the
  console and `/api/status` returns 200.
- The workload identity provider rejects refs other than main, so the publish
  timings on a hosted runner are measurable only after merge.
