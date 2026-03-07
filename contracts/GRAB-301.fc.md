# FC: Ensure help/sprint-status read the configured contracts directory and tracking mode
**ID:** GRAB-301 | **Status:** complete

## Ticket
- Ticket ID: GRAB-301
- Who: Grabby operator
- What: Ensure help/sprint-status read the configured contracts directory and tracking mode
- Why: Suggested actions and readiness must reflect real project state

**Data Change:** yes
**API Change:** no

## Data Impact
- [ ] Data model/schema changes required: No
- [ ] Migration required: No
- [ ] Backfill required: No
- [ ] Rollback notes documented

Rollback notes: revert changes in `lib/interactive-shell.cjs` and `tests/interactive-shell.test.js` and restore previous contract state resolution behavior.

## Objective
Route interactive shell contract-state reads through config-aware contracts resolution

## Scope
- lib/interactive-shell.cjs
- tests/interactive-shell.test.js

## Non-Goals
- No UX redesign

## Directories
**Allowed:** `lib`, `tests`
**Restricted:** `node_modules/`, `.git/`, `dist/`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | `lib/interactive-shell.cjs` | Update help/sprint-status to use config-aware contract resolution |
| modify | `tests/interactive-shell.test.js` | Add tests for tracking mode and custom contracts dir |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery
- Security: Run `npm audit` before adding packages

## Security Considerations
- [ ] Security/migration impact reviewed: None
- [ ] Input validation implemented where external input is involved
- [ ] No secrets in code or test fixtures
- [ ] Dependencies remain CVE-free (`npm audit`)

## Code Quality
- [ ] TypeScript strict mode preserved (no `any`)
- [ ] No console.log/debugger statements left behind
- [ ] Error handling matches existing project patterns

## Done When
- [ ] All tests pass for updated paths
- [ ] tracking mode behavior is correct
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes
- [ ] Build succeeds

## Testing
Add or update unit tests for tracked and local-only modes

## Context Refs
- ARCH_INDEX_v1
- RULESET_CORE_v1
