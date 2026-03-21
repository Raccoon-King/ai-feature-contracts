# Grabby Task Brief: Fix remaining CI merge blockers on the current head

## Request
fix merge issues on the current PR/development head

## Ticket
- Ticket ID: GRAB-CI-MERGE-001
- Who: Grabby maintainers merging release and PR validation work
- What: fix the remaining CI merge blockers on the current development head
- Why: the current tagged development head is still showing failing required checks across workflow sync, API test stability, and packaging metadata, which blocks merge confidence and release hygiene
- Definition of Done:
  - CI test suite remains reliable in hosted CI
  - Rules/config API tests are isolated from shared repo state
  - Offline packaging metadata matches the shipped runtime dependency set
  - Website sync uses documentation paths that actually exist

## Facilitator
- Persona: Archie
- Role: Contract Architect
- Mode: contract
- Why this persona: The work spans CI behavior, workflow wiring, and scoped test cleanup.

## Objective
Repair the current head by keeping the test suite deterministic in CI, correcting the rules/config route edge cases surfaced by CI, shipping the offline packaging metadata fix, and keeping the website-sync workflow aligned with the repo layout.

## Scope Breakdown
- Stabilize the health timing test for CI
- Isolate API tests from shared repo config mutations
- Correct rules/config route assumptions about cache paths, manifest shape, and missing config
- Ship the runtime dependency bundle metadata needed for offline installation
- Correct stale website-sync doc paths

## Constraints
Stay within `.github/workflows/sync-website-repo-on-tag.yml`, `lib/api-routes/`, `tests/api/`, `tests/packaging.test.js`, `package.json`, and the governing contract artifacts.

## Done When
The API tests are deterministic under parallel CI, the rules/config routes stop surfacing 500s for these merge blockers, the runtime dependency bundle metadata is correct, and the website-sync workflow references docs that exist in the repository

## Recommended Handoff
`grabby agent architect CC`
