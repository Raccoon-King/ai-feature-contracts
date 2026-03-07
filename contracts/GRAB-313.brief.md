# Grabby Task Brief: Close test coverage gaps and add edge case tests

## Request
Improve test coverage and fix failing tests

## Ticket
- Ticket ID: GRAB-313
- Who: Grabby maintainer
- What: Close test coverage gaps and add edge case tests
- Why: Key areas lack coverage; 1 failing test; no E2E tests
- Definition of Done:
  - api-server.cjs ≥ 85% coverage
  - features.cjs test file created
  - Failing test fixed
  - E2E workflow test added

## Facilitator
- Persona: Iris
- Role: Audit Reviewer
- Mode: review
- Why this persona: Quality-focused work ensuring comprehensive coverage

## Objective
Achieve 80%+ coverage with edge case testing

## Scope Breakdown
- tests/api-server.test.js (expand)
- tests/features.test.js (new)
- tests/features-index.test.js (fix)
- tests/e2e-workflow.test.js (new)

## Constraints
- No 100% coverage requirement (diminishing returns)
- Tests must be isolated (no shared state)
- Use existing test patterns

## Done When
Coverage goals met, failing test fixed, E2E added

## Recommended Handoff
`grabby audit GRAB-313.fc.md`
