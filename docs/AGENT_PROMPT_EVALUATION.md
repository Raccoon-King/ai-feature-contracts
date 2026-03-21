# Agent Architecture Evaluation: Prompt-Centric vs Runtime-Driven

## Executive Summary

This document evaluates Grabby's current prompt-centric agent model and proposes a migration path toward runtime-driven agents where deterministic workflow steps are owned by code and tools, with the LLM constrained to reasoning over structured context.

## Current State Analysis

### Architecture Layers (As-Is)

```
┌─────────────────────────────────────────────────────────┐
│                    CURRENT MODEL                         │
├─────────────────────────────────────────────────────────┤
│  Agent YAML          │  Defines persona, menu, triggers │
│  (agents/*.yaml)     │  Static configuration             │
├──────────────────────┼──────────────────────────────────┤
│  Workflow YAML       │  Steps, prompts, output templates │
│  (workflows/)        │  Declarative flow definition      │
├──────────────────────┼──────────────────────────────────┤
│  Prompt Bundles      │  Full context + instructions      │
│  (*.prompt.md)       │  LLM receives everything          │
├──────────────────────┼──────────────────────────────────┤
│  Runtime Helpers     │  Validation, file I/O, git ops    │
│  (lib/*.cjs)         │  Called by CLI commands           │
├──────────────────────┼──────────────────────────────────┤
│  LLM                 │  Executes based on prompt bundle  │
│  (external)          │  Makes all decisions              │
└─────────────────────────────────────────────────────────┘
```

### Current Responsibilities

| Component | Current Responsibility |
|-----------|------------------------|
| Agent YAML | Persona identity, greeting, menu triggers |
| Workflow YAML | Step definitions, prompt questions, output templates |
| Prompt Bundle | Contract content, context refs, rules, execution instructions |
| Runtime (lib/) | File operations, validation, git workflow, config loading |
| LLM | Interpret contract, plan files, write code, make architectural decisions |

### Problems with Prompt-Centric Model

1. **Prompt Drift**: Instructions repeated across prompts diverge over time
2. **Token Waste**: Same boilerplate sent on every interaction
3. **Unpredictable Outputs**: LLM interprets instructions differently each time
4. **Testing Difficulty**: Can't unit test prompt-based logic
5. **Version Coupling**: Prompt changes affect all agents simultaneously
6. **Limited Validation**: Can't enforce constraints before LLM sees them

### Logic Currently in Prompts (Should Move to Runtime)

| Logic Type | Current Location | Target Location |
|------------|------------------|-----------------|
| File path validation | Prompt instructions | `lib/path-security.cjs` |
| Scope boundary checks | Prompt rules | `lib/commands.cjs` guard |
| Contract parsing | LLM interpretation | `lib/core.cjs` parser |
| Template expansion | Prompt templates | `lib/templates.cjs` |
| Dependency validation | Prompt guidelines | `lib/dependency-analyzer.cjs` |
| Git branch policy | Prompt hints | `lib/git-workflow.cjs` |
| Test coverage rules | Prompt instructions | `lib/testing-policy.cjs` |

## Target Architecture (To-Be)

### Four-Layer Model

```
┌─────────────────────────────────────────────────────────┐
│                   RUNTIME-DRIVEN MODEL                   │
├─────────────────────────────────────────────────────────┤
│  Layer 1: CONTRACT                                       │
│  ─────────────────                                       │
│  • Declarative specification of inputs/outputs           │
│  • Explicit tool permissions                             │
│  • Validation schemas                                    │
│  • Success criteria (machine-checkable)                  │
├─────────────────────────────────────────────────────────┤
│  Layer 2: RUNTIME                                        │
│  ────────────────                                        │
│  • Workflow orchestration (deterministic)                │
│  • Context preparation (what LLM sees)                   │
│  • Pre/post validation hooks                             │
│  • State management                                      │
├─────────────────────────────────────────────────────────┤
│  Layer 3: TOOLS                                          │
│  ─────────────                                           │
│  • File operations (read/write/edit)                     │
│  • Git operations (branch/commit/push)                   │
│  • Search/analysis (grep/glob/ast)                       │
│  • External integrations (Jira/GitHub)                   │
├─────────────────────────────────────────────────────────┤
│  Layer 4: LLM (Minimal Prompt)                           │
│  ─────────────────────────────                           │
│  • Receives pre-structured context                       │
│  • Makes bounded decisions                               │
│  • Outputs in constrained format                         │
│  • No workflow logic in prompt                           │
└─────────────────────────────────────────────────────────┘
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

### Benefits of Runtime-Driven Model

1. **Deterministic**: Same input → same validation → predictable output
2. **Testable**: Unit test runtime logic without LLM calls
3. **Token Efficient**: Only send decision-relevant context
4. **Constrained**: LLM can only use provided tools
5. **Auditable**: Log every runtime decision
6. **Modular**: Swap LLM providers without changing logic

## Gap Analysis

### Existing Building Blocks

| Component | Status | Reuse Potential |
|-----------|--------|-----------------|
| `lib/core.cjs` | Has contract parsing | Extend for schema validation |
| `lib/commands.cjs` | Has guard/validate | Add pre-execution hooks |
| `lib/git-workflow.cjs` | Deterministic git ops | Ready for tool layer |
| `lib/config.cjs` | Config loading | Add tool permissions |
| `lib/features.cjs` | Contract discovery | Add state management |
| `agents/*.yaml` | Persona definitions | Extract to runtime config |
| `workflows/*.yaml` | Step definitions | Convert to runtime orchestration |

### Gaps to Address

1. **Contract Schema**: Need machine-readable contract format (JSON/YAML)
2. **Tool Registry**: Formal tool definitions with permissions
3. **Context Builder**: Runtime that prepares LLM input
4. **Output Validator**: Schema enforcement for LLM output
5. **State Machine**: Track workflow progress deterministically
6. **Minimal Prompt Template**: Standard format for constrained LLM calls

### Migration Complexity by Component

| Component | Effort | Risk | Priority |
|-----------|--------|------|----------|
| Contract schema | Medium | Low | High |
| Tool registry | Low | Low | High |
| Context builder | Medium | Medium | High |
| Output validator | Medium | Low | Medium |
| State machine | High | Medium | Medium |
| Workflow converter | High | High | Low |

## Recommendations

### Pilot Candidate: `validate-contract` Workflow

**Rationale:**
- Already mostly deterministic (parsing, rule checking)
- Clear inputs (contract file) and outputs (validation result)
- No code generation required
- Easy to compare prompt-based vs runtime-based results
- Low risk if migration fails

### Implementation Phases

See `AGENT_RUNTIME_MIGRATION_PLAN.md` for detailed phases.

## Findings Summary

1. Current model embeds too much logic in prompts
2. Runtime already handles 40% of deterministic operations
3. Four-layer architecture provides clear separation
4. `validate-contract` is the safest pilot candidate
5. Migration can be incremental without breaking existing flows
6. Token savings estimated at 30-50% per interaction

## References

- `agents/` - Current agent definitions
- `workflows/` - Current workflow definitions
- `lib/commands.cjs` - Existing runtime commands
- `lib/core.cjs` - Contract parsing and validation
- `lib/git-workflow.cjs` - Git operations layer
