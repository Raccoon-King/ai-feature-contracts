# Step 1: Contract Analysis

## Goal
Analyze the contract and extract all relevant information for planning.

## Extraction Tasks

### 1. Files Table
Extract all files from the ## Files section:
- Action (create/modify)
- Path
- Reason

### 2. Dependencies
Identify explicit and implicit dependencies:
- External packages listed
- Internal file dependencies (types → implementations → tests)
- Context references needed

### 3. Done-When Criteria
List all completion criteria to verify plan covers them.

## Dependency Detection

Analyze file paths to detect implicit dependencies:

```
Types/Interfaces → Implementations → Tests
src/types.ts → src/hooks/useX.ts → src/tests/useX.test.ts
              → src/components/X.tsx → src/tests/X.test.tsx
```

Common patterns:
- `types.ts` files should come first
- Hooks before components that use them
- Utilities before consumers
- Tests after their implementations

## Output
Display analysis summary:
- Total files: {count}
- Create: {count} | Modify: {count}
- Detected dependencies: {list}
- Context refs: {list}

## Navigation
- [C] Continue to sequencing
- [Q] Quit
