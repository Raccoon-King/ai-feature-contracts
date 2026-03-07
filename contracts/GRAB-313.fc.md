# FC: Close test coverage gaps and add edge case tests
**ID:** GRAB-313 | **Status:** complete

## Ticket
- Ticket ID: GRAB-313
- Who: Grabby maintainer
- What: Close test coverage gaps and add edge case tests
- Why: Key areas lack coverage; edge cases untested; 1 failing test needs fixing

**Data Change:** no
**API Change:** yes

## API Impact
- [ ] API surface changed: test coverage only, no endpoint contract change
- [ ] Backward compatibility preserved
- [ ] Versioning/deprecation handling documented
- [ ] Rollback notes documented

Versioning/deprecation/compatibility handling: no API version bump or deprecation is required because runtime API behavior is unchanged.
Rollback notes: revert test additions/updates if they expose false positives or incompatibilities in existing test harness behavior.

## Objective
Achieve 80%+ coverage across all critical modules with comprehensive edge case testing.

## Problem Statement
Current state:
- api-server.cjs: 82.84% (missing error paths, security edge cases)
- features.cjs: no test file identified
- interactive-shell.cjs: no comprehensive coverage
- features-index.test.js: 1 failing test ("skips malformed contracts during mixed-layout discovery")
- No E2E tests for full workflow (create → plan → execute → audit)
- Untested edge cases: concurrent file mods, corrupted YAML, missing env vars

## Scope
- tests/api-server.test.js
- tests/features.test.js (new)
- tests/interactive-shell.test.js
- tests/features-index.test.js (fix failing)
- tests/e2e-workflow.test.js (new)

## Non-Goals
- 100% coverage (diminishing returns)
- Performance testing
- Load testing

## Directories
**Allowed:** `tests`, `lib` (for reference only)
**Restricted:** `node_modules/`, `.git/`, `dist/`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | `tests/api-server.test.js` | Add error path and security tests |
| create | `tests/features.test.js` | Add features.cjs coverage |
| modify | `tests/interactive-shell.test.js` | Add comprehensive coverage |
| modify | `tests/features-index.test.js` | Fix failing test |
| create | `tests/e2e-workflow.test.js` | Full workflow integration test |

## Test Cases to Add

### api-server.test.js
- [ ] Path traversal attempt (../../../etc/passwd)
- [ ] Invalid JSON in POST body
- [ ] Oversized request body
- [ ] Invalid contract name format
- [ ] Concurrent contract operations
- [ ] GraphQL query errors

### features.test.js (new)
- [ ] Feature lifecycle (create, update, archive)
- [ ] Feature state transitions
- [ ] Edge cases (missing fields, malformed data)

### interactive-shell.test.js
- [ ] Help output for each command
- [ ] Sprint-status with various contract states
- [ ] Config-aware directory resolution (per GRAB-301)

### features-index.test.js
- [ ] Fix "skips malformed contracts during mixed-layout discovery"
- [ ] Add boundary cases for layout detection

### e2e-workflow.test.js (new)
- [ ] Full workflow: task → validate → plan → approve → execute → audit
- [ ] Workflow with validation failures
- [ ] Workflow with missing dependencies

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery
- Security: Run `npm audit` before adding packages

## Security Considerations
- [ ] Test fixtures don't contain real secrets
- [ ] Security tests use safe mock data
- [ ] Dependencies remain CVE-free (`npm audit`)

## Code Quality
- [ ] TypeScript strict mode preserved (no `any`)
- [ ] Test names are descriptive
- [ ] No console.log/debugger statements left behind
- [ ] Tests are isolated (no shared state)

## Done When
- [ ] api-server.cjs coverage ≥ 85%
- [ ] features.cjs has test file with ≥ 80% coverage
- [ ] Failing test in features-index fixed
- [ ] E2E workflow test passes
- [ ] All tests pass
- [ ] Lint passes

## Testing
This IS the testing contract!

## Context Refs
- ARCH_INDEX_v1
- RULESET_CORE_v1
