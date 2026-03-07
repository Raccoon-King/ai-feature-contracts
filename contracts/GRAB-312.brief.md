# Grabby Task Brief: Create error handling framework with structured context

## Request
Establish consistent error handling with typed errors and structured logging

## Ticket
- Ticket ID: GRAB-312
- Who: Grabby developer
- What: Create error handling framework with structured context
- Why: Inconsistent error patterns make debugging difficult
- Definition of Done:
  - Error type hierarchy created (GrabbyError, ContractError, etc.)
  - Context chain support for debugging
  - Logger utility created
  - 3+ files migrated to new patterns

## Facilitator
- Persona: Dev
- Role: Implementation Developer
- Mode: execution
- Why this persona: Foundation work for error infrastructure

## Objective
Consistent, debuggable error handling

## Scope Breakdown
- lib/errors.cjs (new error types)
- lib/logger.cjs (new structured logging)
- Migrate: core.cjs, commands.cjs, api-server.cjs

## Constraints
- No external logging library
- No breaking changes to public APIs
- Error messages must be user-friendly

## Done When
Error types created, files migrated, debugging improved

## Recommended Handoff
`grabby execute GRAB-312.fc.md`
