# Step 1: Prepare for Execution

## Goal
Load contract and plan, verify all preconditions are met.

## Precondition Checks

### 1. Contract Status
```
Checking: Contract status is 'approved'
```
- Contract must have `**Status:** approved`
- If not approved, abort with: "Run: afc approve {contract}"

### 2. Plan Exists
```
Checking: Plan file exists
```
- Plan file must exist at `contracts/{slug}.plan.yaml`
- If missing, abort with: "Run: afc plan {contract}"

### 3. Plan Status
```
Checking: Plan status is 'approved'
```
- Plan must have `status: approved`
- If not approved, abort with: "Run: afc approve {contract}"

## Load Execution Context

### Context Files
Load context references from contract:
```
@context ARCH_INDEX_v1
@context RULESET_CORE_v1
@context ENV_STACK_v1
```

### File Sequence
Load files from plan in order:
```
1. {action}: {path} - {reason}
2. {action}: {path} - {reason}
...
```

### Rules
Load rules to follow:
```
Rules: §typescript, §hooks, §testing
```

## Ready Check
```
Execution prepared:
- Contract: {filename}
- Files: {count} files
- Context: {context_count} refs loaded
- Rules: {rules}

Ready to execute? [Y]es / [N]o
```

## Navigation
- [Y] Yes, start execution
- [N] No, abort
- [Q] Quit
