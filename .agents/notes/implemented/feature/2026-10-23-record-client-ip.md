# Agent Note: Record every client IP for administrators, show it to users only on request

Status: implemented

## Problem

A key shared among several people looks, in the usage log, like one busy
customer. The client IP would tell them apart, but upstream records it only
for users who turn on Record IP Address themselves, and on the relay that
was nobody.

## Decision

- **`log_setting.record_client_ip`** (default off) stores the client IP on
  every usage and error log. The operator turns it on under System settings
  → Operations → Log Maintenance.
- **A user's own log views are unchanged.** `formatUserLogs` and
  `StreamUserLogs` blank the IP unless the log owner turned on Record IP
  Address. This covers the user log list, the token log lookup and the
  export. Administrators see every recorded IP.
- **The privacy toggle now says what it does.** It shows the IP in the
  user's own logs. Its description states that the service may record the IP
  for abuse prevention either way.
- **Detection lives outside new-api.** corecode-infra's relay watch counts
  distinct IPs per token and alerts an operator. Nothing here blocks a key.

## Alternatives considered

- **Record the IP only in a new admin-only column or table.** It needs a
  migration checked on SQLite, MySQL and PostgreSQL, and `logs.ip` already
  exists, is indexed, and is shown to administrators.
- **Turn on Record IP Address for every user.** It would change what users
  see and overwrite a choice they make themselves.

## Consequences

- With the switch on, `logs.ip` holds personal data for every request. Log
  retention and cleanup apply to it as to the rest of the row.
- The IP is `c.ClientIP()`, which depends on `TRUSTED_PROXIES`. Behind the
  relay's Caddy, the default trusted private ranges yield the real client
  address.

## Verification

- A new case in `model/log_format_test.go` checks recording and visibility:
  - with the switch off, an opted-out user's IP is not recorded;
  - with it on, every IP is recorded;
  - `formatUserLogs` and `StreamUserLogs` hide the IP from the opted-out user
    and keep it for the opted-in one.
- `go test ./model/ ./controller/ ./setting/...` passes.
- `go vet` is clean on the changed packages.
- Frontend: typecheck passes and lint reports nothing in the changed files.
  Vitest over system-settings, security and profile passes 282 tests,
  including the log settings test updated for the new switch.
