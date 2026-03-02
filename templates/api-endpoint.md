# FC: [NAME]
**ID:** [ID] | **Status:** draft
CONTRACT_TYPE: FEATURE_CONTRACT
ARCH_VERSION: v1
RULESET_VERSION: v1
ENV_VERSION: v1

## Objective
Create API endpoint for [NAME] that [purpose].

## Scope
- Route handler implementation
- Request validation
- Response formatting
- Error handling

## Non-Goals
- Frontend integration
- Database schema changes
- Authentication changes

## Directories
**Allowed:** `src/api/`, `src/services/`, `src/types/`, `src/tests/`
**Restricted:** `frontend/`, `node_modules/`, `.env*`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | `src/api/[NAME].ts` | Route handler |
| create | `src/services/[NAME]Service.ts` | Business logic |
| create | `src/types/[NAME].ts` | Request/response types |
| create | `src/tests/[NAME].test.ts` | Unit tests |
| modify | `src/api/index.ts` | Register route |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery

## Done When
- [ ] Endpoint responds correctly
- [ ] Input validation works
- [ ] Error cases handled
- [ ] Types are correct
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes
- [ ] Build succeeds

## Testing
- Unit: `src/tests/[NAME].test.ts`
- Integration: `src/tests/[NAME].integration.test.ts`

## Context Refs
- ARCH: auth-module@v1
- RULESET: imports@v1
- ENV: test-runner@v1
