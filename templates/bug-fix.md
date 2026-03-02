# FC: [NAME]
**ID:** [ID] | **Status:** draft
CONTRACT_TYPE: FEATURE_CONTRACT
ARCH_VERSION: v3
RULESET_VERSION: v2
ENV_VERSION: v1

## Objective
Fix bug: [brief description of the bug]

## Bug Details
- **Symptom:** [What the user sees]
- **Expected:** [What should happen]
- **Actual:** [What actually happens]
- **Reproduction:** [Steps to reproduce]

## Scope
- Identify root cause
- Implement fix
- Add regression test

## Non-Goals
- Feature enhancements
- Refactoring unrelated code
- Performance improvements

## Directories
**Allowed:** `src/`
**Restricted:** `node_modules/`, `.env*`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | `src/[file]` | Bug fix location |
| create | `src/tests/[bug-name].test.ts` | Regression test |

## Dependencies
- Allowed: none
- Banned: moment, lodash, jquery

## Done When
- [ ] Bug no longer reproduces
- [ ] Regression test added
- [ ] No other tests broken
- [ ] Lint passes
- [ ] Build succeeds

## Testing
- Regression: `src/tests/[bug-name].test.ts`
- Manual verification: [steps to verify fix]

## Root Cause (fill after investigation)
[To be filled during implementation]

## Context Refs
- ARCH: auth-module@v3
- RULESET: imports@v2
- ENV: test-runner@v1
