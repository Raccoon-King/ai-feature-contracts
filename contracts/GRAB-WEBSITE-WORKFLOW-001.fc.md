---
rulesets:
  version: ""
  syncedAt: 2026-03-21T23:43:14.117Z
  snapshot: []
  driftChecks:
    - timestamp: 2026-03-21T23:43:14.118Z
      command: validate
      status: drift_detected
      action: warn
      changes:
        - ruleset: languages/typescript
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: languages/javascript
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: languages/go
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: languages/python
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: frameworks/react
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: frameworks/nextjs
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: frameworks/express
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: domains/api-compat
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: domains/db-safety
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: domains/frontend-deps
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: domains/auth
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: policies/security
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: policies/git-workflow
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: policies/code-review
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: testing/unit
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: testing/integration
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: testing/coverage
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: tooling/linters
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: tooling/ci-cd
          from: null
          to: 1.0.0
          breaking: false
    - timestamp: 2026-03-21T23:43:42.702Z
      command: plan
      status: drift_detected
      action: warn
      changes:
        - ruleset: languages/typescript
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: languages/javascript
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: languages/go
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: languages/python
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: frameworks/react
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: frameworks/nextjs
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: frameworks/express
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: domains/api-compat
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: domains/db-safety
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: domains/frontend-deps
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: domains/auth
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: policies/security
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: policies/git-workflow
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: policies/code-review
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: testing/unit
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: testing/integration
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: testing/coverage
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: tooling/linters
          from: null
          to: 1.0.0
          breaking: false
        - ruleset: tooling/ci-cd
          from: null
          to: 1.0.0
          breaking: false
---
# FC: workflow website update
**ID:** GRAB-WEBSITE-WORKFLOW-001 | **Status:** approved
**Data Change:** no
**API Change:** no
**Dependency Change:** no
CONTRACT_TYPE: FEATURE_CONTRACT
**Breaking API Change Approved:** no

## Ticket
- Ticket ID: GRAB-WEBSITE-WORKFLOW-001
- Who: developers and maintainers using the Grabby docs website for onboarding and day-to-day workflow guidance
- What: Update the docs website so it reflects the current Grabby contract workflow, local preflight steps, and development-to-main release process
- Why: The website currently shows outdated or incomplete workflow guidance, which causes confusion and mismatches the repo-local process described in AGENTS.md

## Objective
Update the docs website so the published workflow matches the current repo-local Grabby process from intake through release.

## Scope
- refresh the homepage workflow summary
- update the interactive user guide workflow sections
- add or restore a detailed command-line workflow doc that the site can link to
- keep the guidance aligned with AGENTS.md and current CLI behavior

## Non-Goals
- Reworking CLI behavior or release automation
- Refreshing unrelated marketing copy
- Broad visual redesign outside the workflow content

## Directories
**Allowed:** `docs/`, `contracts/`
**Restricted:** `node_modules/`, `.git/`, `dist/`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | `contracts/GRAB-WEBSITE-WORKFLOW-001.fc.md` | Keep the docs contract aligned with the real website scope |
| modify | `contracts/GRAB-WEBSITE-WORKFLOW-001.brief.md` | Keep the brief aligned with the refined docs scope |
| modify | `contracts/GRAB-WEBSITE-WORKFLOW-001.plan.yaml` | Track the planned website documentation files |
| modify | `docs/index.html` | Update the homepage workflow summary and link to the detailed reference |
| modify | `docs/grabby-user-guide.html` | Update the interactive guide to reflect the current repo-local workflow and release path |
| create | `docs/commandline-workflow.md` | Add the detailed workflow reference the website can point developers to |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery
- Security: Run `npm audit` before adding packages

## Security Considerations
- [ ] No secrets or internal-only values are introduced into published docs
- [ ] Workflow guidance does not recommend bypassing contract or release gates
- [ ] Release instructions stay aligned with repo-local branch policy

## API Impact
- [x] No API routes or payloads change
- [x] This work is documentation-only

## Code Quality
- [ ] Workflow wording matches AGENTS.md and current CLI help
- [ ] Website guidance stays consistent between homepage and interactive guide
- [ ] Added workflow reference is readable as a standalone doc

## Done When
- [ ] homepage shows the current workflow at a glance
- [ ] user guide reflects the repo-local daily workflow and release path
- [ ] website links to a detailed workflow reference
- [ ] workflow wording matches AGENTS.md and current grabby commands
- [ ] Manual verification confirms the updated pages render and the workflow steps are internally consistent

## Testing
- Manual: review `docs/index.html` in a browser
- Manual: review `docs/grabby-user-guide.html` in a browser
- Manual: review `docs/commandline-workflow.md` for accuracy
- Manual: verify workflow commands against `AGENTS.md` and `grabby --help`

## Context Refs
- ARCH_INDEX_v1
- RULESET_CORE_v1
