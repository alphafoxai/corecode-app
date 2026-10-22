# Lesson: Format the web console through `bun run`, and keep only your own files

```json
{
  "id": "format-the-web-console-through-bun-run",
  "scope": "component",
  "owner": "corecode-maintainers",
  "status": "verified",
  "tags": ["web", "format", "oxfmt", "verification", "frontend"],
  "events": [{
    "id": "2026-10-22-format-script-ran-without-oxfmt",
    "date": "2026-10-22",
    "repository": "alphafoxai/corecode-app",
    "evidence": [
      "https://github.com/alphafoxai/corecode-app/blob/main/web/scripts/format-with-protected-headers.mjs"
    ]
  }],
  "rule": "Run `bun run format` from web/ and check its exit code; then revert formatting on files your change does not touch."
}
```

## Trigger

Formatting or format-checking anything under `web/`, or reporting a frontend change as formatted.

## Failure

On 2026-10-22, while building the customer console refresh, the agent ran
`node scripts/format-with-protected-headers.mjs --write` directly and discarded
its output. The script spawns `oxfmt`, which is only on PATH inside a package
script. The spawn failed and the script exited 1, without formatting anything
or printing an error. The first three commits went out unformatted, and were
described as formatted.

Running the script correctly then reformatted about thirty files the change
never touched, because the tree on `main` is not fully formatted.

The mistaken assumption was that a script finishing without output had run.

## Correct action

- Run `bun run format` (or `bun run format:check`) from `web/`, and read the exit
  code and the "Finished in … on N files" line.
- Then revert formatting on every file outside the change, for example by
  checking out each modified path that is not in
  `git diff --name-only origin/main...HEAD`.

## Prevention

Prevention is procedural only: the rule above. `format-with-protected-headers.mjs`
still exits silently when `oxfmt` is missing. Printing the spawn error there
would make the failure visible; that is not done yet.

## Evidence

The commit "Format the files this branch added" on
`feat/console-uiux-refresh` holds the formatting the earlier commits lacked.

## Escalation

First recorded event.
