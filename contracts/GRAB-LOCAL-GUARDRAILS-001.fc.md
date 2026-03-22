---
rulesets:
  version: ""
  syncedAt: 2026-03-21T23:10:21.860Z
  snapshot: []
  driftChecks:
    - timestamp: 2026-03-21T23:10:21.860Z
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
    - timestamp: 2026-03-21T23:10:23.468Z
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
# FC: Add local lint rules, workflow policy checks, contract validation guardrails, and preflight best-practice automation that catch the recent CI merge blockers before code is pushed
**ID:** GRAB-LOCAL-GUARDRAILS-001 | **Status:** draft
**Data Change:** no
**API Change:** no
**Dependency Change:** yes
CONTRACT_TYPE: FEATURE_CONTRACT
**Breaking API Change Approved:** no

## Ticket
- Ticket ID: GRAB-LOCAL-GUARDRAILS-001
- Who: Grabby maintainers and developers working locally before opening or updating PRs
- What: Add local lint rules, workflow policy checks, contract validation guardrails, and preflight best-practice automation that catch the recent CI merge blockers before code is pushed
- Why: Recent merge failures were only detected in GitHub Actions, which slowed iteration and let release-policy, workflow, and contract regressions escape local development

## Objective
Add local lint rules, workflow policy checks, contract validation guardrails, and preflight best-practice automation that catch the recent CI merge blockers before code is pushed, so developers get fast local feedback before a branch update or PR rerun.

## Scope
- Replace the placeholder local lint flow with a real guardrail command or script that developers can run before push
- Extend local preflight and hook checks to catch release-policy drift, contract validation gaps, and packaging metadata issues that recently escaped to CI
- Reuse existing `grabby guard`, `grabby git:preflight`, and hook surfaces where possible instead of introducing a parallel workflow
- Add regression coverage for the new local guardrail behavior and failure messaging
- Document the recommended local workflow for running the new checks before updating a PR

## Non-Goals
- Rebuilding the hosted GitHub Actions pipeline
- Adding unrelated product features or API endpoints
- Replacing Grabby's contract workflow with a third-party lint stack

## Directories
**Allowed:** `hooks/`, `lib/`, `tests/`, `docs/`, `contracts/`
**Restricted:** `node_modules/`, `.git/`, `dist/`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | `contracts/GRAB-LOCAL-GUARDRAILS-001.fc.md` | Keep the story aligned with the real repo scope |
| modify | `contracts/GRAB-LOCAL-GUARDRAILS-001.brief.md` | Keep the brief aligned with the refined story scope |
| modify | `contracts/GRAB-LOCAL-GUARDRAILS-001.plan.yaml` | Track the planned implementation files once the story is validated |
| modify | `package.json` | Replace the placeholder lint command and expose a local preflight entrypoint if needed |
| modify | `hooks/pre-commit` | Catch more contract and dependency issues before commit |
| modify | `hooks/pre-push` | Catch branch-policy and release-policy issues before push |
| modify | `lib/commands.cjs` | Extend the existing local guardrail and preflight commands |
| modify | `lib/git-workflow.cjs` | Centralize branch-policy and required-check validation used by local preflight |
| modify | `lib/cicd.cjs` | Keep generated automation guidance aligned with the new local guardrail workflow |
| modify | `tests/commands.test.js` | Cover the local guardrail command behavior and messaging |
| modify | `tests/git-workflow.test.js` | Cover branch-policy and preflight regressions locally |
| modify | `tests/cicd.test.js` | Cover any updated local automation templates or generated commands |
| modify | `docs/commandline-workflow.md` | Document the local preflight sequence for developers |
| modify | `docs/BEST_PRACTICES.md` | Document the best-practice checks developers should run locally |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery
- Security: Run `npm audit` before adding packages

## Dependency Impact
- [x] The preferred solution should reuse existing packages and commands where possible
- [x] Changes may update package scripts or guardrail metadata even if no new runtime dependency is added
- [x] Any new dependency must be justified by local developer feedback quality, not convenience alone

## Security Considerations
- [ ] No secrets or tokens are introduced into hook logic or local automation
- [ ] Local checks do not silently bypass existing release or branch-policy protections
- [ ] Dependency-related checks do not encourage ignoring audit failures
- [ ] Guardrail output remains actionable and does not misreport repo state

## API Impact
- [x] No public API routes or response shapes are changed by this story
- [x] The work is limited to local developer tooling, hooks, commands, and documentation

## Code Quality
- [ ] New local checks are deterministic on Windows and POSIX shells
- [ ] Guardrail failures explain what went wrong and what command to run next
- [ ] Existing `grabby` guard/preflight flows remain the single source of truth for policy checks
- [ ] Added checks are covered by targeted regression tests

## Done When
- [ ] Local preflight checks catch release-workflow branch-policy drift
- [ ] Local validation catches contract metadata gaps before CI
- [ ] Local packaging or dependency checks catch runtime bundle regressions before CI
- [ ] Developers have a documented one-command or short-sequence local workflow to run before push
- [ ] Regression tests cover the new local guardrail behavior
- [ ] Lint or guardrail checks pass locally
- [ ] Focused verification passes with 80%+ coverage maintained

## Testing
- Unit: `tests/commands.test.js`
- Unit: `tests/git-workflow.test.js`
- Unit: `tests/cicd.test.js`
- Full suite: `npm test -- --runInBand`

## Context Refs
- ARCH_INDEX_v1
- RULESET_CORE_v1
