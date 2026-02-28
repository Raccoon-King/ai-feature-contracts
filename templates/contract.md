# FC: [NAME]
**ID:** [ID] | **Status:** draft

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

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery

## Done When
- [ ] Feature works as specified
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes
- [ ] Build succeeds

## Testing
- Unit: `src/tests/[feature].test.ts`
- E2E: `e2e/[feature].spec.ts`

## Context Refs
- ARCH_INDEX_v1 §frontend
- RULESET_CORE_v1 §hooks §typescript
- ENV_STACK_v1
