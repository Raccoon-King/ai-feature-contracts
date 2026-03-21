---
rulesets:
  version: ""
  syncedAt: 2026-03-21T19:55:16.946Z
  snapshot: []
  driftChecks:
    - timestamp: 2026-03-21T19:55:16.946Z
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
---
# FC: Add a localhost developer UI for contract visualization and artifact management
**ID:** GRAB-CONTRACT-UI-001 | **Status:** draft
**Data Change:** no
**API Change:** yes
**Dependency Change:** no
CONTRACT_TYPE: FEATURE_CONTRACT

## Ticket
- Ticket ID: GRAB-CONTRACT-UI-001
- Who: Grabby developers and maintainers
- What: add a localhost frontend interface for developer contract visualization and API-driven contract workflow management
- Why: developers need a local visual interface to inspect contracts, see lifecycle state, review all related artifacts, and trigger API-backed actions without working only in raw markdown or curl

## Objective
Deliver a localhost-only developer interface that lets developers browse existing contracts, view all files related to a selected contract in a structured visual workflow, highlight status and progress signals, and copy the generated brief without dropping back to raw markdown as the primary experience.

## Scope
- Add a browser-based localhost UI for browsing existing contracts and opening a selected contract workspace
- Extend the local contracts API so the UI can load the selected contract plus related brief, plan, backlog, audit, prompt, and similar artifact files when they exist
- Visualize artifact content as structured panels and highlighted workflow data instead of only rendering raw markdown text
- Emphasize contract status, progress, scoped files/functions to change when present, artifact availability, and other developer-relevant signals
- Provide quick actions for copying the brief content and calling supported local contract workflow actions through the API
- Document the local developer run flow for API plus UI together

## Non-Goals
- Remote or multi-user hosting beyond localhost development
- Replacing markdown artifacts as the source of truth on disk
- Building a rich text contract editor in this first pass
- Introducing a new frontend framework or external UI dependency stack

## Directories
**Allowed:** `grabby-website/`, `lib/`, `tests/`, `docs/`, `contracts/`
**Restricted:** `node_modules/`, `.git/`, `dist/`, `coverage/`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | `contracts/GRAB-CONTRACT-UI-001.fc.md` | Keep the governing contract aligned with the finalized localhost UI and artifact-bundle scope |
| modify | `lib/api-routes/contracts.cjs` | Expose related contract artifacts and action data in a UI-friendly shape |
| modify | `lib/api-server-v2.cjs` | Route the localhost developer UI alongside the existing API server |
| create | `grabby-website/public/dev-contracts.html` | Provide the browser entry point for the contract visualization workspace |
| create | `grabby-website/public/dev-contracts.js` | Implement artifact loading, visualization, copy-brief, and contract action flows |
| create | `grabby-website/public/dev-contracts.css` | Style the localhost contract workspace with clear status and progress emphasis |
| modify | `tests/api/contracts.test.js` | Verify related artifact data and contract action responses used by the UI |
| modify | `tests/api-server-v2.test.js` | Verify the localhost server exposes the developer UI surface correctly |
| modify | `docs/openapi.yaml` | Document additive contract artifact payloads required by the UI |
| modify | `docs/API.md` | Document how developers run and use the localhost contract UI with the REST API |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery
- Security: Run `npm audit` if dependency scope changes

## Security Considerations
- [ ] Localhost-only exposure preserved for the developer UI
- [ ] No secrets embedded in frontend assets or artifact payloads
- [ ] Additive API changes stay within the existing local trust model
- [ ] No new dependency risk introduced without review

## API Impact
- [x] Additive response fields or companion payloads only; no breaking removal of existing contract fields
- [x] Versioning and UI-consumer expectations documented in `docs/openapi.yaml` and `docs/API.md`

## Code Quality
- [ ] UI stays dependency-light and consistent with existing repo patterns
- [ ] API changes remain additive and scoped to developer visualization needs
- [ ] Tests cover artifact bundle loading, localhost UI exposure, and copy-brief behavior where practical

## Done When
- [ ] Developers can browse existing contracts from a localhost UI
- [ ] Selecting a contract shows all related artifact files available for that contract in a visual layout
- [ ] Status, progress, scoped file/function change cues, and artifact availability are highlighted for the developer
- [ ] The brief can be copied from the interface without manual markdown selection
- [ ] Supported local workflow actions can be triggered from the UI through the API
- [ ] Local run instructions for API plus UI are documented
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes

## Testing
- Unit: `tests/api/contracts.test.js`
- Integration: `tests/api-server-v2.test.js`

## Context Refs
- ARCH_INDEX_v1
- RULESET_CORE_v1
