# Step 1: Feature Interview

## Goal
Understand the feature requirements through conversational discovery.

## Instructions for Agent
Ask the user about their feature in a conversational way. Gather:

1. **Feature Name** - A clear, descriptive name for the feature
2. **Objective** - What the feature does in 1-2 sentences
3. **Scope Items** - The main things this feature needs to accomplish
4. **Non-Goals** - What is explicitly out of scope

## Prompts

### Feature Name
```
What would you like to call this feature?
(A clear, descriptive name like "user-authentication" or "dark-mode-toggle")
```

### Objective
```
In 1-2 sentences, what does this feature do?
(Focus on the outcome, not the implementation)
```

### Scope Items
```
What are the main things this feature needs to do?
(List the key capabilities, separated by commas)
```

### Non-Goals
```
What is explicitly OUT of scope for this feature?
(Helps prevent scope creep - what should we NOT try to do?)
```

## Validation
- Feature name should be slug-friendly (letters, numbers, hyphens)
- Objective should be concrete and measurable
- Scope items should be bounded and achievable
- Non-goals help set clear boundaries

## Navigation
- [C] Continue to Step 2 (Scope Definition)
- [Q] Quit workflow (progress not saved)
