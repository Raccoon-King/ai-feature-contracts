# FC: harden CLI parsing and non-interactive workflow behavior
**ID:** GRAB-CLI-001 | **Status:** approved
ARCH_VERSION: v1
RULESET_VERSION: v1
ENV_VERSION: v1
**Data Change:** yes

## Ticket
- Ticket ID: GRAB-CLI-001
- Who: Grabby maintainers
- What: harden CLI parsing and non-interactive workflow behavior
- Why: the calculator integration workflow exposed flag parsing bugs and noisy non-interactive intake behavior

## Objective
Fix the Grabby CLI logic gaps exposed by the calculator integration workflow, especially flag parsing in interactive entrypoints and noisy non-interactive task intake behavior.

## Scope
- Make positional argument parsing ignore flags for interactive commands
- Fix non-interactive task intake to avoid misleading failure output when structured input is supplied
- Add regression tests for quick and task flows
- Preserve calculator integration workflow behavior in fresh temp projects

## Non-Goals
- Changing unrelated workflow semantics
- Weakening integration test assertions
- Introducing repo-specific assumptions into temp-project flows

## Directories
**Allowed:** `lib/`, `bin/`, `tests/integration/`, `tests/`
**Restricted:** `node_modules/`, `.git/`, `dist/`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | `lib/interactive-shell.cjs` | Fix interactive command flag parsing and quick-flow routing |
| modify | `lib/interactive-workflows.cjs` | Remove misleading non-interactive intake failure output if workflow logic requires changes there |
| modify | `tests/integration/grabby-calculator-integration.test.js` | Regression coverage for calculator workflow and non-interactive flows |

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

## Data Impact
- [ ] No user-facing persisted data format changes
- [ ] No contract artifact schema changes without compatibility review
- [ ] Any workflow metadata changes remain backward compatible for existing contracts/plans/audits

## Rollback Plan
- Revert CLI parsing changes in `lib/interactive-shell.cjs` if interactive command routing regresses
- Revert non-interactive workflow changes if task intake behavior becomes ambiguous or breaks existing automation
- Re-run `npx.cmd jest tests/integration --runInBand` after rollback to confirm previous behavior is restored

## Done When
- [ ] All integration tests pass with npx.cmd jest tests/integration --runInBand
- [ ] Quick non-interactive mode returns guidance instead of treating flags as files
- [ ] Task non-interactive mode succeeds without misleading intake failure noise
- [ ] Affected interactive entrypoints have regression coverage
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes
- [ ] Build succeeds

## Testing
- Integration: `tests/integration/grabby-calculator-integration.test.js`

## Context Refs
- ARCH_INDEX_v1
- RULESET_CORE_v1
