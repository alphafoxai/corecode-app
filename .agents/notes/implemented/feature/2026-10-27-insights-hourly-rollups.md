# Agent Note: Store the dashboard's hourly figures and the limit's rejections

Status: implemented

## Problem

The root site insights dashboard
(`2026-10-27-site-insights-dashboard.md`) had three gaps:

- The capacity, quality and client views read every request log in their
  range, capped at 31 days and 200,000 rows. That stops working as traffic
  grows, and the range could not go past the log retention.
- The per-user concurrency limit kept its 429s in process memory for two
  days. A restart or a blue/green release cleared them, each color counted
  its own, and nothing outside the process could read them for alerts.
- The capacity view counted root's own requests as customer traffic, so the
  operator's testing raised the peaks and the per-user tables.

## Decision

- **Hourly rollups in three tables of the main database:** `insight_hours`
  (one JSON summary per hour), `insight_user_hours` (requests and peak per
  user and hour) and `insight_model_hours` (requests, errors, cache tokens
  and TTFT and latency histograms per model and hour). The summary holds
  the capacity totals, peaks, rejection counts by cause, and the stream
  endings, status codes, failure reasons and clients (each capped at 30 per
  hour). Per-user and per-model rows stay in columns, so no hour's row grows
  with the number of users. The main database also works when the log
  database is ClickHouse.
- **A request belongs to the hour it started in** and is in flight until its
  log's `created_at`. An hour reads logs up to two hours past its end, so
  requests that began earlier and are still running count toward its peak.
  It is final ten minutes after that lookahead. The views read stored final
  hours, compute and store a final hour that is missing, and compute the
  open hours on every read. A master-node task stores up to 200 missing final
  hours every ten minutes over the last 92 days, so a view rarely computes
  one. Storing an hour deletes and inserts it in one transaction; during a
  release both colors may do it and write the same figures.
- **Percentiles come from histograms** of values rounded to two significant
  digits (exact below 100), so TTFT p50/p95 and latency are within 5%.
- **The capacity, quality and business views accept 92 days.** Days are
  whole UTC hours grouped by the viewer's offset.
- **The limiter buffers rejections in memory** and adds them to
  `user_concurrency_rejections` (hour, user, count) every 30 seconds and at
  shutdown, as the batched quota writes do. An update that matches no row is
  followed by an insert, and a failed insert by a second update, so two colors
  add to the same row. Writes that fail go back into the buffer.
- **Root is left out of every capacity figure:** the logs' concurrency,
  requests and failures, the live in-flight list, and the limit's
  rejections. The quality and client views still count root's requests;
  they describe the service, not customers.
- **The capacity view lists the users the limit turned away most** and
  charts the limit's rejections next to the pool's and Claude's.

## Alternatives considered

- **One JSON row per hour holding users and models.** A MySQL `TEXT` holds
  64 KB, which an hour with many users or models can pass.
- **Aggregate in SQL by hour.** Concurrency needs the overlap of request
  intervals, which per-row SQL cannot compute portably across SQLite, MySQL
  and PostgreSQL.
- **Keep reading raw logs and raise the cap.** It moves the limit without
  removing it, and stops at the log retention.
- **Count rejections in Redis.** The relay runs Redis, but the dashboard and
  `relay-watch.py` already read the database, and a table survives a Redis
  flush.

## Consequences

- Stored hours outlive the logs they came from; a rollup format change
  (`insightHourVersion`) rebuilds only hours whose logs still exist.
- Peaks of requests that run more than two hours are undercounted.
- Model names that differ only in case share a row under MySQL's default
  collation, as they already do in the logs' indexes; the hour then fails to
  store and is recomputed on each read.
- Up to 30 seconds of rejections can be lost if a server crashes rather than
  shutting down.
- `corecode-infra`'s `relay-watch.py` can alert on
  `user_concurrency_rejections`.

## Verification

- `go test ./model/` passes against SQLite 3.50, MySQL 8.4 and PostgreSQL
  16 (throwaway containers, `TEST_MYSQL_DSN` and a URL-form
  `TEST_POSTGRES_DSN`): the site insights matrix with a root request that
  capacity leaves out and quality counts, stored hours read back equal,
  a request spanning two hours, rejections adding up across writes with root
  left out, and the histogram.
- `go test ./controller/ ./router/ ./service/ ./middleware/ ./setting/... ./i18n/ ./common/`
  passes; `go test -race ./middleware/ -run Concurrency` passes.
- Migration: the released binary (`065af0e`) set up fresh SQLite, MySQL 8.4
  and PostgreSQL 16 databases, then this branch's binary started twice on
  each. Every start served `/api/status` with no errors logged, the four
  tables exist with their primary keys, and the root user is still there.
- Frontend: `bun run typecheck`, `oxlint` and `oxfmt` on the feature.
