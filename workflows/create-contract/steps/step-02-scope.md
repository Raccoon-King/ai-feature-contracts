# Step 2: Scope Definition

## Goal
Define the technical boundaries and constraints for the feature.

## Instructions for Agent
Help the user define the technical scope. Gather:

1. **Directories** - Which parts of the codebase this feature touches
2. **Files** - Specific files to create or modify
3. **Dependencies** - Any new packages needed

## Prompts

### Directories
```
Which directories will this feature touch?
(e.g., src/components/, src/hooks/, src/services/)

Common directories:
- src/components/ - UI components
- src/hooks/ - React hooks
- src/services/ - API/business logic
- src/utils/ - Utility functions
- src/types/ - TypeScript types
- src/tests/ - Test files
```

### Files
```
What files need to be created or modified?
(Format: action:path:reason)

Examples:
- create:src/hooks/useFeature.ts:State management
- modify:src/types.ts:Add interfaces
- create:src/tests/feature.test.ts:Unit tests
```

### Dependencies
```
Does this feature need any new dependencies?
(List package names, or "none" if using existing packages)

Note: moment, lodash, and jquery are banned.
```

## Validation
- Directories should exist in project structure
- File paths should follow project conventions
- Dependencies should not include banned packages
- Restrict modifications to allowed directories

## Navigation
- [C] Continue to Step 3 (Finalize)
- [B] Back to Step 1 (Interview)
- [Q] Quit workflow
