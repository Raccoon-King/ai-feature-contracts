# FC: bmad-compatibility-rollout
**ID:** BMAD-215 | **Status:** complete
ARCH_VERSION: v1
RULESET_VERSION: v1
ENV_VERSION: v1

## Ticket
- Ticket ID: BMAD-201
- Who: Grabby maintainers and AI-assisted developers
- What: Add compatibility flags and rollout docs for BMAD-derived behavior changes
- Why: Enable safe incremental adoption without breaking existing user workflows

## Objective
Gate new BMAD-derived behavior behind explicit config flags and publish upgrade guidance.

**Data Change:** yes

## Scope
- Add config flags for adaptive help, quick-flow guardrails, and tiered verification
- Preserve current behavior as default unless features are enabled
- Add upgrade notes and rollback instructions
- Document behavior mapping from current -> flagged behavior

## Non-Goals
- Forced migration in a single release
- Runtime remote configuration
- Telemetry-based rollout

## Directories
**Allowed:** `lib/`, `docs/`, `tests/`
**Restricted:** `contracts/`, `node_modules/`, `.git/`, `dist/`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | `lib/config.cjs` | Add feature-flag schema and defaults |
| modify | `lib/commands.cjs` | Respect feature flags at runtime |
| modify | `grabby.config.example.json` | Document new config keys and defaults |
| create | `docs/BMAD_UPGRADE.md` | Publish rollout and rollback guidance |
| create | `tests/bmad-compatibility-flags.test.js` | Verify default and enabled behavior paths |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery

## Security Considerations
- [x] Feature flags cannot bypass governance approval/execute checks
- [x] Backward-compatible defaults are safe and explicit
- [x] Rollback path is documented for every introduced behavior flag

## Code Quality
- [x] Feature-flag reads are centralized
- [x] Defaults and enabled behavior are both tested
- [x] Upgrade docs match actual config keys and behavior

## Data Impact
- [x] No schema migration required
- [x] No data backfill required
- [x] Rollback steps verified for config-only changes

## Done When
- [x] New BMAD-derived behavior is behind explicit config flags
- [x] Default behavior remains backward-compatible
- [x] Upgrade doc includes rollout order, rollback steps, and behavior mapping
- [x] Tests validate default and enabled flag paths
- [x] Coverage remains at or above 80%
- [x] Lint passes
- [x] Tests pass

## Testing
Configuration and command-path tests for both default compatibility mode and feature-enabled mode.

## Context Refs
- ARCH_INDEX_v1
- RULESET_CORE_v1

