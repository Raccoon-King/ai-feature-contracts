# Feature Contract: Enforce Grabby Method Routing for All Feature Work
**ID:** GRAB-GOV-001 | **Status:** approved
CONTRACT_TYPE: FEATURE_CONTRACT
ARCH_VERSION: v1
RULESET_VERSION: v1
ENV_VERSION: v1

## Ticket
- Who: Developers using Cline / Continue / Codex; Platform Engineering
- What: Implement Grabby Method Router that forces the LLM to always follow the Grabby lifecycle (Ticket -> FC -> Plan -> Approve -> Execute -> Audit) for any feature/change request
- Why: Prevent scope drift and inconsistent AI behavior by making the Grabby method the default, automatic workflow whenever a developer asks to implement changes without relying on developer discipline or model memory

## Objective
Make Grabby the default, enforced intake and execution path for feature/change work across supported agent surfaces so implementation cannot start before ticket intake, contract creation, planning, and explicit approval.

## Summary
Add a method router that installs always-on agent rules during `grabby init`, detects feature/change requests that do not reference an existing contract, forces structured ticket intake, generates a canonical `contracts/<ID>.fc.md` draft plus `contracts/<ID>.plan.yaml`, and blocks code changes until explicit approval is given. Backstop the router with CI/policy enforcement, keep artifacts minimal, and document the developer workflow clearly.

## Scope
- Install managed router rules during `grabby init` for Cline, Continue, and Codex while preserving local override files
- Route feature/change requests without a valid contract reference into structured ticket intake instead of implementation
- Validate and normalize work item IDs to `[A-Z][A-Z0-9]+-\d+`, then generate canonical `contracts/<ID>.fc.md` and `contracts/<ID>.plan.yaml`
- Block execution until the explicit approval token `Approved` is provided, and make the plan vs execute boundary explicit in outputs
- Enforce execution scope so writes only occur when a plan exists, approval exists, and file paths stay inside approved scope and allowed directories
- Add CI/policy backstops for missing contract, missing plan, and scope drift, including an initial allow-failure rollout mode
- Document the workflow and add tests for router triggers, contract bypass, ID normalization, lifecycle ordering, and the no-write guarantee during plan phase

## Non-Goals
- Replacing the existing contract/planning/audit artifact model
- Adding external issue tracker synchronization as part of routing enforcement
- Supporting execution without an explicit approval step
- Allowing agents to infer missing routing state from memory instead of artifact presence
- Generating duplicate ticket markdown files outside the feature contract

## Directories
**Allowed:** `bin/`, `lib/`, `templates/`, `docs/`, `tests/`, `contracts/`, `.clinerules/`, `.continue/`, `.codex/`, `.github/`
**Restricted:** `node_modules/`, `.git/`, `dist/`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | `bin/index.cjs` | Ensure `grabby init` installs and maintains router-managed files and enforcement entrypoints |
| modify | `lib/commands.cjs` | Enforce plan/approval/scope checks and CI guard behavior |
| modify | `lib/interactive-workflows.cjs` | Route feature requests into ticket -> contract -> plan flow before execution |
| modify | `lib/ticket-intake.cjs` | Enforce required intake fields and normalize ticket IDs |
| modify | `lib/id-utils.cjs` | Validate and normalize work item IDs |
| modify | `lib/governance-runtime.cjs` | Detect scope drift and enforce approved file boundaries |
| modify | `lib/cicd.cjs` | Generate/describe CI jobs for contract/plan/scope enforcement |
| modify | `.clinerules/00-grabby-core.md` | Install always-on core router rules for Cline and preserve local override conventions |
| create | `.continue/rules/00-grabby-core.md` | Install managed core router rules for Continue and align existing rule behavior |
| create | `.codex/prompts/router.md` | Provide Codex router prompt and reference target for managed configuration |
| modify | `.github/workflows/self-governance.yml` | Backstop governance enforcement in repository CI where applicable |
| modify | `docs/EXECUTION_PROTOCOL.md` | Document router lifecycle, approval semantics, and recovery from failures |
| create | `tests/router-governance.test.js` | Verify routing triggers, ID normalization, ordering, and plan-phase no-write guarantees |
| modify | `tests/interactive-workflows.test.js` | Cover routed intake, contract bypass, and plan-only behavior |
| modify | `tests/commands.test.js` | Cover enforcement checks, scope validation, and approval gating |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery
- Security: Run `npm audit` before adding packages

## Security Considerations
- [ ] Router rules never authorize execution without explicit approval
- [ ] Plan phase guarantees no repository code changes
- [ ] Scope enforcement blocks writes outside approved files and allowed directories
- [ ] CI guard cannot be bypassed by omitting ticket markdown because the FC is canonical
- [ ] Local override files are preserved without weakening managed core enforcement

## Code Quality
- [ ] Rule installation is idempotent across repeated `grabby init` runs
- [ ] Approval enforcement has direct unit coverage
- [ ] Router messaging clearly distinguishes plan-only vs execute phases

## Done When
- [ ] `grabby init` creates or updates managed router files for Cline, Continue, and Codex
- [ ] `grabby init` preserves `.clinerules/90-local-overrides.md` and `.continue/rules/90-local-overrides.md` if they already exist
- [ ] Feature/change requests without a referenced contract are routed into ticket intake instead of implementation
- [ ] Router requires `Who`, `What`, `Why`, and `Definition of Done` before creating a contract
- [ ] Work item IDs are validated and normalized to uppercase matching `[A-Z][A-Z0-9]+-\d+`
- [ ] Router generates `contracts/<ID>.fc.md` as a draft contract
- [ ] Router generates `contracts/<ID>.plan.yaml` without modifying implementation files
- [ ] Execution remains blocked until the explicit approval token `Approved` is present
- [ ] Execution modifies only files allowed by the plan and approved directories
- [ ] CI/policy checks fail when policy-triggered code changes lack a contract, plan, or stay outside approved scope
- [ ] Rollout supports an initial allow-failure period before required enforcement
- [ ] Docs explain startup, ticket info, approval, and CI failure recovery in one page
- [ ] Tests cover router triggers, contract bypass when a valid contract is supplied, ID normalization, ordered lifecycle enforcement, and the no-code-changes guarantee during plan phase
- [ ] Lint passes
- [ ] Tests pass (80%+ coverage)

## Testing
- Unit: router trigger detection, ticket intake enforcement, ID validation/normalization, and plan-phase write blocking
- Integration: end-to-end routed flow for "feature request without contract" vs "implement existing contract"
- Regression: `grabby init` preserves local override files and CI/policy checks still work for existing governed flows

## Acceptance Examples
- Example 1: User asks `Create feature: add rate limiting` without a contract reference; router asks for `Who/What/Why/DoD` plus essential governance questions, creates `contracts/<ID>.fc.md`, then `contracts/<ID>.plan.yaml`, and makes no code changes
- Example 2: User asks `Implement contracts/TT-123.fc.md`; router uses the existing contract, generates or checks the plan only, waits for `Approved`, then executes strictly within scope

## Open Decisions
- Decide whether Codex routing should prefer `.codex/config.toml`, `.codex/prompts/router.md`, or both for the managed installation path
- Decide whether the one-week allow-failure rollout is encoded in generated CI config, documented as an operator step, or both
- Decide whether existing `.continue/rules/grabby.md` is migrated into `00-grabby-core.md` or retained as a compatibility layer

## Context Refs
- ARCH: auth-module@v1
- RULESET: imports@v1
- ENV: test-runner@v1
