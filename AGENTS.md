# Agent Instructions

This repository uses Grabby for request intake, contract governance, planning, execution, and audit.

For detailed workflow guidance, see:
- [docs/commandline-workflow.md](docs/commandline-workflow.md) - Full CLI workflow reference
- [.codex/rules/grabby.md](.codex/rules/grabby.md) - Codex-specific rules

## Default Workflow

| Step | Command | Checkpoint |
|------|---------|------------|
| 1 | `grabby list` | Review existing contracts |
| 2 | `grabby task "request"` | Contract created |
| 3 | `grabby validate <file>` | Zero validation errors |
| 4 | `grabby plan <file>` | Plan artifact generated |
| 5 | `grabby approve <file>` | Status = approved |
| 6 | `grabby execute <file>` | Get implementation scope |
| 7 | Implement within scope | Tests passing, 80%+ coverage |
| 8 | `grabby audit <file>` | Audit artifact created |

**Alternative intake methods:**
- `grabby orchestrate "request"` - Full persona handoff (Archie → Val → Sage → Dev → Iris)
- `grabby quick` - Fast-track for changes < 3 files
- `grabby agent architect CC` - Interactive contract creation

## Canonical Artifacts

- `contracts/<ID>.fc.md` - Feature contract (source of truth)
- `contracts/<ID>.plan.yaml` - Execution plan
- `contracts/<ID>.audit.md` - Compliance audit

Standalone ticket files are deprecated. The feature contract is the canonical artifact.

## Enforcement

Install git hooks for automatic enforcement:
```bash
grabby init-hooks
export GRABBY_STRICT=1  # Optional: block commits without contracts
```

Release tag rule (repo-local):
- Release tags are blocked unless `contracts/` is empty.
- Close/archive all active contracts before pushing a release tag.

## Branch Strategy (Repo-Local)

- All feature/fix PRs must merge into `development`.
- `main` is release-only.
- Release process:
  1. Merge `development` into `main`
  2. Push `main` with `GRABBY_RELEASE=1`
  3. Create and push release tag from `main`

Local hook enforcement (`hooks/pre-push`):
- Blocks non-release direct pushes to `main`
- Blocks pushes to `main` from non-`main` refs
- Blocks release tag pushes outside `main`
- Blocks release tag pushes while `contracts/` contains active `.fc.md` files
