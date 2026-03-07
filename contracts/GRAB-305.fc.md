# FC: Build schema-driven contract validation with configurable rules
**ID:** GRAB-305 | **Status:** complete

## Ticket
- Ticket ID: GRAB-305
- Who: Grabby maintainer
- What: Build schema-driven contract validation with configurable rules
- Why: Current regex-based validation is fragile and hardcoded thresholds are not configurable

**Data Change:** yes
**API Change:** no

## Data Impact
- [ ] Data model/schema changes required: No
- [ ] Migration required: No
- [ ] Backfill required: No
- [ ] Rollback notes documented

Rollback notes: revert `lib/contract-schema.cjs`, config wiring, and validator integration to restore legacy regex validation flow.

## Objective
Replace brittle regex parsing with schema validation for contracts, making validation rules configurable and extensible.

## Problem Statement
Current state:
- `validateContract()` uses regex for section parsing (breaks on edge cases)
- Placeholder detection checks 5 hardcoded strings
- Scope max (7) and files max (15) are hardcoded
- Vague term detection has 9 hardcoded terms
- No validation for circular contract dependencies
- Multi-line section parsing fails on missing `##` terminators

## Scope
- lib/contract-schema.cjs (new)
- lib/core.cjs
- lib/config.cjs
- docs/contract-schema.yaml (new)
- tests/contract-validation.test.js (new)

## Non-Goals
- External JSON Schema library (keep lightweight)
- Contract migration tooling
- Breaking changes to contract format

## Directories
**Allowed:** `lib`, `tests`, `docs`
**Restricted:** `node_modules/`, `.git/`, `dist/`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | `lib/contract-schema.cjs` | Schema validation engine |
| create | `docs/contract-schema.yaml` | Human-readable schema definition |
| modify | `lib/core.cjs` | Use schema validator in validateContract() |
| modify | `lib/config.cjs` | Add validation config (thresholds, rules) |
| create | `tests/contract-validation.test.js` | Comprehensive validation tests |

## Configuration Schema
```yaml
validation:
  scope:
    maxItems: 7           # Configurable max scope items
  files:
    maxCount: 15          # Configurable max files
  placeholders:           # Bracket patterns to detect as unfilled
    - pattern: NAME
    - pattern: TODO_MARKER
    - pattern: TBD_MARKER
    - pattern: FILL_IN
  vagueTerms:
    - "various"
    - "some"
    - "etc"
  strictMode: false       # Block vs warn on validation failures
```

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery, ajv (keep lightweight)
- Security: Run `npm audit` before adding packages

## Security Considerations
- [ ] Input validation for schema config
- [ ] No code execution in validation rules
- [ ] No secrets in code or test fixtures
- [ ] Dependencies remain CVE-free (`npm audit`)

## Code Quality
- [ ] TypeScript strict mode preserved (no `any`)
- [ ] JSDoc comments for schema functions
- [ ] No console.log/debugger statements left behind
- [ ] Error handling matches existing project patterns

## Done When
- [ ] Schema validator created and integrated
- [ ] Validation thresholds are configurable
- [ ] Placeholder list is extensible via config
- [ ] Vague terms list is extensible via config
- [ ] Edge cases (missing sections, multi-line) handled
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes
- [ ] Build succeeds

## Testing
- Test all validation rules with pass/fail cases
- Test config overrides
- Test edge cases (malformed YAML, missing sections)
- Test placeholder/vague term detection

## Context Refs
- ARCH_INDEX_v1
- RULESET_CORE_v1
