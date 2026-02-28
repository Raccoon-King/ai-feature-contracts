# Step 2: File Sequencing

## Goal
Determine the optimal order for implementing files.

## Sequencing Rules

### Priority Order
1. **Types/Interfaces** - Define shapes first
2. **Utilities** - Helper functions used by others
3. **Hooks** - State management before UI
4. **Services** - Business logic
5. **Components** - UI that consumes hooks/services
6. **Tests** - After implementations

### Dependency Resolution
```
For each file:
  1. Identify what it imports/uses
  2. Ensure dependencies come before dependents
  3. Flag circular dependencies as warnings
```

### Parallelization Opportunities
Identify files that can be implemented in parallel:
- Files with no mutual dependencies
- Tests for different modules
- Independent components

## Interactive Sequencing

Show proposed order:
```
Proposed implementation order:

1. src/types.ts (types - no dependencies)
2. src/hooks/useFeature.ts (depends on: types.ts)
3. src/components/Feature.tsx (depends on: useFeature.ts)
4. src/tests/useFeature.test.ts (tests: useFeature.ts)
5. src/tests/Feature.test.tsx (tests: Feature.tsx)

Parallel groups:
- Group A: [1]
- Group B: [2]
- Group C: [3, 4] (can be parallel)
- Group D: [5]
```

## User Adjustment
Allow user to adjust order:
```
Accept this order? [Y]es / [E]dit / [Q]uit

If Edit:
  Enter new order (comma-separated file numbers): 1,2,4,3,5
```

## Navigation
- [C] Continue with this order
- [E] Edit order
- [B] Back to analysis
- [Q] Quit
