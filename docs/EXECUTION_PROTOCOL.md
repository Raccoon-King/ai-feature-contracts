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

## Grabby Workflow

### Quick Start
```bash
# Interview-driven task breakdown
grabby task "describe your feature"

# Full orchestration (all agents)
grabby orchestrate "describe your feature"

# Quick fixes (< 3 files)
grabby quick
```

### Standard Workflow
```bash
grabby task "feature"        # 1. Break down task
grabby validate <file>       # 2. Validate contract
grabby plan <file>           # 3. Generate plan
grabby backlog <file>        # 4. Generate backlog
grabby approve <file>        # 5. Approve
grabby execute <file>        # 6. Get instructions
# [Implement code]           # 7. Do the work
grabby audit <file>          # 8. Audit
```

### Agent Personas
| Agent | Command | Purpose |
|-------|---------|---------|
| Archie | `grabby agent architect CC` | Create contracts |
| Val | `grabby agent validator VC` | Validate & risk check |
| Sage | `grabby agent strategist GP` | Generate plans |
| Dev | `grabby agent dev EX` | Execute contracts |
| Iris | `grabby agent auditor AU` | Audit implementation |
| Flash | `grabby quick` | Quick flow |

## Pre-Execution Validation
```
✓ Files in allowed directories
✓ No restricted directories
✓ Dependencies in allowed list
✓ Contract status = approved
✓ Security checklist complete (if applicable)
```

## Post-Execution Audit
```
✓ Files changed as specified
✓ Rules compliance
✓ Lint passes
✓ Build succeeds
✓ Tests pass (80%+ coverage)
```

## Context Envelope
```
@context ARCH_INDEX_v1 §frontend
@context RULESET_CORE_v1 §hooks
@context ENV_STACK_v1
```

## Git Hooks Enforcement

Install hooks for auto-enforcement:
```bash
grabby init-hooks
```

Enable strict mode (block commits without contracts):
```bash
export GRABBY_STRICT=1
```
