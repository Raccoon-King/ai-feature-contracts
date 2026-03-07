# Grabby Task Brief: Document and enforce a narrow default workflow path to reduce command-surface drift

## Request
Define scope guardrails and simplify default operator path

## Ticket
- Ticket ID: GRAB-303
- Who: Grabby maintainer
- What: Document and enforce a narrow default workflow path to reduce command-surface drift
- Why: Limit scope creep and keep core lifecycle discoverable
- Definition of Done:
  - core path is documented first in help/readme
  - advanced commands are grouped behind secondary sections
  - tests verify suggested-now prioritizes core flow
  - scope rationale documented

## Facilitator
- Persona: Archie
- Role: Contract Architect
- Mode: contract
- Why this persona: Use a full contract interview when scope or shape is still emerging.

## Objective
Reduce perceived scope creep while preserving capability

## Scope Breakdown
- README.md
- docs/EXECUTION_PROTOCOL.md
- lib/interactive-shell.cjs
- tests/help-adaptive-routing.test.js

## Constraints
No breaking CLI changes

## Done When
Help and docs lead with core lifecycle; advanced options remain accessible

## Recommended Handoff
`grabby agent architect CC`
