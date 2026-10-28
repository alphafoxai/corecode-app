# Agent Note: The setup guide follows the key's group

Status: implemented

## Problem

The key row's terminal button, the setup dialog and the overview card all said
"Connect Claude Code" and offered only Claude Code configuration, whatever the
key's group. A key on the GPT, Grok or Gemini group, or on `auto`, got
instructions for a client that either cannot use its models or is one of
several it can serve. Production on 2026-10-28 offered these groups:
Claude 满血（仅限CC）, Claude 满血（可外接）, GPT, Grok, Gemini and auto.

## Decision

- `GET /api/user/self/groups` adds `claude_code_only` to each group, from
  `claude_code_client_setting.groups`. The console could not tell a Claude
  Code only group apart otherwise; that setting is admin-only, and guessing
  from the group name or description would break when the operator renames
  one. `auto` reports false.
- `useSetupClients` derives the clients from the key's group: a Claude Code
  only group gets Claude Code alone; otherwise Claude Code when the group
  serves `claude-*` models, Codex when it serves `gpt-*`, and "Other tools"
  (OpenAI-compatible) always. The models come from
  `/api/user/models?group=<group>`, which expands `auto` into its candidates.
  Until the group list loads, the guide stays on Claude Code so a Claude Code
  only key never flashes other clients.
- The guide shows a client switch only when there is more than one client,
  then that client's setup methods:
  - Claude Code: unchanged (settings.json, macOS / Linux, Windows, CC Switch,
    Magpie).
  - Codex: `~/.codex/config.toml` with a custom provider (`base_url` ending in
    `/v1`, `wire_api = "responses"`, `env_key = "CORECODE_API_KEY"`), the
    shell and PowerShell lines that set that variable, CC Switch's Codex
    import, and Magpie (the import link, or `magpie provider add` and
    `magpie codex <id>/<model>`). The key stays out of the TOML. The provider form follows Codex's
    documentation at learn.chatgpt.com/docs/config-file/config-advanced
    (redirected from developers.openai.com/codex/config-advanced), checked
    2026-10-28; `corecode` is not one of the reserved ids `openai`, `ollama`,
    `lmstudio`.
  - Other tools: `OPENAI_BASE_URL` / `OPENAI_API_KEY` for macOS / Linux and
    Windows, and a Chat Completions curl, using one of the group's own models.
- Both Magpie snippets add one provider with all three addresses
  (`anthropic=`, `url=<base>/v1`, `responses=<base>/v1`) and no `models=`, as
  the import link does, so one CoreCode provider serves Claude Code and Codex
  and Magpie lists the key's own models. `url=` is the CLI's Chat Completions
  field: a `magpie provider add` run under a scratch `HOME` on 2026-10-28 wrote
  it to `chat` in providers.json.
- The check command follows the client (`claude -p`, `codex exec`, a curl of
  `/v1/models`); the claude.ai sign-out warning shows for Claude Code only.
- The row button's label and the dialog title follow the same clients:
  "Connect Claude Code" for Claude Code alone, "Connect Codex" when Codex
  comes first (the GPT group), "Connect a client" otherwise. The overview card
  takes its heading from the selected key through `renderHeading`, and its
  description no longer says the address is without `/v1`, which is false for
  Codex and OpenAI tools.

## Alternatives considered

- **Infer Claude Code only from the group's description.** The text is the
  operator's to change; a flag from the setting the gate itself reads cannot
  drift.
- **Show every client for every key.** A Claude Code only key would be shown
  Codex and SDK setups that its gate refuses with 403.
- **Put the key in `config.toml` with `experimental_bearer_token`.** It is not
  among the documented provider keys we checked; `env_key` is.

## Consequences

- Each row asks for its group's models once; React Query shares the answer
  between rows of the same group.
- A new group whose models start with neither `claude-` nor `gpt-` gets
  "Other tools" alone, which suits any OpenAI-compatible pool.

## Verification

- Before writing the snippets, with an account key on 2026-10-28:
  `POST /v1/responses` and `POST /v1/chat/completions` with `gpt-5.6-luna`, and
  `POST /v1/chat/completions` with `grok-4.6`, all answered 200 from a plain
  HTTP client.
- `go test ./controller/ ./middleware/`: pass, including
  `TestGetUserGroupsMarksClaudeCodeOnlyGroups`.
- From `web/`: `bun check -b`; oxlint and oxfmt on the changed files;
  `bunx vitest run src/features/keys src/features/dashboard`. New cases cover
  the client matrix for each group kind, the titles, the Codex and OpenAI
  snippets, the check commands, a Claude Code only key showing no client
  switch, and a GPT key opening on Codex with its `config.toml`.
