# Step 1: Verify Files

## Goal
Verify all files specified in the contract were created or modified.

## File Verification

For each file in the contract's Files table:

### Created Files
```
Checking created files...

[✓] src/hooks/useFeature.ts
    Status: exists
    Size: 2.4kb
    Modified: 2024-01-15 10:45:00

[✗] src/tests/useFeature.test.ts
    Status: MISSING
    Action needed: Create test file
```

### Modified Files
```
Checking modified files...

[✓] src/types.ts
    Status: modified
    Changes: +15 lines, -2 lines
    Last modified: 2024-01-15 10:42:00
```

### Scope Violations
```
Checking for out-of-scope changes...

[⚠] Warning: Files modified outside contract scope:
    - src/utils/helpers.ts (not in contract)

[✓] No restricted directory violations
```

## Summary
```
Files specified: {total}
Created: {created_count}/{expected_creates}
Modified: {modified_count}/{expected_modifies}
Missing: {missing_count}
Out of scope: {extra_count}
```

## Navigation
- [C] Continue to checks
- [F] Fix missing files (re-run execution)
- [Q] Quit audit
