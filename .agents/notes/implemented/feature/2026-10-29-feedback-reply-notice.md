# Agent Note: Tell the customer when feedback gets a reply

Status: implemented

## Problem

An administrator's reply on `/feedback-admin` reached the customer only if they
went back to `/feedback` and reloaded it. Nothing told them a reply had
arrived, and the page did not refresh on its own. Only a reward left a trace
elsewhere, as a system log entry. The operators want customers to notice
replies.

## Decision

- **Unread is a pair of times on the report.** `replied_time` is set whenever
  an administrator changes what the customer sees: the status, the reply, or a
  reward. Saving the same status and reply does not set it. `seen_time` is the
  `replied_time` the customer has seen. A report has an unread reply while
  `replied_time > seen_time`. Each change sets `replied_time` to at least the
  previous value plus one, so two changes in the same second still count as
  new.
- **`GET /api/feedback/self/unread`** returns the count of the customer's
  unread reports. **`POST /api/feedback/self/seen`** takes `until`, the latest
  `replied_time` the console showed, and copies `replied_time` into `seen_time`
  for the customer's reports up to it. A reply made after the page loaded stays
  unread. Both routes are session-only for personal access tokens, like the
  rest of `/api/feedback`.
- **The console reminds the customer three ways.** The sidebar's Feedback item
  shows the unread count. Outside `/feedback`, a toast with a View action
  appears when the console opens with unread replies and again whenever the
  count grows. On `/feedback` the list refreshes every minute, marks each
  unread report "New reply" for the rest of the visit, and records it as seen.
  The count refreshes every minute while the tab is visible. Both requests skip
  the global error toast, so a failure stays silent.
- Reports answered before this change have both times at 0 and are not
  unread, so the release does not raise reminders for old replies.

## Alternatives considered

- **Email the customer on each reply.** Reaches a customer who is not signed
  in, but not every account has an address, and every save would send mail.
  Left for later if in-console reminders prove too easy to miss.
- **A system log entry for every reply, as rewards already have.** The log is
  a usage record that customers rarely open; it would not tell them anything.
- **A boolean unread flag.** Marking it read when the page loads would also
  clear a reply that arrived after the page was rendered.
- **Mark everything seen on load.** Simpler, but a reply that lands between
  the list request and the mark would never be shown as new.

## Verification

- `go test ./controller -run Feedback` on SQLite, MySQL 5.7.44 and PostgreSQL
  9.6.24. The new test covers: no unread on a new report; a reply makes one
  unread for its owner only; another account cannot mark it seen; saving the
  same reply is not news; a second reply within the same second is; marking up
  to an older time leaves the newer reply unread; a reward alone is news;
  `until` 0 is rejected.
- Upgrade: the `origin/main` binary created a database on each of the three
  engines and a report with a reply was inserted. This branch's binary then
  started on it twice. Each start answered `/api/status` with no error in its
  log, the existing row read `replied_time` 0 and `seen_time` 0, and the
  indexes were unchanged.
- Vitest: an unread reply shows "New reply" and posts the latest
  `replied_time` as `until`; a seen reply shows no mark and posts nothing; the
  toast appears once for unread replies, again only when the count grows, and
  not with no unread reply or on `/feedback`.
