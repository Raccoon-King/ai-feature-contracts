# FC: Document and enforce a narrow default workflow path to reduce command-surface drift
**ID:** GRAB-303 | **Status:** complete

## Ticket
- Ticket ID: GRAB-303
- Who: Grabby maintainer
- What: Document and enforce a narrow default workflow path to reduce command-surface drift
- Why: Limit scope creep and keep core lifecycle discoverable

**Data Change:** yes
**API Change:** no

## Data Impact
- [ ] Data model/schema changes required: No
- [ ] Migration required: No
- [ ] Backfill required: No
- [ ] Rollback notes documented

Rollback notes: revert help/doc updates in `README.md`, `docs/EXECUTION_PROTOCOL.md`, and `lib/interactive-shell.cjs` if workflow guidance must be rolled back.

## Objective
Reduce perceived scope creep while preserving capability

## Scope
- README.md
- docs/EXECUTION_PROTOCOL.md
- lib/interactive-shell.cjs
- tests/help-adaptive-routing.test.js

## Non-Goals
- Removing existing commands

## Directories
**Allowed:** `docs`, `lib`, `tests`
**Restricted:** `node_modules/`, `.git/`, `dist/`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | `README.md` | Restructure to lead with core workflow, group advanced options |
| modify | `docs/EXECUTION_PROTOCOL.md` | Document narrow default path clearly |
| modify | `lib/interactive-shell.cjs` | Update help output to prioritize core commands |
| modify | `tests/help-adaptive-routing.test.js` | Verify suggested-now prioritizes core flow |

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
- [ ] Help and docs lead with core lifecycle; advanced options remain accessible
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes
- [ ] Build succeeds

## Testing
Update command/help suggestion tests

## Context Refs
- ARCH_INDEX_v1
- RULESET_CORE_v1
