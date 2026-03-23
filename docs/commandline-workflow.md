# Grabby Command-Line Workflow

This is the repo-local workflow reference for Grabby in this repository.

## Default Workflow

| Step | Command | Checkpoint |
|------|---------|------------|
| 1 | `grabby list` | Review existing contracts |
| 2 | `grabby task "request"` | Contract created |
| 3 | `grabby validate <file>` | Zero validation errors |
| 4 | `grabby plan <file>` | Plan artifact generated |
| 5 | `grabby approve <file>` | Status = approved |
| 6 | `grabby execute <file>` | Get implementation scope |
| 7 | Implement within scope | Relevant tests passing |
| 8 | `grabby audit <file>` | Audit artifact created |

## Alternative Intake Methods

- `grabby orchestrate "request"` for full persona handoff
- `grabby quick` for very small bounded changes
- `grabby agent architect CC` for interactive contract creation

## Local Guardrails

Install the repo hooks once per clone:

```bash
grabby init-hooks
```

### Preflight Checks

Run the comprehensive preflight check before pushing to catch issues that would fail CI:

```bash
# Quick preflight (skips npm audit and some slower checks)
npm run lint
# or
grabby preflight --quick

# Full preflight (recommended before push)
npm run preflight
# or
grabby preflight

# Full preflight with all checks (scripts, lockfile, npm audit)
npm run preflight:full
# or
grabby preflight --all
```

The preflight command checks:
- Git branch policy (protected branches, dirty state)
- All active contract validity
- Contract policy violations (DB, API, dependency)
- bundleDependencies consistency with dependencies
- package-lock.json sync status
- npm audit for high/critical vulnerabilities

### Recommended Before Push

```bash
npm run preflight           # Run full preflight checks
npm test                    # Run tests
grabby guard <contract>     # Check execution scope
grabby git:preflight        # Check git state
```

### Contract-Specific Guardrails

Before risky work or push-sensitive updates on a specific contract:

```bash
grabby guard contracts/<ID>.fc.md
grabby git:preflight contracts/<ID>.fc.md
grabby pr-template contracts/<ID>.fc.md
```

Useful supporting checks:

```bash
grabby context:lint
grabby policy:check
grabby session --check-all
```

## Local Dashboard

Launch the local contract dashboard with:

```bash
grabby ui
# or
grabby ui --port 3847
```

The dashboard binds to `127.0.0.1`, opens in your browser, and exposes contract status, editing, workflow visualization, and lifecycle actions.
If you want a repo-level default port, set `"dashboard": { "port": 3847 }` in `grabby.config.json`; `grabby ui --port <port>` still takes precedence for one-off runs.

## Canonical Artifacts

- `contracts/<ID>.fc.md` is the source of truth
- `contracts/<ID>.plan.yaml` stores the execution plan
- `contracts/<ID>.audit.md` stores post-execution verification

## Branch Strategy

- All feature and fix PRs merge into `development`
- `main` is release-only
- Use feature branches for normal work

## Release Process

1. Merge `development` into `main`
2. Push `main` with `GRABBY_RELEASE=1`
3. Create and push the release tag from `main`

Example:

```powershell
git checkout main
git merge --ff-only development
$env:GRABBY_RELEASE="1"; git push origin main
git tag -a vX.Y.Z -m "release"
git push origin vX.Y.Z
```

Release tags are blocked unless:

- `contracts/` is empty
- the tag-specific docs and website audit file exists at `docs/user-guide/release-audits/<tag>.md`
- the audit file includes:
  - `Docs Reviewed: yes`
  - `Website Updated: yes`
