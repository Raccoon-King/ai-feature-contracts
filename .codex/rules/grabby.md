# Grabby Codex Ruleset

This repository uses Grabby for feature intake, contract governance, planning, and execution. Codex should follow this workflow for feature work, refactors, and non-trivial fixes.

## Before Starting Work

1. Check for existing contracts:
   ```bash
   grabby list
   ```

2. If the user request is unstructured, draft a ticket first:
   ```bash
   grabby ticket "describe the request"
   ```

3. If no contract exists yet, create one from the request:
   ```bash
   grabby task "describe the request"
   ```

4. For complex work, prefer full orchestration:
   ```bash
   grabby orchestrate "describe the request"
   ```

5. For very small bounded changes, use:
   ```bash
   grabby quick
   ```

## Required Workflow

```text
1. grabby ticket "request"     # If ticket fields are missing
2. grabby task "request"       # Create/populate contract
3. grabby validate <file>      # Validate contract
4. grabby plan <file>          # Generate Phase 1 plan
5. grabby backlog <file>       # Generate backlog if useful
6. grabby approve <file>       # Approve for execution
7. grabby execute <file>       # Enter Phase 2 execution
8. [Implement code]            # Stay within approved scope
9. grabby audit <file>         # Audit result
```

## Rules

- Always read the contract before planning or editing code.
- Never modify files outside the contract's `Allowed` directories.
- Never modify files in restricted directories.
- Do not start plan or execute until the ticket is complete.
- During plan phase, produce plan only.
- During execute phase, modify only approved files.
- If blocked, stop and report the blocker.
- Keep tests in scope for any code change.

## Ticket Intake Shape

Use this canonical format:

```markdown
Who: <actor>
What: <requested change>
Why: <reason>

Definition of Done
- <criterion>
- <criterion>
```

Legacy tickets with `What System:` may be mapped forward, but new work should use `Who / What / Why / Definition of Done`.

## Quick Reference

| Command | Purpose |
|---------|---------|
| `grabby ticket "request"` | Draft a structured ticket |
| `grabby task "request"` | Create a feature contract |
| `grabby orchestrate "request"` | Full persona handoff |
| `grabby validate <file>` | Validate a contract |
| `grabby plan <file>` | Generate plan |
| `grabby approve <file>` | Approve execution |
| `grabby execute <file>` | Execute within scope |
| `grabby audit <file>` | Audit implementation |
| `grabby features:list` | List contract-backed features |
| `grabby features:status <id>` | Show feature artifact status |

## Canonical Repo Artifacts

- `contracts/<ID>.fc.md` is the canonical feature artifact.
- `contracts/<ID>.plan.yaml` and `contracts/<ID>.audit.md` are retained execution artifacts.
- Standalone ticket markdown files like `TT-123.md`, `JIRA-123.md`, or `tickets/*.md` are deprecated.
