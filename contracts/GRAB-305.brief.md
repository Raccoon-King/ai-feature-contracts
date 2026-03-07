# Grabby Task Brief: Build schema-driven contract validation with configurable rules

## Request
Replace fragile regex validation with schema-driven validation and configurable rules

## Ticket
- Ticket ID: GRAB-305
- Who: Grabby maintainer
- What: Build schema-driven contract validation with configurable rules
- Why: Regex parsing is fragile; hardcoded thresholds prevent customization
- Definition of Done:
  - Schema validator replaces regex parsing
  - Thresholds (scope max, files max) configurable
  - Placeholder/vague term lists extensible
  - Edge cases handled gracefully
  - 80%+ test coverage

## Facilitator
- Persona: Sage
- Role: Plan Strategist
- Mode: planning
- Why this persona: Validation architecture needs careful design

## Objective
Schema-driven, configurable contract validation

## Scope Breakdown
- lib/contract-schema.cjs (new validation engine)
- docs/contract-schema.yaml (schema definition)
- lib/core.cjs (integrate validator)
- lib/config.cjs (validation config)

## Constraints
- No external JSON Schema library (keep lightweight)
- No breaking changes to contract format
- Validation warnings must be clear and actionable

## Done When
Validation is configurable, edge cases handled, tests pass

## Recommended Handoff
`grabby agent strategist GP`
