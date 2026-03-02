# FC: minimal-feature
**ID:** FC-EXAMPLE-1 | **Status:** draft
CONTRACT_TYPE: FEATURE_CONTRACT
ARCH_VERSION: v3
RULESET_VERSION: v2
ENV_VERSION: v1

## Objective
Add deterministic context and guardrail checks to one local feature path.

## Scope
- Add one helper file
- Add one test file

## Non-Goals
- Cross-module architecture changes

## Directories
**Allowed:** `src/`, `tests/`
**Restricted:** `backend/`, `node_modules/`, `.env`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | `src/minimal-helper.js` | helper |
| create | `tests/minimal-helper.test.js` | validation |

## Done When
- [ ] Plan generated
- [ ] Execution scope passed
- [ ] Metrics generated

## Context Refs
- ARCH: auth-module@v3
- RULESET: imports@v2
- ENV: test-runner@v1
