# Agent Note: OAuth sits beside the emailed link on the sign-in pages

Status: implemented

## Problem

The sign-in and sign-up pages were a bare form on an empty canvas: no product,
no hint of what the console is for. OAuth was worse than bare. With the emailed
link on, the sign-in page showed only the email field. LinuxDO and every other
provider sat behind "Sign in another way", next to the password form, and the
sign-up page did not offer OAuth at all. Turning LinuxDO on in system settings
changed nothing a new customer could see.

## Decision

- **OAuth renders above the email field.** `MagicLinkForm` takes
  `showOAuthProviders`. The sign-in page always passes it. The sign-up page
  passes it unless `oauth_register_enabled` is off. The buttons share the
  form's legal-consent state, so they stay disabled until the terms are
  accepted, as they already were in the password and sign-up forms.
- **"Sign in another way" now means password, passkey or WeChat.** The toggle
  shows when the password form or one of those two is enabled. OAuth alone no
  longer needs a second view. The password form stays one click away whenever
  `PasswordLoginEnabled` is on, because `corecode-infra`'s `init-relay.sh`
  signs in as root through it.
- **Providers come first in every form, with a labelled rule under them.**
  `OAuthProviders` dropped its own "Or continue with" heading. It now takes a
  `separatorLabel` and draws `FieldSeparator` below the buttons. The emailed
  link, the password sign-in and the password sign-up each pass their own label.
- **`AuthLayout` is a split screen.** On `lg` and wider, a dark brand panel
  (`components/auth-brand-panel.tsx`) restates the home page's promises: official
  Claude only, the session-to-account binding that keeps the prompt cache warm,
  and per-request billing. Below them sits the three-line `ANTHROPIC_BASE_URL`
  setup. The panel's wording follows `corecode-infra/branding/home.html`.
  Narrower screens show only the logo and the form. The language and theme
  switches now appear on every auth page.

## Alternatives considered

- **Keep OAuth behind the toggle and rename it.** A customer still has to guess
  that a LinuxDO account works, and the sign-up page still has no provider.
- **Put the brand copy in an operator option.** The home page already is one
  (`HomePageContent`). A second free-form option for one panel is more
  configuration than the copy is worth. The panel is fork code, like the theme.

## Consequences

- The panel's copy is CoreCode's, not `systemName`'s. A rebrand edits
  `auth-brand-panel.tsx` together with `branding/home.html`.
- Forgot-password, OTP, email-login and the OAuth callback also render inside
  `AuthLayout`, so they gain the panel too.

## Verification

- `web/src/features/auth/__tests__/oauth-entry.test.tsx` covers six cases:
  - LinuxDO shows beside the emailed link;
  - the password form stays reachable when OAuth is the only other provider;
  - the toggle disappears when only OAuth remains;
  - sign-up offers LinuxDO;
  - sign-up hides LinuxDO when OAuth registration is off;
  - consent gates the OAuth buttons.

  Four of the six fail against the `origin/main` components. The other two
  guard behavior that already existed.
- `bun run test` passes 215 files and 2495 tests. `bun run typecheck` and
  oxlint on the changed files are clean.
- In a browser, against the Rsbuild dev server proxied to `corecode.live`'s
  public `/api/status`, the pages render correctly:
  - sign-in, the password view and sign-up at 1440×900;
  - sign-in at 390×844, with no horizontal scroll;
  - sign-in in dark mode.
