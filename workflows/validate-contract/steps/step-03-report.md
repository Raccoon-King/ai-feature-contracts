# Step 3: Validation Report

## Goal
Generate a comprehensive validation report.

## Report Structure

### Summary
```
Contract: {filename}
Status: {PASS | FAIL | WARNINGS}
Errors: {count}
Warnings: {count}
```

### Errors (Must Fix)
List all critical issues that must be resolved:
- Missing required sections
- Restricted directory violations
- Banned dependencies
- Invalid file table format

### Warnings (Should Consider)
List all non-critical issues:
- Missing recommended sections
- Vague scope items
- Missing tests
- Unbounded objectives

### Recommendations
Provide actionable suggestions:
- How to fix each error
- How to address warnings
- Best practices to follow

### Next Steps
Based on validation result:

**If PASS:**
```
Contract is valid and ready for planning.
Next: grabby plan {filename}
```

**If WARNINGS:**
```
Contract is valid but has warnings.
Consider addressing warnings before planning.
Next: Edit contract or run: grabby plan {filename}
```

**If FAIL:**
```
Contract has errors that must be fixed.
Fix errors and re-validate.
Next: Edit contract, then: grabby validate {filename}
```

## Output Options
- Console: Display report
- File: Write to contracts/{slug}.validation.md
- Both: Display and write (default with --output both)

## Navigation
- [Done] Validation complete
