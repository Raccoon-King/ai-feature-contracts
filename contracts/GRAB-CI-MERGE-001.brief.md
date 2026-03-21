# Grabby Task Brief: Fix remaining CI merge blockers on the current head

## Request
fix merge issues on the current PR/development head

## Ticket
- Ticket ID: GRAB-CI-MERGE-001
- Who: Grabby maintainers merging release and PR validation work
- What: fix the remaining CI merge blockers on the current development head
- Why: the current development head is still blocked by failing or missing required checks across workflow sync, API test stability, packaging metadata, and a development-side release workflow that rewrites the PR head
- Definition of Done:
  - CI test suite remains reliable in hosted CI
  - Rules/config API tests are isolated from shared repo state
  - Offline packaging metadata matches the shipped runtime dependency set
  - Website sync uses documentation paths that actually exist
  - Development pushes no longer rewrite the PR head with a release bot commit that drops required checks

## Facilitator
- Persona: Archie
- Role: Contract Architect
- Mode: contract
- Why this persona: The work spans CI behavior, workflow wiring, and scoped test cleanup.

## Objective
Repair the current head by keeping the test suite deterministic in CI, correcting the rules/config route edge cases surfaced by CI, shipping the offline packaging metadata fix, and realigning the website and release workflows with the repo's documented branch strategy.

## Scope Breakdown
- Stabilize the health timing test for CI
- Isolate API tests from shared repo config mutations
- Correct rules/config route assumptions about cache paths, manifest shape, and missing config
- Ship the runtime dependency bundle metadata needed for offline installation
- Correct stale website-sync doc paths
- Stop the release workflow from auto-mutating `development` and keep release automation main-only

## Constraints
Stay within `.github/workflows/sync-website-repo-on-tag.yml`, `.github/workflows/release.yml`, `lib/api-routes/`, `tests/api/`, `tests/packaging.test.js`, `package.json`, and the governing contract artifacts.

## Done When
The API tests are deterministic under parallel CI, the rules/config routes stop surfacing 500s for these merge blockers, the runtime dependency bundle metadata is correct, the website-sync workflow references docs that exist in the repository, and development pushes no longer replace the PR head with an unchecked release bot commit.

## Recommended Handoff
`grabby agent architect CC`
