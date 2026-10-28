# Agent Note: Show the latest model check above the prices on /pricing

Status: implemented

## Problem

corecode-infra fingerprints every Claude model every 3 days with ModelTrace and publishes the report on `/docs/verify/#trace`. The owner wanted that evidence on `/pricing`, where customers choose a group and decide whether to trust the price.

## Decision

- `features/pricing/components/model-check-banner.tsx` sits above the price board in the same strip style as "Pricing rules". It reads `/docs/verify/model-trace/latest.json` from the same origin with `fetch` rather than the `api` instance, because the file is a static docs asset, not a new-api route, and must not trigger the API error handling.
- It lists each model with at least one valid round and its mean Claude-family probability, formatted with `Intl` in the interface locale (`toIntlLocale`), with the run date. It also links the report: `/docs/verify/#trace` for zh and zh-TW, `/docs/en/verify/#trace` otherwise.
- When the file is missing, malformed, or has no valid model, the banner keeps the description and the link. A fork or a fresh host without runs shows no figures, and never a broken table.
- The file's fields are a cross-repo contract, owned in corecode-infra `notes/workspace/implemented/feature/2026-10-28-pricing-shows-model-check.md`. The banner reads `date`, and `model`, `rounds` and `claude` per model.

## Alternatives considered

- **Only a link.** Figures on the page carry the evidence; a link asks the customer to go looking.
- **Show the per-version probability (`self`).** `claude-fable-5-1` has no fingerprint of its own, so the column would be uneven. The banner shows the Claude family probability, which every model has, and the report has the rest.

## Verification

- `bunx vitest run src/features/pricing`: 19 files and 328 tests, including 4 new ones. They cover the figures, skipping a model with no valid round, the fallback on 404 and on a malformed file, the zh and en report links, and French percent formatting after a language switch.
- `/pricing` on the dev server, with `/api` proxied to production and a sample of the 2026-10-28 production run as `latest.json`, at 1280 px (zh, en) and 390 px (zh). There is no horizontal overflow, and the date stays on one line.
