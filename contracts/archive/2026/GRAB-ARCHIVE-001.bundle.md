# Feature Archive Bundle

ID: GRAB-ARCHIVE-001
Title: Archive Completed Features with Close Flow
Type: FEATURE_CONTRACT
Status: complete
Closed: 2026-03-03T00:36:32.016Z
Branch: -
PR/MR: -

## Ticket
- Who: Developers using Grabby; Platform Engineering
- What: Implement feature close flow that compresses completed feature artifacts and archives them, and add a garbage-collector path for hanging stories so they are either archived or explicitly dispositioned by the developer
- Why: Keep the repo lean while preserving an auditable, searchable history of completed work and prevent hanging contracts from accumulating unnoticed

## Definition of Done
- [x] `grabby feature:close <ID>` exists
- [x] Closing a feature creates `contracts/archive/<YEAR>/<ID>.bundle.md`
- [x] Bundle includes ID, title, type, status, ticket fields, directory rules, context refs, plan paths, audit summary, validation summary, and branch/PR metadata when available
- [x] Closing a feature removes `contracts/active/<ID>.plan.yaml` after bundling
- [x] Closing a feature removes or moves active FC and audit artifacts so only the archive bundle remains by default
- [x] Hanging or stale active stories are surfaced for explicit developer disposition instead of lingering indefinitely
- [x] Garbage collection can archive eligible stories or preserve them only when the developer explicitly chooses to do so
- [x] `.grabby/features.index.json` stores archive pointer metadata and a closed date
- [x] Validation and CI fail when completed features remain in `contracts/active/`
- [x] Tests verify bundle creation, plan removal, stale-story disposition, index updates, and ID mismatch safety
- [x] Duplicate ticket markdown files are not introduced
- [x] Archived features do not retain plan YAML by default unless explicitly configured
- [x] Index metadata remains searchable after active artifacts are removed
- [ ] Lint passes
- [x] Tests pass (80%+ coverage)

## Directories
**Allowed:** `bin/`, `lib/`, `docs/`, `tests/`, `contracts/`, `.grabby/`, `.github/`
**Restricted:** `node_modules/`, `dist/`, `.git/`

## Context Refs
- ARCH: auth-module@v1
- RULESET: imports@v1
- ENV: test-runner@v1

## Plan Paths
- bin/index.cjs
- lib/commands.cjs
- lib/features.cjs
- lib/governance-runtime.cjs
- README.md
- docs/EXECUTION_PROTOCOL.md
- .github/workflows/self-governance.yml
- tests/feature-close.test.js
- tests/commands.test.js
- tests/features-index.test.js
- bin/index.cjs

## Audit Summary
# Audit: GRAB-ARCHIVE-001 - Status: needs_attention ## Checks - Lint: failed - Build: not configured

## Validation Summary
Validation summary unavailable at close time.
