# Grabby Task Brief: Extract filesystem abstraction layer with centralized error handling

## Request
Create centralized fs-utils to eliminate scattered I/O with inconsistent error handling

## Ticket
- Ticket ID: GRAB-304
- Who: Grabby developer
- What: Extract filesystem abstraction layer with centralized error handling
- Why: 496 sync I/O operations scattered across 36+ files cause silent failures
- Definition of Done:
  - fs-utils.cjs created with read/write/exists/ensureDir utilities
  - Error messages include context (file path, operation)
  - 5+ high-traffic files migrated
  - 80%+ test coverage on fs-utils

## Facilitator
- Persona: Dev
- Role: Implementation Developer
- Mode: execution
- Why this persona: Core infrastructure work requiring careful implementation

## Objective
Centralize file I/O operations for consistent error handling and testability

## Scope Breakdown
- lib/fs-utils.cjs (new)
- lib/core.cjs (migration)
- lib/commands.cjs (migration)
- lib/config.cjs (migration)
- lib/api-server.cjs (migration)

## Constraints
- Keep sync I/O (no async migration)
- Backward compatible function signatures where possible
- No new dependencies

## Done When
All migrated code uses fs-utils, errors include context, tests pass

## Recommended Handoff
`grabby execute GRAB-304.fc.md`
