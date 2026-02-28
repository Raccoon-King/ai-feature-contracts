# Execution Protocol v1

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
