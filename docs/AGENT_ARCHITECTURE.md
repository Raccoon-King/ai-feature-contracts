# Grabby Agent Architecture

This document defines the preferred operating model for Grabby's agent system.
The goal is not "more personas." The goal is clear stage ownership, predictable
handoffs, and routing that follows artifact state instead of only prompt
keywords.

## Design Principles

- One primary owner per workflow stage
- Routing should be stage-aware and artifact-aware
- Sequential orchestration is the default
- Parallel specialist work is optional and bounded
- Governance gates still control plan, approval, execution, and audit

## Core Roles

### Analyst

- Purpose: Structure raw requests into clear intake artifacts
- Owns: Ticket intake, ambiguity reduction, workflow triage
- Inputs: Raw request, repo context, existing contract state
- Outputs: Structured ticket data and recommended next stage
- Does not own: Contract authoring or implementation

### Contract Architect

- Purpose: Turn a structured request into a bounded contract
- Owns: Objective, scope, non-goals, file boundaries, done-when criteria
- Inputs: Analyst output and repo conventions
- Outputs: Feature contract draft
- Does not own: Final validation, planning, or implementation

### Validator

- Purpose: Review contracts critically before work starts
- Owns: Validation, gap analysis, risk review, readiness findings
- Inputs: Contract draft
- Outputs: Validation pass/fail and remediation guidance
- Does not own: Writing the contract or implementing it

### Planner

- Purpose: Convert a validated contract into an execution plan
- Owns: Ordering, dependency analysis, file sequencing, handoff prep
- Inputs: Validated contract and repo topology
- Outputs: Plan artifact and execution ordering
- Does not own: Code changes

### Developer

- Purpose: Execute the approved plan inside scope
- Owns: Production changes and supporting tests in approved files
- Inputs: Approved contract and plan
- Outputs: Implementation and verification-ready changes
- Does not own: Scope changes or final audit authority

### Test Engineer

- Purpose: Own the verification stage between execution and audit
- Owns: Regression coverage, verification evidence, missing test closure
- Inputs: Implemented changes, contract scope, quality thresholds
- Outputs: Verification-ready evidence and test artifacts
- Does not own: Final audit disposition or scope expansion
- Verification depth: can be tiered (`basic`, `standard`, `high-risk`) when risk-tier mode is enabled

### Auditor

- Purpose: Verify completion against contract and quality gates
- Owns: Audit, compliance review, completion recommendation
- Inputs: Completed work, contract, plan, verification signals
- Outputs: Audit artifact and closure findings
- Does not own: Implementation except via follow-up bug contracts

## Control Plane

Grabby should route automatically by stage when possible:

1. Raw request -> Analyst
2. Structured request needing a contract -> Contract Architect
3. Draft contract -> Validator
4. Validated contract -> Planner
5. Approved plan -> Developer
6. Completed implementation -> Test Engineer
7. Verification-ready change -> Auditor

Explicit user role selection still overrides automatic routing when it does not
violate governance gates.

## Routing Rules

- Use request-keyword routing only as a hint
- Prefer artifact state when available
- Do not route execution before approval
- Do not route audit before implementation is complete
- Use quick flow only for genuinely bounded changes

## Decision Signals

Routing decisions now follow a strict precedence order:

1. Artifact and governance state (hard gate)
2. Stage/substep mapping (requirements, scope, risk, planning, execution, verification, audit)
3. Keyword hints (soft signal only)
4. Confidence fallback (route to analyst when confidence is low)

The router emits decision metadata including `reason`, `confidence`, `substep`,
and `blockedTransitions` so CLI surfaces can explain why a persona was selected.

## Routing Memory

Grabby persists lightweight local routing memory in `.grabby/metrics/routing-memory.json`.

- Stores last successful agent by substep
- Never stores secrets
- Used as a preference signal only (cannot bypass governance gates)

## Migration Guidance

Current recommended mapping:

- Keep `contract-architect` as the contract author
- Keep `scope-validator` as the validator
- Keep `plan-strategist` as the planner
- Keep `dev-agent` as the developer
- Add `test-engineer` as the dedicated verification owner
- Keep `auditor` as the auditor
- Keep `quick-flow` as an exception path, not the main operating model
- Add `analyst` as the dedicated intake role

## Notes

- This model favors sequential orchestration over concurrent multi-agent writes.
- If concurrent specialists are added later, they should be bounded review roles,
  not overlapping code writers by default.
