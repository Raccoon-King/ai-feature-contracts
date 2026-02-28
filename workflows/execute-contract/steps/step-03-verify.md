# Step 3: Verify Implementation

## Goal
Verify the implementation against the contract's done-when criteria.

## Done-When Verification

Check each criterion from the contract:

### Automated Checks
```
Running automated verification...

[✓] Lint passes
    Command: npm run lint
    Result: passed

[✓] Build succeeds
    Command: npm run build
    Result: passed

[✓] Tests pass
    Command: npm test
    Result: 15/15 passed, 87% coverage
```

### Manual Checks
For criteria requiring human verification:
```
Manual verification needed:

[ ] Feature works as specified
    → Test the feature manually
    Mark complete? [Y]es / [N]o / [S]kip

[ ] Code follows project conventions
    → Review generated code
    Mark complete? [Y]es / [N]o / [S]kip
```

## Verification Report
```
═══════════════════════════════════════════
VERIFICATION REPORT
═══════════════════════════════════════════

Contract: {filename}
Status: {COMPLETE | PARTIAL | FAILED}

Done-When Criteria:
[✓] Feature works as specified
[✓] Tests pass (87% coverage)
[✓] Lint passes
[✓] Build succeeds

Files Created/Modified:
✓ src/hooks/useFeature.ts
✓ src/types.ts
✓ src/tests/useFeature.test.ts

───────────────────────────────────────────
```

## Completion

### If All Pass
```
All done-when criteria met.
Contract execution complete.

Updating contract status to 'complete'...
Done.

Next: afc audit {filename}
```

### If Some Fail
```
Some criteria not met:
[ ] Tests pass (65% coverage - below 80% threshold)

Options:
[R] Resume implementation
[F] Force complete (not recommended)
[S] Save progress and exit
```

## Output
Generate execution log:
- File: `contracts/{slug}.execution.md`
- Contents: Full execution history with timestamps

## Navigation
- [Done] Execution complete
- [R] Resume (if incomplete)
- [A] Audit (if complete)
