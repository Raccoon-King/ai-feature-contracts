# Grabby Task Brief: Extract reusable I/O and parsing utilities to reduce duplication

## Request
Consolidate duplicated I/O and parsing patterns into reusable utilities

## Ticket
- Ticket ID: GRAB-307
- Who: Grabby developer
- What: Extract reusable I/O and parsing utilities to reduce duplication
- Why: 15+ duplicated patterns across 20+ files violates DRY
- Definition of Done:
  - io-utils.cjs with config/contract loading
  - parsing-utils.cjs with ID/section extraction
  - 3+ files migrated
  - 100+ lines of duplication eliminated

## Facilitator
- Persona: Dev
- Role: Implementation Developer
- Mode: execution
- Why this persona: Refactoring work with clear patterns

## Objective
Reduce duplication, improve maintainability

## Scope Breakdown
- lib/io-utils.cjs (new)
- lib/parsing-utils.cjs (new)
- Migrate: commands.cjs, jira.cjs, api-server.cjs, config.cjs

## Constraints
- Depends on GRAB-304 (fs-utils)
- No breaking API changes
- Phased migration (not all files at once)

## Done When
Utilities created, files migrated, duplication reduced

## Recommended Handoff
`grabby execute GRAB-307.fc.md`
