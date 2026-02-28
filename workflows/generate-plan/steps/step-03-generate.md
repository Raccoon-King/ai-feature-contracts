# Step 3: Generate Plan

## Goal
Generate the final execution plan and save it.

## Plan Structure

```yaml
contract: feature-name.fc.md
phase: plan
timestamp: 2024-01-15T10:30:00Z
status: pending_approval

context:
  - ARCH_INDEX_v1 §frontend
  - RULESET_CORE_v1 §hooks §typescript

files:
  - order: 1
    action: create
    path: src/types.ts
    reason: Define interfaces
    dependencies: []

  - order: 2
    action: create
    path: src/hooks/useFeature.ts
    reason: State management
    dependencies: [src/types.ts]

rules:
  - §typescript
  - §hooks
  - §testing

risks:
  - State synchronization between components
  - Type coverage for edge cases

checkpoints:
  - after: 2
    verify: "Types compile correctly"
  - after: 4
    verify: "Hook tests pass"
```

## Plan Summary

Display summary before saving:
```
═══════════════════════════════════════════════════
EXECUTION PLAN SUMMARY
═══════════════════════════════════════════════════

Contract: {filename}
Files: {count} ({creates} create, {modifies} modify)
Estimated complexity: {low/medium/high}

Implementation Order:
1. {file} - {reason}
2. {file} - {reason}
...

Checkpoints: {count}
Risks identified: {count}

───────────────────────────────────────────────────
```

## Save Plan

Save to: `contracts/{slug}.plan.yaml`

## Next Steps
```
Plan generated successfully!

Next:
  1. Review: contracts/{slug}.plan.yaml
  2. Approve: afc approve {filename}
  3. Execute: afc agent dev EX {filename}
```

## Navigation
- [S] Save plan
- [E] Edit plan
- [B] Back to sequencing
- [Q] Quit without saving
