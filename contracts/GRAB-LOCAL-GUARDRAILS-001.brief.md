# Grabby Task Brief: Add local lint rules, workflow policy checks, contract validation guardrails, and preflight best-practice automation that catch the recent CI merge blockers before code is pushed

## Request
add local lint rules and best-practice guardrails to catch CI, workflow, contract, packaging, and release-policy issues locally before push

## Ticket
- Ticket ID: GRAB-LOCAL-GUARDRAILS-001
- Who: Grabby maintainers and developers working locally before opening or updating PRs
- What: Add local lint rules, workflow policy checks, contract validation guardrails, and preflight best-practice automation that catch the recent CI merge blockers before code is pushed
- Why: Recent merge failures were only detected in GitHub Actions, which slowed iteration and let release-policy, workflow, and contract regressions escape local development
- Definition of Done:
  - Local preflight checks catch release-workflow branch-policy drift
  - Local validation catches contract metadata gaps before CI
  - Local packaging or dependency checks catch runtime bundle regressions before CI
  - Documentation explains the local guardrail workflow and when to run it

## Facilitator
- Persona: Archie
- Role: Contract Architect
- Mode: contract
- Why this persona: Use a full contract interview when scope or shape is still emerging.

## Objective
Add local lint rules, workflow policy checks, contract validation guardrails, and preflight best-practice automation that catch the recent CI merge blockers before code is pushed, so developers get fast feedback locally instead of discovering these failures in GitHub Actions.

## Scope Breakdown
- Replace the placeholder local lint flow with a real developer guardrail command or script
- Extend local hooks and `grabby git:preflight` checks to catch branch-policy, contract, and packaging regressions
- Add regression tests for the new local guardrail behavior
- Document the recommended local workflow for running the checks before push

## Constraints
Stay within `package.json`, `hooks/`, `lib/commands.cjs`, `lib/git-workflow.cjs`, `lib/cicd.cjs`, related tests, docs, and the governing contract artifacts.

## Done When
Local preflight checks catch release-workflow branch-policy drift, local validation catches contract metadata gaps before CI, local packaging or dependency checks catch runtime bundle regressions before CI, and the developer docs explain the local guardrail workflow and when to run it.

## Recommended Handoff
`grabby agent architect CC`
