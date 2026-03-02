# Feature Contract: Modern Ticket Intake Shape
**ID:** GRAB-INTAKE-003 | **Status:** completed
CONTRACT_TYPE: FEATURE_CONTRACT
ARCH_VERSION: v1
RULESET_VERSION: v1
ENV_VERSION: v1

## Objective
Update Grabby's ticket intake shape from legacy ticket fields to the canonical `Who / What / Why / Definition of Done` format, while preserving backward-compatible parsing for old ticket payloads.

## Scope
- Parse the new ticket shape consistently across intake flows
- Map legacy `What System` tickets into the new shape when possible
- Accept new ticket fields through CLI flags and interactive prompts
- Update generated artifacts to carry the new ticket shape
- Add unit coverage for new-shape parsing, legacy mapping, and DoD list parsing

## Non-Goals
- Jira integration changes beyond keeping ID parsing compatible
- Expanding intake scope into unrelated workflow redesigns
- Reintroducing `What System` as a required ticket field

## Directories
**Allowed:** `lib/`, `docs/`, `tests/`, `contracts/`
**Restricted:** `node_modules/`, `.git/`, `dist/`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | `lib/ticket-intake.cjs` | Centralize new-shape and legacy-shape parsing |
| modify | `lib/interactive-shell.cjs` | Support `--who`, `--what`, `--why`, `--dod`, and `--ticket-id` |
| modify | `lib/interactive-workflows.cjs` | Use parsed ticket data before contract generation |
| modify | `lib/task-artifacts.cjs` | Embed ticket details in generated contracts |
| modify | `lib/task-brief.cjs` | Embed ticket details in generated briefs |
| create | `tests/ticket-intake.test.js` | Cover new shape, old-shape mapping, and DoD parsing |
| modify | `README.md` | Document the new intake format |
| modify | `docs/EXECUTION_PROTOCOL.md` | Document the intake gate and canonical shape |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery

## Security Considerations
- [x] Legacy ticket mapping stays local and deterministic
- [x] No hidden network dependency is introduced during ticket parsing
- [x] Validation rejects incomplete ticket payloads before downstream execution

## Done When
- [x] User-facing ticket intake shape is `Who / What / Why / Definition of Done`
- [x] Legacy ticket shape with `What System` is mapped into the new shape
- [x] New ticket fields are accepted consistently in CLI prompts and flags
- [x] Generated contract and brief artifacts preserve the new ticket context
- [x] Unit tests cover new-shape parsing, legacy mapping, and DoD list parsing

## Testing
- Unit: `tests/ticket-intake.test.js`
- Regression: `tests/task-artifacts.test.js`, `tests/task-brief.test.js`

## Context Refs
- ARCH: auth-module@v1
- RULESET: imports@v1
- ENV: test-runner@v1
