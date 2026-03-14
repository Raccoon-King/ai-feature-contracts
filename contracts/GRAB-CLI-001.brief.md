# Grabby Task Brief: harden CLI parsing and non-interactive workflow behavior

## Request
Harden Grabby CLI logic exposed by the calculator integration workflow

## Ticket
- Ticket ID: GRAB-CLI-001
- Who: Grabby maintainers
- What: harden CLI parsing and non-interactive workflow behavior
- Why: the calculator integration workflow exposed flag parsing bugs and noisy non-interactive intake behavior
- Definition of Done:
  - Calculator integration workflow stays green
  - Quick flag parsing no longer treats flags as positional targets
  - Non-interactive task intake no longer emits misleading failure noise
  - Regression coverage added for the affected flows

## Facilitator
- Persona: Archie
- Role: Contract Architect
- Mode: contract
- Why this persona: Use a full contract interview when scope or shape is still emerging.

## Objective
Fix the Grabby CLI logic gaps exposed by the calculator integration workflow, especially flag parsing in interactive entrypoints and noisy non-interactive task intake behavior.

## Scope Breakdown
- Make positional argument parsing ignore flags for interactive commands
- Fix non-interactive task intake to avoid misleading failure output when structured input is supplied
- Add regression tests for quick and task flows
- Preserve calculator integration workflow behavior in fresh temp projects

## Constraints
Stay within the intended files and keep the change bounded

## Done When
All integration tests pass with npx.cmd jest tests/integration --runInBand, Quick non-interactive mode returns guidance instead of treating flags as files, Task non-interactive mode succeeds without misleading intake failure noise, Affected interactive entrypoints have regression coverage

## Recommended Handoff
`grabby agent architect CC`
