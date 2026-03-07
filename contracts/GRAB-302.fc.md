# FC: Include project-context summary as optional bounded context in plan and execute
**ID:** GRAB-302 | **Status:** complete

## Ticket
- Ticket ID: GRAB-302
- Who: Grabby operator
- What: Include project-context summary as optional bounded context in plan and execute
- Why: Project-level context should be operational, not only informational

**Data Change:** yes
**API Change:** no

## Data Impact
- [ ] Data model/schema changes required: No
- [ ] Migration required: No
- [ ] Backfill required: No
- [ ] Rollback notes documented

Rollback notes: revert changes in `lib/commands.cjs`, `lib/governance-runtime.cjs`, and related tests to disable project-context summary injection.

## Objective
Wire project-context summary into context resolution without token bloat

## Scope
- lib/commands.cjs
- lib/governance-runtime.cjs
- tests/llm-context-policy.test.js
- tests/commands.test.js

## Non-Goals
- No full project-context dump into prompts

## Directories
**Allowed:** `lib`, `tests`
**Restricted:** `node_modules/`, `.git/`, `dist/`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | `lib/commands.cjs` | Add project-context injection to plan/execute handlers |
| modify | `lib/governance-runtime.cjs` | Extend context resolver with project-context summary |
| modify | `tests/llm-context-policy.test.js` | Test bounded context injection and token limits |
| modify | `tests/commands.test.js` | Test plan/execute with project context enabled/disabled |

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
- [ ] Plan/execute include bounded project context when enabled
- [ ] no token budget regressions
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes
- [ ] Build succeeds

## Testing
Add focused tests for summary injection and budget limits

## Context Refs
- ARCH_INDEX_v1
- RULESET_CORE_v1
