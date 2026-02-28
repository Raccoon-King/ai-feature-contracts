# Step 1: Risk Analysis

## Goal
Perform deep risk analysis on the contract.

## Analysis Categories

### 1. Scope Risks
```
Analyzing scope boundaries...

[⚠] MEDIUM: Vague scope item detected
    "Improve performance" is not measurable
    Suggestion: Add specific metrics (e.g., "Reduce load time to <2s")

[✓] LOW: Scope size acceptable (4 items)
```

### 2. Dependency Risks
```
Analyzing dependencies...

[✓] No new dependencies requested

Or:

[⚠] MEDIUM: New dependency requested
    Package: react-query
    Weekly downloads: 2.1M
    Last updated: 3 days ago
    Known vulnerabilities: 0

    Risk: Additional bundle size (+12kb gzipped)
```

### 3. Complexity Risks
```
Analyzing complexity...

[⚠] HIGH: High file coupling detected
    Files touch 3+ shared modules
    Consider: Breaking into smaller contracts

[✓] LOW: Single responsibility maintained
```

### 4. Testing Risks
```
Analyzing test plan...

[!] HIGH: No E2E tests specified
    Feature involves user interaction
    Suggestion: Add e2e/feature.spec.ts

[✓] Unit tests cover main logic
```

### 5. Security Risks
```
Analyzing security implications...

[✓] No auth/data handling detected

Or:

[!] HIGH: Handles user input
    File: src/components/Form.tsx
    Requires: Input validation, XSS prevention
```

### 6. Performance Risks
```
Analyzing performance implications...

[⚠] MEDIUM: Creates new React context
    May cause unnecessary re-renders
    Suggestion: Consider memo/useMemo
```

## Navigation
- [C] Continue to report
- [D] Deep dive on specific risk
- [Q] Quit
