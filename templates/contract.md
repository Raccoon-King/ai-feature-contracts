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
- Security: Run `npm audit` before adding packages

## Security Considerations
- [ ] Input validation implemented
- [ ] No secrets in code
- [ ] Dependencies CVE-free (`npm audit`)
- [ ] Error messages don't leak sensitive info
- [ ] Auth/authz checks where needed

## Code Quality
- [ ] TypeScript strict mode (no `any`)
- [ ] ESLint passes (no warnings)
- [ ] No console.log/debugger statements
- [ ] Error handling complete
- [ ] Functions < 50 lines

## Done When
- [ ] Feature works as specified
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes
- [ ] Build succeeds
- [ ] Security checklist complete
- [ ] Code quality checklist complete

## Testing
- Unit: `src/tests/[feature].test.ts`
- Coverage: 80%+ lines, branches, functions
- E2E: `e2e/[feature].spec.ts` (if applicable)

## Context Refs
- ARCH_INDEX_v1 §frontend
- RULESET_CORE_v1 §hooks §typescript
- SECURITY_v1 §input-validation
- BEST_PRACTICES_v1 §testing
