# Agent Note: Offer only the operator's groups when a customer creates a key

Status: implemented

## Problem

The key form listed `default` with the description "User group" beside the two
Claude groups. Production does not offer `default` (`UserUsableGroups` names only
the Claude groups) and no channel serves it. `GetUserUsableGroups` appends the
caller's own group to whatever the operator configured, and
`/api/user/self/groups` returned that list, so customers still picked it. On
2026-10-27 four enabled keys named `default` and five were blank, which falls
back to `default`. None had ever served a request.

## Decision

`GetUserOfferedGroups` returns `UserUsableGroups` with the user group's special
additions and removals, without the own group. `/api/user/self/groups` lists
those. `GetUserUsableGroups` still adds the own group, so token authentication,
pricing, and the playground's model list behave as before.

An operator who wants `default` offered adds it to `UserUsableGroups`, or adds
it for one user group with `GroupSpecialUsableGroup`.

## Alternatives considered

- **Filter `default` in the console.** The name is an operator choice, and the
  playground and the usage-log filter read the same endpoint.
- **Stop adding the own group in `GetUserUsableGroups`.** A key that names its
  user's group, or a blank key, would then fail authentication instead of
  channel selection. That turns an existing routing failure into a permission
  error and changes the pricing page as well.

## Consequences

- Opening an existing `default` key in the edit drawer moves the form to the
  first Auto group, because `default` is no longer an option.
- A key created through the API with `group: "default"` is still accepted. The
  create handler does not validate the group.
- The usage-log group filter no longer offers `default` for logs written before
  the groups were renamed.
