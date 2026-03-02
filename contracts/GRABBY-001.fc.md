# Feature Contract: Comprehensive Test Suite for Grabby
**ID:** GRABBY-001 | **Status:** paused
CONTRACT_TYPE: FEATURE_CONTRACT
ARCH_VERSION: v1
RULESET_VERSION: v1
ENV_VERSION: v1

## Objective
Add broad automated test coverage for Grabby's current `lib/` surface area, including unit, integration, and E2E coverage for the implemented modules and primary CLI workflows.

## Scope
- Expand unit tests for modules under `lib/`
- Maintain integration coverage for cross-module workflows
- Maintain E2E coverage for CLI command flows and file generation
- Track global coverage progress against repository thresholds
- Document deferred coverage gaps that block full completion

## Non-Goals
- Refactor production code solely to make tests easier to write
- Add new product functionality unrelated to testability
- Change dependency versions unless a test blocker requires it

## Directories
**Allowed:** `lib/`, `tests/`, `contracts/`, `coverage/`
**Restricted:** `bin/`, `node_modules/`, `.git/`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | `tests/*.test.js` | Expand unit coverage for primary CommonJS modules |
| modify | `tests/*.test.cjs` | Cover legacy fixtures and CommonJS-specific flows |
| modify | `tests/integration/*.test.js` | Validate cross-module orchestration and governance flows |
| modify | `tests/e2e/*.test.js` | Validate CLI workflows end to end |
| generate | `coverage/` | Capture Jest coverage reports for threshold tracking |
| modify | `contracts/GRABBY-001.fc.md` | Record current status, scope, and deferred gaps |

## Dependencies
- Existing test runner: `jest@29.7.0`
- Existing repository command: `npm test`
- No new runtime dependencies required for this contract

## Security Considerations
- [ ] Test fixtures must not include real secrets, tokens, or credentials
- [ ] Mocks for filesystem and process execution must avoid unsafe command execution
- [ ] Coverage and test artifacts must stay within repository-approved directories

## Done When
- [x] All currently implemented modules have corresponding test coverage in `tests/`
- [ ] Unit tests cover all exported functions across all targeted modules
- [x] Integration tests verify cross-module workflows
- [x] E2E tests validate CLI commands and file generation
- [ ] Coverage meets repository thresholds: 80% lines, functions, statements and 70% branches
- [x] `npm test` passes without regressions
- [ ] `npm run lint` passes or the repository's no-op lint contract is explicitly accepted
- [ ] `npm audit` shows no new high or critical findings introduced by test-related changes
- [ ] Deferred gaps are either closed or split into follow-up contracts before this contract is marked complete

## Testing

### Unit Tests
- Cover exported functions per module
- Exercise edge cases, invalid input, and failure paths
- Mock filesystem, process, and interactive boundaries where required

### Integration Tests
- Validate contract validation -> plan generation -> execution-adjacent workflows
- Verify governance enforcement and context handling across modules
- Verify persona and orchestration handoffs where implemented

### E2E Tests
- Validate CLI commands end to end
- Validate file generation workflows
- Validate error reporting and user feedback

## Existing Test Infrastructure
- Runner: `jest 29.7.0`
- Pattern: `**/tests/**/*.test.js`
- Coverage output: `coverage/`
- Current known result captured in this contract: 711 passed, 1 skipped

## Code Quality
- [ ] Keep tests deterministic and filesystem-safe
- [ ] Prefer focused fixtures over broad integration setup when unit scope is sufficient
- [ ] Avoid duplicating implementation logic inside assertions

## Context Refs
- ARCH: auth-module@v1
- RULESET: imports@v1
- ENV: test-runner@v1

## Risk Assessment
| Risk | Mitigation |
|------|------------|
| Broad module surface area | Prioritize highest-complexity modules first and track the remainder explicitly |
| Branch coverage remains below threshold | Focus additions on conditional paths and failure handling |
| Test maintenance cost grows with module count | Reuse helpers and fixtures instead of duplicating setup |

## Status Notes
- Work is paused because coverage thresholds remain below the repository completion bar.
- This contract should remain `paused` until the deferred unit and coverage gaps are either finished here or split into smaller follow-up contracts.
