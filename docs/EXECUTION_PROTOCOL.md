# Execution Protocol v1

## Persona-Led Entry Points

- `grabby task "<request>"`:
  - interviews the developer
  - selects a persona
  - writes a populated contract and a developer brief
- `grabby orchestrate "<request>"`:
  - runs the interview
  - writes the populated contract
  - hands off across Archie -> Sage -> Dev -> Iris
  - emits plan, backlog, execution, and audit artifacts in one CLI session

## Non-Interactive Mode

For wrappers, CI, or future IDE integrations:
- pass task inputs with flags such as `--objective`, `--scope`, `--done-when`, and `--testing`
- use `--yes` or `--non-interactive` to skip prompts
- use `--session-format json|yaml` to emit a machine-readable session artifact
- use `--session-output <path>` to control where that artifact is written
- use `grabby session <file>` to inspect or regenerate those artifacts later
- use `grabby session <file> --check` for CI-friendly validation
- use `grabby session --check-all` to validate every session artifact under `contracts/`
- `.grabbyignore` accepts glob patterns and negation (`!pattern`) for ignored artifact paths

## Orchestrated Handoff

1. `Archie` shapes the request into a bounded contract.
2. `Val` validates that the generated contract is structurally safe.
3. `Sage` generates the backlog and execution plan.
4. `Dev` prepares the execution brief.
5. `Iris` prepares the audit checklist.

## Two-Phase Execution

### PHASE 1: PLAN
- Output: files, rules, risks
- NO file edits allowed
- Must be approved before Phase 2

### PHASE 2: EXECUTE
- Only modify approved files
- NO scope expansion
- Follow RULESET_CORE patterns

## Pre-Execution Validation
```
✓ Files in allowed directories
✓ No restricted directories
✓ Dependencies in allowed list
✓ Contract status = approved
```

## Post-Execution Audit
```
✓ Files changed as specified
✓ Rules compliance
✓ Lint passes
✓ Build succeeds
```

## Context Envelope
```
@context ARCH_INDEX_v1 §frontend
@context RULESET_CORE_v1 §hooks
@context ENV_STACK_v1
```
