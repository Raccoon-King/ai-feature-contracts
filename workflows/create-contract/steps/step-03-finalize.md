# Step 3: Finalize Contract

## Goal
Generate the contract file with all gathered information.

## Instructions for Agent
Review the collected information and generate the final contract.

1. **Done Criteria** - Verifiable conditions for completion
2. **Testing** - Test files and coverage requirements
3. **Confirmation** - Final review before generation

## Prompts

### Done Criteria
```
What conditions must be true when this feature is done?
(These should be verifiable - not vague statements)

Defaults:
- Feature works as specified
- Tests pass (80%+ coverage)
- Lint passes
- Build succeeds
```

### Testing
```
What tests are needed for this feature?
(Format: type:path)

Examples:
- unit:src/tests/useFeature.test.ts
- e2e:e2e/feature.spec.ts
- integration:src/tests/feature.integration.test.ts
```

### Review
```
Here's a summary of your contract:

Feature: {feature_name}
Objective: {objective}

Scope:
{scope_items}

Files:
{files}

Does this look correct? [Y]es / [N]o / [E]dit
```

## Contract Generation
On confirmation, generate the contract file at:
`contracts/{feature-slug}.fc.md`

## Output Options
- Console: Display the contract content
- File: Write to contracts/ directory
- Both: Display and write (default)

## Navigation
- [Y] Yes, generate the contract
- [N] No, go back and edit
- [Q] Quit without generating
