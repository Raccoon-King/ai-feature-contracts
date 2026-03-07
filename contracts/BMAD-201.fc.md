# FC: bmad-logic-adoption
**ID:** BMAD-201 | **Status:** complete
ARCH_VERSION: v1
RULESET_VERSION: v1
ENV_VERSION: v1

## Ticket
- Ticket ID: BMAD-201
- Who: Grabby maintainers and AI-assisted developers
- What: Adopt high-value BMAD logic for adaptive guidance, deeper quick-flow guardrails, and implementation cadence artifacts while preserving Grabby contract governance
- Why: Current Grabby flow is strong but lighter than BMAD; we want to import proven logic where it increases reliability and reduces rework

## Objective
Define and stage BMAD logic imports into Grabby through bounded, testable stories

**Data Change:** yes

## Scope
- Implement adaptive next-step guidance in grabby help
- Strengthen quick-flow with scope escalation and adversarial review loops
- Add story/sprint progress artifacts tied to contracts
- Expand testing path with risk-based verification tiers
- Add migration and compatibility guards for existing Grabby users

## Non-Goals
- Full PRD/UX document ceremony parity with BMAD
- One-to-one reproduction of all BMAD modules
- Persona proliferation beyond Grabby stage ownership

## Directories
**Allowed:** `contracts/`, `lib/`, `workflows/`, `docs/`, `tests/`
**Restricted:** `node_modules/`, `.git/`, `dist/`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | `contracts/BMAD-201.stories.md` | Canonical phased story set for BMAD logic adoption |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery
- Security: Run `npm audit` before adding packages

## Security Considerations
- [x] Security/migration impact reviewed: None
- [x] Input validation implemented where external input is involved
- [x] No secrets in code or test fixtures
- [x] Dependencies remain CVE-free (`npm audit`)

## Code Quality
- [x] TypeScript strict mode preserved (no `any`)
- [x] No console.log/debugger statements left behind
- [x] Error handling matches existing project patterns

## Data Impact
- [x] No schema migration required
- [x] No data backfill required
- [x] Rollback steps documented for config and workflow changes

## Done When
- [x] Stories are sequenced by dependency and risk
- [x] Each story has objective acceptance checks
- [x] Backlog can be executed incrementally without broad rewrites
- [x] Tests pass (80%+ coverage)
- [x] Lint passes
- [x] Build succeeds

## Testing
Unit and integration coverage for new routing and workflow logic

## Context Refs
- ARCH_INDEX_v1
- RULESET_CORE_v1


