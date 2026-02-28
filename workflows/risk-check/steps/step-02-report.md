# Step 2: Risk Report

## Goal
Generate risk report with mitigations.

## Risk Summary

```
═══════════════════════════════════════════════════
RISK ASSESSMENT REPORT
═══════════════════════════════════════════════════

Contract: {filename}
Assessed: {timestamp}
Overall Risk: {LOW | MEDIUM | HIGH}

───────────────────────────────────────────────────
RISK BREAKDOWN
───────────────────────────────────────────────────

HIGH (must address):    {count}
MEDIUM (should address): {count}
LOW (acceptable):       {count}

═══════════════════════════════════════════════════
```

## Detailed Findings

### HIGH Priority

```
1. [TESTING] No E2E tests specified

   Impact: Regression risk in user flows

   Mitigation:
   - Add e2e/feature.spec.ts to Files section
   - Include critical user journey tests

   Contract change needed: YES
```

### MEDIUM Priority

```
2. [SCOPE] Vague requirement

   Item: "Improve performance"
   Impact: Scope creep, unclear done-when

   Mitigation:
   - Change to: "Reduce initial load to <2s"
   - Add measurable metric to done-when

   Contract change needed: YES
```

### LOW Priority

```
3. [COMPLEXITY] Moderate coupling

   Impact: May complicate future changes

   Mitigation:
   - Document dependencies in Context Refs
   - No contract change needed

   Contract change needed: NO
```

## Recommendations

```
Before proceeding:
1. [ ] Add E2E test file to contract
2. [ ] Clarify "improve performance" metric
3. [ ] Consider adding checkpoint after types

After addressing:
  afc validate {filename}
```

## Navigation
- [S] Save report
- [E] Edit contract now
- [A] Accept risks and proceed
- [Q] Quit
