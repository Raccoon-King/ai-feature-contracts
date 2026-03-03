# Feature Contract: Toggle Contract Tracking
**ID:** GRAB-TRACKING-001 | **Status:** approved
CONTRACT_TYPE: FEATURE_CONTRACT
ARCH_VERSION: v1
RULESET_VERSION: v1
ENV_VERSION: v1

## Ticket
- Who: Developers using Grabby with Jira or another external tracking system
- What: Turn contract tracking on and off so feature and intake contract files can be excluded or removed before check-in
- Why: Some teams want Grabby to help during local implementation without duplicating Jira or external ticket tracking in the committed repo

## Objective
Add a setting that lets developers enable or disable repo-tracked Grabby contract artifacts so teams can use Grabby locally during development and avoid committing feature/intake contract files when that workflow is unwanted.

## Summary
Introduce an explicit contract tracking mode under Grabby config. In `tracked` mode, behavior stays as-is and contracts remain canonical repo artifacts. In `local-only` mode, Grabby still supports intake, planning, and local governance, but contract artifacts are treated as disposable local files and are expected to be removed or ignored before check-in.

## Scope
- Add a config setting for contract tracking mode under `contracts.trackingMode`
- Support two modes:
  - `tracked` = current behavior, contracts are committed repo artifacts
  - `local-only` = contracts may be created locally but should not be required as committed repo artifacts
- Define which artifacts are local-only when tracking is disabled:
  - `contracts/<ID>.fc.md`
  - `contracts/<ID>.plan.yaml`
  - `contracts/<ID>.audit.md`
  - related brief/prompt/session artifacts
- Preserve a local-only change log or feature log under `.grabby/` when `trackingMode=local-only`
- Provide an explicit cleanup path before check-in:
  - manual command and/or documented workflow
  - no implicit deletion during normal feature execution
- Prevent validation/policy flows from failing solely because committed contract artifacts are absent in `local-only` mode
- Ensure feature indexing excludes local-only contracts from canonical repo feature reporting and document tracked vs local-only behavior including recommended `.gitignore` usage

## Non-Goals
- Replacing Jira or external ticket systems
- Syncing contract deletion back into Jira
- Removing local governance checks that are still useful during implementation
- Automatically deleting user files without an explicit command
- Supporting more than the two initial tracking modes in this change

## Directories
**Allowed:** `bin/`, `lib/`, `docs/`, `tests/`, `contracts/`, `.grabby/`
**Restricted:** `node_modules/`, `dist/`, `.git/`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | `lib/config.cjs` | Add on/off setting for contract tracking |
| modify | `lib/commands.cjs` | Respect tracking mode in validate/list/create/audit flows |
| modify | `lib/interactive-workflows.cjs` | Handle local-only contract lifecycle when tracking is disabled |
| modify | `lib/features.cjs` | Exclude or adapt feature indexing when contracts are local-only |
| modify | `bin/index.cjs` | Expose any user-facing status or config behavior |
| modify | `grabby.config.example.json` | Document tracking mode in example config |
| modify | `.grabbyignore` or generated ignore guidance | Keep local-only artifacts out of normal reporting when configured |
| modify | `README.md` | Document tracked and untracked workflows |
| modify | `docs/EXECUTION_PROTOCOL.md` | Document removal-before-checkin behavior |
| create | `tests/tracking-mode.test.js` | Cover tracked and untracked contract behavior |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery

## Security Considerations
- [ ] Tracking mode does not delete user files implicitly
- [ ] Contract cleanup requires explicit developer action or explicit command
- [ ] Local-only logs stay inside approved Grabby directories
- [ ] `local-only` mode does not weaken existing restricted-directory protections

## Done When
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

## Testing
- Unit: config parsing and command behavior for tracking on/off
- Integration: end-to-end feature workflow with tracking disabled
- Regression: feature indexing and validation still work when tracking remains enabled

## Open Decisions
- Decide whether cleanup is exposed as a dedicated command such as `grabby contracts:clean-local` or left as a documented manual step.
- Decide whether `local-only` contracts live in `contracts/` temporarily or a separate `.grabby/contracts/` area during implementation.

## Context Refs
- ARCH: auth-module@v1
- RULESET: imports@v1
- ENV: test-runner@v1
