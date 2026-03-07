# Grabby Task Brief: Include project-context summary as optional bounded context in plan and execute

## Request
Inject lean project-context summary into plan/execute context

## Ticket
- Ticket ID: GRAB-302
- Who: Grabby operator
- What: Include project-context summary as optional bounded context in plan and execute
- Why: Project-level context should be operational, not only informational
- Definition of Done:
  - project context injection is optional and bounded
  - respects llmContext lean settings
  - falls back safely when file missing
  - tests cover injection and absence

## Facilitator
- Persona: Sage
- Role: Plan Strategist
- Mode: planning
- Why this persona: Use planning mode when the task needs epics, sequencing, or implementation strategy.

## Objective
Wire project-context summary into context resolution without token bloat

## Scope Breakdown
- lib/commands.cjs
- lib/governance-runtime.cjs
- tests/llm-context-policy.test.js
- tests/commands.test.js

## Constraints
Keep token budgets enforced

## Done When
Plan/execute include bounded project context when enabled, no token budget regressions

## Recommended Handoff
`grabby agent strategist GP`
