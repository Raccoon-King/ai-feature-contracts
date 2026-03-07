# FC: bmad-import-matrix-and-rubric
**ID:** BMAD-216 | **Status:** complete
ARCH_VERSION: v1
RULESET_VERSION: v1
ENV_VERSION: v1

## Ticket
- Ticket ID: BMAD-201
- Who: Grabby maintainers and AI-assisted developers
- What: Produce adoption matrix and scoring rubric for BMAD logic imports
- Why: Ensure only high-value BMAD logic is imported and avoid unnecessary ceremony

## Objective
Create canonical decision artifacts that prioritize BMAD logic imports by measurable value.

## Scope
- Build capability matrix mapping BMAD workflow logic to Grabby equivalents
- Define and apply high-value scoring rubric (impact, cost, governance fit, maintenance burden)
- Produce prioritized import queue (`P0`, `P1`, `P2`) with rationale
- Identify explicit reject/defer candidates

## Non-Goals
- Implementing runtime behavior changes
- Introducing new CLI commands in this contract
- Full BMAD parity planning

## Directories
**Allowed:** `contracts/`, `docs/`
**Restricted:** `lib/`, `tests/`, `workflows/`, `node_modules/`, `.git/`, `dist/`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | `contracts/BMAD-216.import-matrix.md` | Capability mapping and adoption decisions |
| create | `contracts/BMAD-216.rubric.md` | Scoring rubric and prioritization outcomes |
| modify | `contracts/BMAD-201.stories.md` | Update story ordering and references from rubric output |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery
- Security: Run `npm audit` before adding packages

## Security Considerations
- [x] Planning artifacts contain no secrets or internal credentials
- [x] Recommendations do not weaken existing governance controls

## Code Quality
- [x] Matrix and rubric are structured and reviewable
- [x] Prioritization rationale is explicit per candidate

## Done When
- [x] Matrix covers at least help, quick flow, readiness, testing depth, and cadence tracking
- [x] Every candidate has a decision (`adopt`, `adapt`, `defer`, `reject`) with reason
- [x] Rubric scoring produces a ranked `P0/P1/P2` import queue
- [x] BMAD-201 story set reflects rubric-driven prioritization
- [x] Coverage remains at or above 80% (N/A: docs-only contract)
- [x] Lint passes (N/A: docs-only contract)

## Testing
N/A (documentation and planning artifact contract).

## Context Refs
- ARCH_INDEX_v1
- RULESET_CORE_v1

