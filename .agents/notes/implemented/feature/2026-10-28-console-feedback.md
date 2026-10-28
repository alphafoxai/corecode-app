# Agent Note: Feedback in the console

Status: implemented

## Problem

The site is new, and customers who hit a problem had nowhere to report it
except the QQ group. Several pages say "contact us" without saying how. The
operators want a place in the console to file a report, a way to answer it,
and a reward for a confirmed bug so customers bother to report one.

## Decision

- **Customers file reports at `/feedback`,** the `personal.feedback` sidebar
  module. A report has a type (`bug`, `suggestion`, `billing`, `other`), a
  title (128), a description (4000), an optional related request time or id
  (128) and an optional contact (128). The page lists the customer's own
  reports with status, the operators' reply and any reward.
- **The server attaches context on submit:** the browser's user agent and the
  customer's five latest usage log entries (id, time, type, model, request
  id), as JSON in `feedbacks.context`. A failed log lookup does not fail the
  report.
- **Abuse controls:** `UserAuth`, `UserCriticalRateLimit("feedback")`, and at
  most `FeedbackMaxPerUserPerHour` (5) reports per account per hour, counted
  from rows so a restart or a second server does not reset it. The console
  renders every customer-typed value as text.
- **Administrators review reports at `/feedback-admin`,** the `admin.feedback`
  module. `GET /api/feedback/admin` pages and filters by status, type, a
  keyword on title or description, and account. `PATCH
  /api/feedback/admin/:id` sets the status (`pending`, `processing`,
  `resolved`, `invalid`), the reply, and an optional reward in US dollars
  (up to $1000).
- **A reward is granted once, in the same transaction as the update.** The
  report row is locked, a report that already carries `reward_quota` refuses
  another reward, and the user's quota and the report's `reward_quota`,
  `rewarded_by` and `rewarded_time` commit together. After commit the user's
  cached balance is credited and a system log entry tells the customer what
  they received. Reward amounts are a guide in the dialog, not enforced:
  confirmed bug $5-20, serious billing or security issue $50+, adopted
  suggestion $5.
- All four routes are session-only for personal access tokens.

## Alternatives considered

- **An external form (Tencent or Feishu).** No code, but reports would not
  carry the account or its recent requests, and rewards would be granted by
  hand through user management with no record of which report earned one.
- **Rewards through redemption codes.** They work today, but the operator has
  to send the code back through another channel, and nothing ties the code to
  the report.
- **Notify the customer when a reply arrives.** Left out of this change; the
  reply shows on the feedback page.

## Verification

- `go test ./controller -run Feedback` on SQLite, MySQL 5.7.44 and PostgreSQL
  9.6.24: submit with attached context, own-only listing, admin filters,
  status and reply, a reward credited once and refused the second time,
  unknown id, invalid input, out-of-range rewards, and the hourly cap. Each
  run migrates the table twice.
- Upgrade: the `origin/main` binary created a database, then this branch's
  binary started on it twice, on all three databases; each start reached
  `/api/status` with no error in its log, and `feedbacks` was created with its
  indexes.
- Vitest: the form's required-field errors, trimmed payload, reset and failed
  submission; my-feedback list with reply and reward and its empty state; the
  admin list, keyword search, review save with reward, the rewarded state and
  the reward cap.
