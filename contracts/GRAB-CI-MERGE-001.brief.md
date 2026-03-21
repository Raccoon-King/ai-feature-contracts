# Grabby Task Brief: Fix CI and website-sync merge blockers on the current head

## Request
fix merge issues on the current PR/development head

## Ticket
- Ticket ID: GRAB-CI-MERGE-001
- Who: Grabby maintainers merging release and PR validation work
- What: fix CI and website-sync merge blockers on the current development head
- Why: the current tagged development head is showing failing required checks and a broken website sync workflow, which blocks merge confidence and release hygiene
- Definition of Done:
  - CI test suite remains reliable in hosted CI
  - The orphaned calculator unit test is removed
  - Website sync uses documentation paths that actually exist

## Facilitator
- Persona: Archie
- Role: Contract Architect
- Mode: contract
- Why this persona: The work spans CI behavior, workflow wiring, and scoped test cleanup.

## Objective
Repair the current head by keeping the test suite deterministic in CI and correcting the broken website-sync workflow inputs.

## Scope Breakdown
- Stabilize the health timing test for CI
- Remove the dead calculator test
- Correct stale website-sync doc paths

## Constraints
Stay within `.github/workflows/sync-website-repo-on-tag.yml`, `tests/api/health.test.js`, `tests/unit/calculator.test.js`, and the governing contract artifacts.

## Done When
The health timing test is CI-safe, the orphaned calculator test is gone, and the website-sync workflow references docs that exist in the repository

## Recommended Handoff
`grabby agent architect CC`
