FROM oven/bun:1.4.0@sha256:5ff609364c049b54eb0ff560ec96319729a972078ef2c755d758f0c6ef89c2d6 AS builder

WORKDIR /build/web
COPY web/package.json web/bun.lock ./
# Bun's install cache lives outside the layer, so a lockfile change refetches
# only what changed. Without the mount every build re-downloads the tree.
RUN --mount=type=cache,id=new-api-bun,target=/root/.bun/install/cache \
    bun install --frozen-lockfile
COPY ./web ./
COPY ./VERSION /build/VERSION
# VERSION ships empty; CI writes it before building. The fallback keeps a local
# build from stamping an empty version into the console bundle.
ARG BUILD_VERSION=dev
RUN if [ ! -s /build/VERSION ]; then printf '%s' "$BUILD_VERSION" > /build/VERSION; fi \
    && DISABLE_ESLINT_PLUGIN='true' VITE_REACT_APP_VERSION=$(cat /build/VERSION) bun run build

FROM golang:1.26.1-alpine@sha256:2389ebfa5b7f43eeafbd6be0c3700cc46690ef842ad962f6c5bd6be49ed82039 AS builder2
ENV GO111MODULE=on CGO_ENABLED=0 GOWORK=off

ARG TARGETOS
ARG TARGETARCH
ENV GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-amd64}
ENV GOEXPERIMENT=greenteagc

WORKDIR /build

ADD go.mod go.sum ./
# relaykit and tokenkit are local submodules referenced via replace; their
# go.mod files must be present for go mod download to resolve the main module graph.
ADD relaykit/go.mod ./relaykit/go.mod
ADD tokenkit/go.mod ./tokenkit/go.mod
# The module cache and the build cache are the two costs of a Go build: the
# first avoids re-downloading dependencies, the second reuses compiled packages.
# `go mod download` fetches the module graph, which is what gives the module a
# directory; without it `go list -m {{.Dir}}` for the PGO module prints nothing
# and the build reads a profile from "/default.pgo".
RUN --mount=type=cache,id=new-api-go-mod,target=/go/pkg/mod \
    go mod download \
    && go mod download github.com/Calcium-Ion/moejs \
    && pgo_dir=$(go list -m -f '{{.Dir}}' github.com/Calcium-Ion/moejs) \
    && test -n "$pgo_dir" \
    && cp "$pgo_dir/default.pgo" /build/default.pgo \
    && echo "build: PGO profile copied from $pgo_dir"

COPY . .
COPY --from=builder /build/web/dist ./web/dist
# Same fallback as the console stage: the Go binary stamps the version too.
ARG BUILD_VERSION=dev
RUN if [ ! -s VERSION ]; then printf '%s' "$BUILD_VERSION" > VERSION; fi
RUN --mount=type=cache,id=new-api-go-mod,target=/go/pkg/mod \
    --mount=type=cache,id=new-api-go-build,target=/root/.cache/go-build \
    set -eu; \
    test -s /build/default.pgo; \
    go build -pgo=/build/default.pgo \
      -ldflags "-s -w -X 'github.com/QuantumNous/new-api/common.Version=$(cat VERSION)'" -o new-api

FROM debian:bookworm-slim@sha256:f06537653ac770703bc45b4b113475bd402f451e85223f0f2837acbf89ab020a

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tzdata libasan8 wget \
    && rm -rf /var/lib/apt/lists/* \
    && update-ca-certificates

COPY --from=builder2 /build/new-api /
COPY LICENSE NOTICE THIRD-PARTY-LICENSES.md /licenses/
EXPOSE 3000
WORKDIR /data
ENTRYPOINT ["/new-api"]
