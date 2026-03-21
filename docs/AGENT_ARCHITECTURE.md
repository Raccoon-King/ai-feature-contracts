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

## Runtime-Driven Agent Model (v4.0)

Grabby 4.0 introduces a runtime-driven architecture that separates deterministic
workflow logic from LLM reasoning. This model follows a four-layer separation:

### Four-Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: CONTRACT                                           │
│  • Declarative specification of inputs/outputs               │
│  • Explicit tool permissions                                 │
│  • Validation schemas and success criteria                   │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: RUNTIME                                            │
│  • Workflow orchestration (deterministic)                    │
│  • Context preparation (what LLM sees)                       │
│  • Pre/post validation hooks                                 │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: TOOLS                                              │
│  • File operations (read/write/edit)                         │
│  • Git operations (branch/commit/push)                       │
│  • Search/analysis (grep/glob/ast)                           │
├─────────────────────────────────────────────────────────────┤
│  Layer 4: LLM (Minimal Prompt)                               │
│  • Receives pre-structured context                           │
│  • Makes bounded decisions                                   │
│  • Outputs in constrained format                             │
└─────────────────────────────────────────────────────────────┘
```

### Responsibility Shift

| Responsibility | Before (LLM) | After (Runtime) |
|----------------|--------------|-----------------|
| Parse contract | LLM reads markdown | Runtime parses to AST |
| Validate scope | LLM checks rules | Runtime validates pre-execution |
| Choose files | LLM decides | Runtime provides candidate list |
| Apply templates | LLM generates | Runtime expands templates |
| Check constraints | LLM interprets | Runtime enforces |
| Format output | LLM follows instructions | Runtime validates schema |

### Benefits

1. **Deterministic**: Same input → same validation → predictable output
2. **Testable**: Unit test runtime logic without LLM calls
3. **Token Efficient**: Only send decision-relevant context
4. **Constrained**: LLM can only use provided tools
5. **Auditable**: Log every runtime decision
6. **Modular**: Swap LLM providers without changing logic

### Migration Status

See `docs/AGENT_RUNTIME_MIGRATION_PLAN.md` for the phased implementation plan.
See `docs/AGENT_PROMPT_EVALUATION.md` for the evaluation that motivated this shift.

## REST API Exposure

The agent system is exposed through the REST API at `/v1/agents`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/agents` | GET | List all agents with metadata |
| `/v1/agents/:id` | GET | Get agent details and definition |
| `/v1/agents/:id/workflows` | GET | List workflows for an agent |
| `/v1/agents/all/workflows` | GET | List all workflows |
| `/v1/agents/route` | POST | Route a request to appropriate agent |
| `/v1/agents/lint/all` | GET | Lint all agent definitions |

### Routing via API

External tools can use the routing endpoint to determine which agent should handle a request:

```bash
curl -X POST http://127.0.0.1:3456/v1/agents/route \
  -H "Content-Type: application/json" \
  -d '{"request": "Create a new authentication feature"}'
```

The response includes the primary agent, next agent in sequence, and the full transition chain.

See `docs/API.md` for full endpoint documentation and examples.

## Notes

- This model favors sequential orchestration over concurrent multi-agent writes.
- If concurrent specialists are added later, they should be bounded review roles,
  not overlapping code writers by default.
