# FC: [NAME]
**ID:** [ID] | **Status:** draft
CONTRACT_TYPE: FEATURE_CONTRACT
ARCH_VERSION: v3
RULESET_VERSION: v2
ENV_VERSION: v1

## Objective
[1-2 line description of what this feature does]

## Scope
- [In-scope item 1]
- [In-scope item 2]

## Non-Goals
- [Explicitly excluded item]

## Directories
**Allowed:** `src/components/`, `src/hooks/`, `src/services/`, `src/tests/`
**Restricted:** `backend/`, `node_modules/`, `.env*`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | `src/hooks/use[FEATURE].ts` | State management |
| create | `src/tests/use[FEATURE].test.ts` | Unit tests |
| modify | `src/types.ts` | Add interfaces |

## Security Considerations
- [ ] Input validation implemented
- [ ] No secrets in code

## Done When
- [ ] Feature works as specified
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes
- [ ] Build succeeds

## Context Refs
- ARCH: auth-module@v3
- RULESET: imports@v2
- ENV: test-runner@v1
