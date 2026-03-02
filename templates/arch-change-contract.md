# FC: [NAME]
**ID:** [ID] | **Status:** draft
CONTRACT_TYPE: ARCH_CHANGE_CONTRACT
ARCH_VERSION: v3
RULESET_VERSION: v2
ENV_VERSION: v1
REQUIRES_ARCH_APPROVAL: true
ARCH_APPROVED: false

## Objective
[Boundary-level change summary]

## Architectural Justification
[Required: why boundary/rule exception is needed]

## Expanded Plan Review
- [ ] Cross-module impact listed
- [ ] Compatibility strategy listed
- [ ] Rollback strategy listed

## Scope
- [Module boundary change]

## Directories
**Allowed:** `src/`, `docs/`
**Restricted:** `node_modules/`, `.env*`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | `src/[module]/index.ts` | Boundary update |

## Context Refs
- ARCH: auth-module@v3
- RULESET: imports@v2
- ENV: test-runner@v1
