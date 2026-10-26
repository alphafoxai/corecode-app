# Agent Note: Enterprise pricing application page

Status: implemented

## Problem

Teams with large, steady usage had no way to ask for a volume discount except
finding an operator on their own. The operators want a public page where a
team leaves its details, and a place in the console to follow up.

## Decision

- **`/enterprise` is a public page.** It has a Telegram button for
  `@joe_alphafox` and an application form. A visitor needs no account. The
  page does not publish discount tiers; every team gets its own quote. The
  handle is `ENTERPRISE_TELEGRAM_HANDLE` in `web/src/features/enterprise/constants.ts`.
- **The page is a header navigation module, `enterprise`,** on by default,
  with a switch in Maintenance > Header Navigation. `POST /api/enterprise/apply`
  sits behind `HeaderNavModuleAuth("enterprise")`, so turning the module off
  also closes the endpoint.
- **Applications are rows in `enterprise_applications`.** Fields: company,
  contact name, email, optional other contact, a monthly spend band
  (`under_1k`, `1k_5k`, `5k_20k`, `20k_50k`, `over_50k`), optional use case and
  message. Each row also stores the submitter's user id (0 for a visitor), the
  client IP, a status (`pending`, `contacted`, `won`, `rejected`) and an
  administrator's note. The server enforces the same length limits as the form.
- **Abuse controls on the public endpoint:** `CriticalRateLimit`, Turnstile
  when the site enables it, the anonymous body limit, and at most
  `EnterpriseMaxPerIPPerHour` (5) applications per client IP per hour. The
  hourly cap counts rows, so a restart or a second instance does not reset it.
- **Every enabled administrator is notified** through their own notify
  channel, in their saved language. Each application uses its own notify type,
  `enterprise_application_<id>`, because the per-user, per-type notice limit
  (2 in 10 minutes) would otherwise drop a third application. The notice is an
  HTML email, so every visitor-typed value is HTML-escaped before rendering.
- **Administrators review applications at `/enterprise-applications`,** the
  `admin.enterprise_application` sidebar module.
  `GET /api/enterprise/applications` pages and filters by status and a keyword
  (company, contact or email). `PATCH /api/enterprise/applications/:id` sets
  the status and note. Both are `AdminAuth` and session-only; personal access
  tokens cannot reach them, because the rows hold visitors' contact details.

## Alternatives considered

- **Email only, no table.** Faster to build, but applications would be lost
  when mail fails, and nobody could see which teams had been answered.
- **Require sign-in.** It would tie an application to an account. It was
  rejected because the person asking for pricing is often not the person who
  will hold the account.
- **A Telegram bot notice.** The operators answer on Telegram, but the
  existing admin notice channels already reach them, and a bot needs its own
  token and chat configuration.

## Verification

- `go test ./controller -run Enterprise` on SQLite 3.54, MySQL 5.7.44 and
  PostgreSQL 9.6.24: submit, list, keyword and status filters, update,
  unknown id, invalid input, the hourly cap, and notice escaping. Each run
  migrates the table twice.
- Upgrade: the `origin/main` binary created a database, then this branch's
  binary started on it twice. On all three databases it added only
  `enterprise_applications` and started cleanly.
- Vitest: the form's required-field errors, trimmed payload and failed
  submission; the admin list, keyword search and review save; the header link
  default and switch.
