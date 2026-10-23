# Agent Note: Rankings are for administrators only

Status: implemented

## Problem

The header showed 排行榜 to every visitor of `corecode.live`. The rankings page
aggregates usage across all customers. CoreCode wants that view for operators,
not customers.

## Decision

- **`/api/rankings` requires `AdminAuth` whenever the module is enabled.**
  `HeaderNavModuleAuth("rankings")` calls `AdminAuth` instead of `UserAuth` or
  `TryUserAuth`. A disabled module still answers 403 for everyone, root
  included. The check sits beside the pricing exception in the same middleware.
- **The header link renders only for role `ADMIN` (10) and above.**
  `useTopNavLinks` drops the link for visitors and ordinary users. It no longer
  carries `requiresAuth`, because an administrator is always signed in.
- **The `/rankings` route guard follows the server.** A visitor who is not
  signed in goes to sign-in and returns afterwards. A signed-in non-administrator
  goes to `/`.

## Alternatives considered

- **Hide only the menu item.** `/rankings` and `/api/rankings` would stay open
  to anyone who types the URL. The backend must enforce the rule.
- **Add an `adminOnly` flag to `HeaderNavModules`.** That adds a settings
  switch and new strings in seven locales, all for a rule CoreCode does not
  plan to change. It is fork behavior, like the pricing exception.

## Consequences

- The "Require login to view rankings" switch in system settings no longer
  changes anything: admin-only already implies signed in. The "enabled" switch
  still turns rankings off for everyone.

## Verification

- `middleware/header_nav_test.go` `TestRankingsRequireAdministrator`: anonymous
  401, ordinary user 403 with or without `requireAuth`, administrator and root
  200. The test fails against the previous middleware.
- `web/src/hooks/__tests__/top-nav-links.test.tsx`: the link is hidden from
  visitors and ordinary users, shown to administrators and root, and hidden
  when the module is disabled.
