# Grabby Task Brief: workflow website update

## Request
update the docs website with the current Grabby workflow

## Ticket
- Ticket ID: GRAB-WEBSITE-WORKFLOW-001
- Who: developers and maintainers using the Grabby docs website for onboarding and day-to-day workflow guidance
- What: Update the docs website so it reflects the current Grabby contract workflow, local preflight steps, and development-to-main release process
- Why: The website currently shows outdated or incomplete workflow guidance, which causes confusion and mismatches the repo-local process described in AGENTS.md
- Definition of Done:
  - homepage shows the current workflow at a glance
  - user guide reflects the repo-local daily workflow and release path
  - website links to a detailed workflow reference
  - workflow wording matches AGENTS.md and current grabby commands

## Facilitator
- Persona: Archie
- Role: Contract Architect
- Mode: contract
- Why this persona: Use a full contract interview when scope or shape is still emerging.

## Objective
Update the docs website so the published workflow matches the current repo-local Grabby process from intake through release.

## Scope Breakdown
- refresh the homepage workflow summary
- update the interactive user guide workflow sections
- add or restore a detailed command-line workflow doc that the site can link to
- keep the guidance aligned with AGENTS.md and current CLI behavior

## Constraints
Stay within `docs/index.html`, `docs/grabby-user-guide.html`, `docs/commandline-workflow.md`, and the governing contract artifacts.

## Done When
homepage shows the current workflow at a glance, user guide reflects the repo-local daily workflow and release path, website links to a detailed workflow reference, workflow wording matches AGENTS.md and current grabby commands

## Recommended Handoff
`grabby agent architect CC`
