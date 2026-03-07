# Grabby Task Brief: Ensure help/sprint-status read the configured contracts directory and tracking mode

## Request
Fix tracking-mode aware contract stats in help and sprint-status

## Ticket
- Ticket ID: GRAB-301
- Who: Grabby operator
- What: Ensure help/sprint-status read the configured contracts directory and tracking mode
- Why: Suggested actions and readiness must reflect real project state
- Definition of Done:
  - help reads configured contracts directory
  - sprint-status reads configured contracts directory
  - local-only mode is covered by tests
  - no hardcoded cwd/contracts in these paths

## Facilitator
- Persona: Flash
- Role: Quick Flow Dev
- Mode: quick
- Why this persona: Use quick flow for small, bounded tasks like unit tests, narrow bug fixes, and low-risk tweaks.

## Objective
Route interactive shell contract-state reads through config-aware contracts resolution

## Scope Breakdown
- lib/interactive-shell.cjs
- tests/interactive-shell.test.js

## Constraints
Keep behavior backward compatible in tracked mode

## Done When
All tests pass for updated paths, tracking mode behavior is correct

## Recommended Handoff
`grabby quick`
