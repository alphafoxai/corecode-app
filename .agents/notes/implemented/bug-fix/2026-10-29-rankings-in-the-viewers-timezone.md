# Agent Note: Rankings read in the viewer's time zone

Status: implemented

## Problem

`/rankings` drew its charts in the server's zone. The relay runs new-api with
`TZ: UTC`, so a viewer in UTC+8 saw the "today" axis in UTC hours, and every
day bar of the week and month views ran from 08:00 to 08:00 local time under a
UTC date.

## Decision

- **The console sends `tz_offset`**, the browser's offset east of UTC in
  minutes (`-getTimezoneOffset()`), with every `/api/rankings` request. It is
  part of the query key.
- **The server aligns buckets and labels to that offset.**
  `GetRankingQuotaBuckets` floors `created_at + offset` to the bucket size and
  subtracts the offset again, so a day bucket starts at the viewer's midnight.
  Labels are formatted in a fixed zone at that offset. `ts` stays UTC.
- **The cache key includes the offset.** Offsets outside ±14 hours, or a value
  that is not an integer, answer 400. A missing `tz_offset` means UTC, the
  previous behavior.

## Alternatives considered

- **Format labels in the browser from `ts`.** That fixes the hour axis but
  leaves day buckets cut at UTC midnight; the boundary has to move in the query.
- **Send an IANA zone name.** The SQL bucket needs one fixed offset per query,
  and a fixed offset is what the browser reports. Across a DST change the
  year view's weekly buckets shift by an hour, which a weekly bar does not show.

## Verification

- `model/usedata_rankings_test.go` `TestRankingQuotaBucketsStartAtViewerMidnight`
  (SQLite): 15:00 and 16:00 UTC share a day bucket at offset 0 and split at
  UTC+8.
- The same bucket expression run by hand on PostgreSQL 15 and MySQL 8 returns
  the same boundaries for UTC+8 and UTC-5.
- `service/rankings_test.go`: labels read in the viewer's zone.
