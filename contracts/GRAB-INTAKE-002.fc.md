# Feature Contract: Ticket Generator Wizard
**ID:** GRAB-INTAKE-002 | **Status:** completed
CONTRACT_TYPE: FEATURE_CONTRACT
ARCH_VERSION: v1
RULESET_VERSION: v1
ENV_VERSION: v1

## Objective
Add a Ticket Generator wizard that turns an unstructured request into a deterministic `Who / What / Why / Definition of Done` ticket draft before contract generation continues.

## Scope
- Detect when structured ticket fields are missing
- Ask only the essential questions required to complete the ticket
- Emit a deterministic markdown ticket draft to stdout
- Block task/orchestrate contract generation until the ticket is complete
- Add unit coverage for ticket detection, question flow, and output format

## Non-Goals
- Jira API connectivity for ticket generation
- Persisting temporary `.ticket.md` drafts
- Starting plan or execute flows before ticket intake is complete

## Directories
**Allowed:** `lib/`, `docs/`, `tests/`, `contracts/`
**Restricted:** `node_modules/`, `.git/`, `dist/`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | `lib/ticket-intake.cjs` | Shared parser, validator, wizard, and markdown renderer |
| modify | `lib/interactive-workflows.cjs` | Gate contract creation on completed ticket intake |
| modify | `lib/interactive-shell.cjs` | Accept ticket CLI flags and add ticket command |
| modify | `bin/index.cjs` | Expose `grabby ticket` |
| modify | `lib/task-artifacts.cjs` | Persist ticket context in generated contracts |
| modify | `lib/task-brief.cjs` | Persist ticket context in generated briefs |
| create | `tests/ticket-intake.test.js` | Cover detection, minimal questioning, and markdown output |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery

## Security Considerations
- [x] Ticket drafting does not require network access
- [x] Ticket output stays in-process and deterministic
- [x] No temporary ticket markdown is written by default

## Done When
- [x] Missing ticket fields are detected from unstructured requests
- [x] The wizard asks only essential questions and stops once required fields are filled
- [x] Output is deterministic, copy/paste ready markdown printed to stdout
- [x] Required fields and DoD bullet formatting are validated
- [x] Unit tests cover no-ticket detection, minimal questioning, and draft output format
- [x] `task` and `orchestrate` do not proceed until ticket intake is complete

## Testing
- Unit: `tests/ticket-intake.test.js`
- Regression: `tests/task-artifacts.test.js`, `tests/task-brief.test.js`

## Context Refs
- ARCH: auth-module@v1
- RULESET: imports@v1
- ENV: test-runner@v1
