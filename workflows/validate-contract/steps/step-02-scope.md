# Step 2: Scope Analysis

## Goal
Analyze scope boundaries, dependencies, and potential risks.

## Directory Analysis
Check file paths against directory rules:

1. **Allowed Check**
   - All files should be in allowed directories
   - Flag any files outside allowed scope

2. **Restricted Check**
   - No files should touch restricted directories
   - backend/, node_modules/, .env* are always restricted

## Dependency Analysis
Validate dependencies section:

1. **Banned Packages**
   - moment, lodash, jquery are banned
   - Flag if any are listed

2. **New Dependencies**
   - Flag new packages for review
   - Check if existing packages could suffice

## Risk Identification
Look for potential issues:

1. **Scope Creep Risk**
   - Vague scope items
   - Missing non-goals
   - Unbounded objectives

2. **Implementation Risk**
   - Complex file dependencies
   - Missing context refs
   - Unclear done-when criteria

3. **Testing Risk**
   - No test files specified
   - Low coverage expectations
   - Missing E2E tests for UI features

## Output
Generate risk assessment:
- Critical issues (must fix)
- Warnings (should consider)
- Suggestions (nice to have)

## Navigation
- [C] Continue to Report Generation
- [B] Back to Structure Validation
- [Q] Quit validation
