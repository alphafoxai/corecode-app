# Agent Note: /v1/models answers without a key while pricing is public

Status: implemented

## Problem

Magpie lists CoreCode among its sponsored providers. Its add-provider dialog
fetches the model list before the user has pasted a key: relay logs from
2026-10-28 02:56–02:59 UTC show one client sending `GET /models` (the console's
HTML, 200) and then `GET /v1/models` with no key, which `TokenAuth` refused
with 401. The dialog therefore showed no Claude models. The same client got 200
once a key was entered.

`isModelListRequest` already lets a model list past the Claude-Code-only gate,
but only after the token is authenticated.

## Decision

- `middleware.ModelListAuth` replaces `TokenAuth` on the `/v1/models` group. A
  request that carries no credential in any place `TokenAuth` reads one
  (`Authorization`, `x-api-key`, `x-goog-api-key`, `mj-api-secret`, `?key=`,
  the WebSocket subprotocol) is passed on as anonymous. A blank header, or
  `Bearer` alone, counts as no key. A request that names a key, valid or not,
  is still authenticated by `TokenAuth`, so a wrong key keeps its 401.
- Anonymous access follows the pricing page's `HeaderNavModules` setting: it
  is open only while `pricing` is enabled and does not require sign-in. Hiding
  the pricing page or putting it behind sign-in closes the anonymous list too.
- The anonymous list is the one the public pricing page shows a visitor:
  `model.GetPricing()` filtered by `GetUserUsableGroups("")`, then by billing
  configuration as the keyed list is. Groups a visitor is not offered stay
  hidden.
- `anthropic-version` alone selects the Anthropic shape when the request is
  anonymous, since there is no `x-api-key` to pair it with. That shape keeps
  only models whose supported endpoints include `anthropic`, because an
  Anthropic client can call no other; the OpenAI shape lists all of them.

## Alternatives considered

- **Answer `/models` (no `/v1`) from Caddy.** Magpie falls through to
  `/v1/models` after the HTML, so the 401 was the failure. `/models` also
  belongs to the console's router.
- **Return the full ability list without a key.** That would reveal groups
  the operator does not offer to customers. The pricing page is already the
  operator's decision about what an anonymous visitor may see.

## Consequences

- An unauthenticated client can read model names that `/api/pricing` already
  publishes; no price, group, or account data is added to `/v1/models`.
- The keyed path, its token model limits and its group selection are
  unchanged.

## Verification

- `go test ./router/ ./middleware/ ./controller/ -count=1`: pass.
- `TestListModelsWithoutKeyServesThePublicPricingModels` covers no key and a
  blank `x-api-key` (Anthropic shape, Claude only), `Authorization: Bearer`
  with no key (OpenAI shape, both models, the hidden group's model absent), a
  wrong key (401), and a pricing page behind sign-in (401). With the group
  switched back to `TokenAuth` it fails with 401 where 200 is expected.
