# FC: [NAME]
**ID:** [ID] | **Status:** draft

## Objective
Refactor [target] to [improvement goal].

## Scope
- [Specific refactoring task 1]
- [Specific refactoring task 2]
- Update affected tests

## Non-Goals
- Feature changes
- API changes
- Database changes

## Directories
**Allowed:** `src/`
**Restricted:** `node_modules/`, `.env*`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | `src/[file1]` | Refactor target |
| modify | `src/[file2]` | Affected file |
| modify | `src/tests/[test]` | Update tests |

## Dependencies
- Allowed: none (no new packages)
- Banned: moment, lodash, jquery

## Done When
- [ ] Behavior unchanged (no regressions)
- [ ] Code is cleaner/more maintainable
- [ ] All existing tests pass
- [ ] Lint passes
- [ ] Build succeeds
- [ ] No performance regression

## Testing
- All existing tests must pass
- No new tests required (unless coverage drops)

## Constraints
- No behavior changes
- Maintain backwards compatibility
- Preserve API contracts

## Context Refs
- ARCH_INDEX_v1
- RULESET_CORE_v1
