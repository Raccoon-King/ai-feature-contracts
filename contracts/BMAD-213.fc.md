# FC: lightweight-sprint-cadence
**ID:** BMAD-213 | **Status:** complete
ARCH_VERSION: v1
RULESET_VERSION: v1
ENV_VERSION: v1

## Ticket
- Ticket ID: BMAD-201
- Who: Grabby maintainers and AI-assisted developers
- What: Add optional sprint/story progress artifact and readiness checks
- Why: Improve implementation cadence tracking without forcing heavyweight ceremony

## Objective
Introduce a lightweight, optional progress artifact aligned to contract execution stages.

## Scope
- Define optional contract-linked sprint/story status artifact format
- Add command support to summarize status when artifact exists
- Add readiness check output (`PASS`, `CONCERNS`, `FAIL`) before implementation handoff
- Keep existing contract-only flow valid when artifact is absent

## Non-Goals
- Full scrum workflow replacement
- Mandatory sprint artifact requirement for all contracts
- Multi-team planning automation

## Directories
**Allowed:** `lib/`, `workflows/`, `tests/`, `docs/`
**Restricted:** `contracts/`, `node_modules/`, `.git/`, `dist/`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | `workflows/sprint-status/workflow.yaml` | Add optional status workflow definition |
| modify | `lib/interactive-workflows.cjs` | Support sprint artifact read/summary behavior |
| modify | `lib/interactive-shell.cjs` | Expose summary/readiness command output |
| create | `tests/sprint-status-workflow.test.js` | Validate optional artifact behavior and readiness status |
| modify | `docs/EXECUTION_PROTOCOL.md` | Document optional sprint/status flow and gates |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery

## Security Considerations
- [x] Optional artifact parsing handles malformed content safely
- [x] No hidden path traversal through artifact location handling
- [x] Governance decisions remain server-side and explicit

## Code Quality
- [x] New status workflow remains optional and backward-compatible
- [x] Readiness result classification is deterministic and tested
- [x] Command output remains concise and consistent

## Done When
- [x] Sprint/status artifact is optional and non-breaking
- [x] Status summary command returns deterministic output
- [x] Readiness checks emit `PASS`, `CONCERNS`, or `FAIL` with reasons
- [x] Governance gating remains unchanged for approve/execute
- [x] Coverage remains at or above 80%
- [x] Lint passes
- [x] Tests pass

## Testing
Unit and integration tests for optional artifact detection, status rendering, and readiness result classification.

## Context Refs
- ARCH_INDEX_v1
- RULESET_CORE_v1

