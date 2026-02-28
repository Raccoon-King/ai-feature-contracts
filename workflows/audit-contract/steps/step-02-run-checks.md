# Step 2: Run Checks

## Goal
Run automated quality checks on the implementation.

## Automated Checks

### Lint Check
```
Running: npm run lint

[✓] Lint passed
    Errors: 0
    Warnings: 2

    Warnings:
    - src/hooks/useFeature.ts:15 - Unused variable 'temp'
    - src/hooks/useFeature.ts:32 - Prefer const over let
```

### Build Check
```
Running: npm run build

[✓] Build succeeded
    Duration: 4.2s
    Output: dist/
```

### Test Check
```
Running: npm test -- --coverage

[✓] Tests passed
    Total: 15
    Passed: 15
    Failed: 0
    Skipped: 0

    Coverage:
    - Statements: 87%
    - Branches: 82%
    - Functions: 91%
    - Lines: 86%

    Threshold: 80% [✓]
```

### Type Check
```
Running: npx tsc --noEmit

[✓] No type errors
```

## Check Summary
```
═══════════════════════════════════════════════════
CHECK RESULTS
═══════════════════════════════════════════════════

Lint:     ✓ PASS (2 warnings)
Build:    ✓ PASS
Tests:    ✓ PASS (87% coverage)
Types:    ✓ PASS

Overall:  ✓ ALL CHECKS PASSED
═══════════════════════════════════════════════════
```

## Navigation
- [C] Continue to report
- [R] Re-run failed checks
- [Q] Quit audit
