# RULESET_GIT_WORKFLOW_v1

## Safe Defaults
- Never force-push by default.
- Never rewrite `main`, `master`, or any protected branch.
- Always fetch `origin` before divergence-sensitive update checks.
- Refuse automated update flows on dirty workspaces.

## Branching
- Branch names must include the governing contract ID.
- Prefer `<type>/<ID>-<slug>` naming for team-visible work.
- Do not auto-reuse or overwrite existing branches with the same name.

## Updates
- Prefer repo-configured update strategy; default to rebase when unspecified.
- Never auto-resolve conflicts.
- Stop immediately on conflicts and hand control back to the developer with explicit recovery steps.
- Treat open MR/PR branches cautiously; avoid history rewrites unless policy and the developer explicitly allow it.

## Push And Merge Readiness
- Never force-push unless config explicitly allows it and the developer confirms.
- Require preflight checks before push-sensitive or execute-sensitive flows when repo policy enables them.
- Keep MR/PR identity tied to contract ID, plan, and audit artifacts.
