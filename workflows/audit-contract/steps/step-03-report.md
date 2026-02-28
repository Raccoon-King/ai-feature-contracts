# Step 3: Audit Report

## Goal
Generate comprehensive audit report.

## Report Template

```markdown
# Audit Report: {feature-name}

**Contract:** {filename}
**Audited:** {timestamp}
**Status:** {PASS | FAIL | WARNINGS}

## Executive Summary

{1-2 sentence summary of audit results}

## File Verification

| Status | Action | Path | Notes |
|--------|--------|------|-------|
| ✓ | create | src/hooks/useFeature.ts | Created as specified |
| ✓ | create | src/tests/useFeature.test.ts | Created as specified |
| ✓ | modify | src/types.ts | Modified as specified |

**Files:** {created}/{expected} created, {modified}/{expected} modified
**Scope:** {clean | violations found}

## Quality Checks

| Check | Status | Details |
|-------|--------|---------|
| Lint | ✓ PASS | 0 errors, 2 warnings |
| Build | ✓ PASS | Completed in 4.2s |
| Tests | ✓ PASS | 15/15, 87% coverage |
| Types | ✓ PASS | No errors |

## Done-When Criteria

- [x] Feature works as specified
- [x] Tests pass (87% > 80% threshold)
- [x] Lint passes
- [x] Build succeeds

## Recommendations

{List any warnings or suggestions for improvement}

## Conclusion

{Final assessment and next steps}
```

## Save Report

Save to: `contracts/{slug}.audit.md`

## Contract Status Update

If audit passes:
- Update contract status to `complete`
- Archive plan file

```
Contract status updated: complete
Audit report saved: contracts/{slug}.audit.md

This contract is now complete!
```

## Navigation
- [S] Save report and complete
- [E] Edit findings
- [B] Back to checks
