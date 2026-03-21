# Agent Runtime Migration Plan

## Overview

This document defines the staged migration from Grabby's prompt-centric agent model to a runtime-driven architecture where deterministic logic lives in code and the LLM operates on pre-structured context.

## Pilot Selection

### Selected Pilot: `validate-contract` Workflow

**Current Implementation:**
- Workflow: `workflows/validate-contract/workflow.yaml`
- Agent: `scope-validator.agent.yaml`
- Runtime: `lib/core.cjs` (validateContract function)

**Why This Pilot:**
1. **Already Deterministic**: Validation rules are finite and enumerable
2. **Clear Contract**: Input is a file path, output is pass/fail with findings
3. **Existing Runtime**: `validateContract()` already handles core logic
4. **Low Risk**: Validation doesn't modify files or state
5. **Measurable**: Can compare results between models
6. **Quick Win**: Estimated 2-3 days to convert

### Pilot Success Criteria

- [ ] Runtime handles all validation logic (no prompt-based rules)
- [ ] LLM only receives structured findings for explanation
- [ ] Token usage reduced by 40%+
- [ ] Same or better validation accuracy
- [ ] Tests cover 80%+ of runtime logic
- [ ] Rollback possible in < 1 hour

## Migration Phases

### Phase 0: Foundation (Pre-Pilot)

**Duration:** 1-2 days

**Deliverables:**
1. Contract schema definition (`schemas/contract.schema.json`)
2. Tool registry interface (`lib/tool-registry.cjs`)
3. Context builder skeleton (`lib/context-builder.cjs`)
4. Output validator skeleton (`lib/output-validator.cjs`)

**Files:**
```
lib/
├── tool-registry.cjs      # Tool definitions and permissions
├── context-builder.cjs    # Prepares structured LLM input
├── output-validator.cjs   # Validates LLM output against schema
└── runtime-agent.cjs      # Base runtime agent class
schemas/
├── contract.schema.json   # Machine-readable contract format
└── validation-output.schema.json
```

### Phase 1: Validate-Contract Pilot

**Duration:** 2-3 days

**Steps:**
1. Extract validation rules from prompt to `lib/validation-rules.cjs`
2. Define validation output schema
3. Build context that only includes contract + findings
4. Create minimal prompt for explanation generation
5. Test runtime vs prompt-based validation
6. Measure token usage difference

**Architecture:**
```
┌─────────────────────────────────────────────────┐
│              validate-contract                   │
├─────────────────────────────────────────────────┤
│  Input: contract file path                       │
│                     │                            │
│                     ▼                            │
│  ┌─────────────────────────────────┐            │
│  │     RUNTIME: Parse & Validate   │            │
│  │  • Parse contract to AST        │            │
│  │  • Run validation rules         │            │
│  │  • Collect findings             │            │
│  └─────────────────────────────────┘            │
│                     │                            │
│                     ▼                            │
│  ┌─────────────────────────────────┐            │
│  │     CONTEXT: Build LLM Input    │            │
│  │  • Contract summary (100 tokens)│            │
│  │  • Findings list (structured)   │            │
│  │  • Severity classifications     │            │
│  └─────────────────────────────────┘            │
│                     │                            │
│                     ▼                            │
│  ┌─────────────────────────────────┐            │
│  │     LLM: Generate Explanation   │            │
│  │  • Explain findings in context  │            │
│  │  • Suggest fixes                │            │
│  │  • No validation logic          │            │
│  └─────────────────────────────────┘            │
│                     │                            │
│                     ▼                            │
│  Output: Validation result + explanation         │
└─────────────────────────────────────────────────┘
```

### Phase 2: Extend to Plan Workflow

**Duration:** 3-4 days

**Candidate:** `generate-plan` workflow

**Why:**
- Plan generation benefits from constrained output format
- Context refs resolution is already deterministic
- File list validation can move to runtime

**Approach:**
1. Runtime resolves context refs
2. Runtime validates file list against directories
3. Runtime prepares structured planning context
4. LLM generates plan in constrained YAML format
5. Runtime validates plan output schema

### Phase 3: Extend to Execute Workflow

**Duration:** 5-7 days

**Candidate:** `execute-contract` workflow

**Challenges:**
- Code generation is inherently LLM-driven
- Need tool layer for file operations
- Requires state tracking across multiple turns

**Approach:**
1. Runtime provides file read/write tools
2. Runtime enforces scope boundaries
3. LLM uses tools instead of generating full files
4. Runtime validates each tool call before execution

### Phase 4: Full Agent Migration

**Duration:** 2-3 weeks

**Scope:**
- Convert all agents to runtime-driven model
- Deprecate prompt-based workflows
- Update documentation
- Release as major version

## Risk Analysis

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Validation accuracy drop | High | A/B test with current model |
| Token usage increase | Medium | Measure per-phase, rollback if worse |
| Runtime bugs | Medium | Comprehensive test coverage |
| LLM output format drift | Low | Schema validation catches this |

### Operational Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| User workflow disruption | High | Feature flag for opt-in |
| Documentation lag | Medium | Update docs in each phase |
| Rollback complexity | Medium | Keep prompt-based code intact |

## Rollback Plan

### Per-Phase Rollback

Each phase maintains:
1. Original prompt-based code (not deleted)
2. Feature flag to switch models
3. Comparison metrics for both paths

### Full Rollback

If migration fails after Phase 1:
1. Disable runtime agent feature flag
2. Revert to prompt-based workflows
3. Document lessons learned
4. Reassess architecture approach

## Success Metrics

### Phase 1 Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Token usage | -40% | Compare prompt sizes |
| Validation accuracy | >=100% | Run on test corpus |
| Execution time | No regression | Benchmark comparison |
| Test coverage | >=80% | Jest coverage report |

### Overall Migration Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Token efficiency | -50% average | Per-command tracking |
| Error rate | -30% | Error log analysis |
| Test coverage | >=80% all modules | Jest coverage |
| User satisfaction | No complaints | Feedback channel |

## Timeline

```
Week 1: Phase 0 (Foundation)
        └── Schema, registry, builders

Week 2: Phase 1 (Validate Pilot)
        └── Convert validate-contract

Week 3: Phase 1 (Testing & Metrics)
        └── A/B testing, measurements

Week 4: Phase 2 (Plan Workflow)
        └── Convert generate-plan

Week 5-6: Phase 3 (Execute Workflow)
        └── Convert execute-contract with tools

Week 7-9: Phase 4 (Full Migration)
        └── All agents, documentation

Week 10: Release
        └── Major version with runtime agents
```

## Dependencies

- No external dependencies required
- All changes are internal refactoring
- LLM provider compatibility maintained

## Approvals Required

- [ ] Architecture review (this document)
- [ ] Phase 0 completion sign-off
- [ ] Phase 1 pilot results review
- [ ] Go/no-go for Phase 2
- [ ] Full migration approval

## References

- `docs/AGENT_PROMPT_EVALUATION.md` - Current state analysis
- `templates/agent-runtime-contract.example.yaml` - Example contract
- `templates/agent-runtime-minimal-prompt.md` - Example prompt
