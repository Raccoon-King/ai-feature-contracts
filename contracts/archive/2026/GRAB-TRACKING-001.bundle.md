# Feature Archive Bundle

ID: GRAB-TRACKING-001
Title: Toggle Contract Tracking
Type: FEATURE_CONTRACT
Status: complete
Closed: 2026-03-03T20:41:50.510Z
Branch: -
PR/MR: -

## Ticket
- Who: Developers using Grabby with Jira or another external tracking system
- What: Turn contract tracking on and off so feature and intake contract files can be excluded or removed before check-in
- Why: Some teams want Grabby to help during local implementation without duplicating Jira or external ticket tracking in the committed repo

## Definition of Done
- [ ] `contracts.trackingMode` exists with supported values `tracked` and `local-only`
- [ ] Default behavior remains `tracked`
- [ ] When `trackingMode=local-only`, developers can run Grabby workflows without keeping contract artifacts staged for check-in
- [ ] When `trackingMode=local-only`, canonical repo feature reporting excludes disposable local-only contracts
- [ ] Grabby preserves a local-only feature/change log under `.grabby/`
- [ ] Grabby provides or documents an explicit cleanup workflow before check-in
- [ ] Grabby does not duplicate external ticket systems when tracking is off
- [ ] Docs clearly explain tracked versus local-only mode and `.gitignore` expectations
- [ ] Tests cover config parsing, command behavior, feature indexing, and cleanup behavior in both modes
- [ ] Lint passes
- [ ] Tests pass (80%+ coverage)

## Directories
**Allowed:** `bin/`, `lib/`, `docs/`, `tests/`, `contracts/`, `.grabby/`
**Restricted:** `node_modules/`, `dist/`, `.git/`

## Context Refs
- ARCH: auth-module@v1
- RULESET: imports@v1
- ENV: test-runner@v1

## Plan Paths
- lib/config.cjs
- lib/commands.cjs
- lib/interactive-workflows.cjs
- lib/features.cjs
- bin/index.cjs
- grabby.config.example.json
- .grabbyignore or generated ignore guidance
- README.md
- docs/EXECUTION_PROTOCOL.md
- tests/tracking-mode.test.js

## Audit Summary
# Audit: GRAB-TRACKING-001 - Status: complete ## Checks - Lint: passed - Build: not configured

## Validation Summary
Validation summary unavailable at close time.
