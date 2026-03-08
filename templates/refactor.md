# FC: [NAME]
**ID:** [ID] | **Status:** draft
CONTRACT_TYPE: FEATURE_CONTRACT
ARCH_VERSION: v1
RULESET_VERSION: v1
ENV_VERSION: v1

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
- ARCH: auth-module@v1
- RULESET: imports@v1
- ENV: test-runner@v1

## AI Assistant Handoff
- Generate prompt bundle: `grabby prompt [CONTRACT_FILE]`
- Prompt file: `contracts/[PROMPT_FILE]`
- Copy/paste flow:
  1. Open `contracts/[PROMPT_FILE]`
  2. Paste all contents into your AI assistant
  3. Ask it to execute only within this contract's scope and files
- File reference flow:
  - Tell your AI assistant: "Read and process `contracts/[PROMPT_FILE]` exactly, then implement only approved contract scope."
