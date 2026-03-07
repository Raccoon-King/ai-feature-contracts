# FC: adaptive-help-routing
**ID:** BMAD-211 | **Status:** complete
ARCH_VERSION: v1
RULESET_VERSION: v1
ENV_VERSION: v1

## Ticket
- Ticket ID: BMAD-201
- Who: Grabby maintainers and AI-assisted developers
- What: Add BMAD-style adaptive next-step guidance into `grabby help`
- Why: Improve workflow routing quality and reduce user confusion on next actions

## Objective
Implement stage-aware help recommendations that react to repository artifact state and governance gates.

## Scope
- Add "Suggested Now" recommendations based on contract lifecycle state
- Include command + rationale output for each recommended next action
- Ensure help never recommends governance-invalid transitions
- Keep fallback output deterministic when no artifacts exist

## Non-Goals
- Rebuilding BMAD's full module/phase command taxonomy
- Adding new personas
- Changing approval/execute governance semantics

## Directories
**Allowed:** `lib/`, `tests/`, `docs/`
**Restricted:** `contracts/`, `node_modules/`, `.git/`, `dist/`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | `lib/interactive-shell.cjs` | Add adaptive help output sections and ranked recommendations |
| modify | `lib/commands.cjs` | Reuse/centralize recommendation logic for CLI consistency |
| create | `tests/help-adaptive-routing.test.js` | Verify recommendation behavior by artifact state |
| modify | `README.md` | Document adaptive help behavior and usage expectations |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery
- Security: Run `npm audit` before adding packages

## Security Considerations
- [x] No secrets added to code or fixtures
- [x] No unsafe command execution or shell interpolation paths introduced
- [x] No governance gate bypass for approval/execution transitions

## Code Quality
- [x] Existing CLI output patterns preserved
- [x] Recommendation logic isolated and unit-testable
- [x] No dead command-path branches introduced

## Done When
- [x] Help output includes `Suggested Now` and `Also Available` sections
- [x] Top 3 recommended actions are stage-appropriate and deterministic
- [x] Help never recommends execute before approval
- [x] Automated tests cover at least 6 state scenarios
- [x] Coverage remains at or above 80%
- [x] Lint passes
- [x] Tests pass

## Testing
Unit tests for stage detection and recommendation ranking; CLI behavior assertions for representative states.

## Context Refs
- ARCH_INDEX_v1
- RULESET_CORE_v1

