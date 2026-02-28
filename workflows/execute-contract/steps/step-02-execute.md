# Step 2: Execute Files

## Goal
Execute each file in the specified order with checkpoints.

## Execution Loop

For each file in the plan:

### File Header
```
─────────────────────────────────────────
File {n}/{total}: {action} {path}
Reason: {reason}
─────────────────────────────────────────
```

### Action: Create
When creating a new file:
1. Verify directory exists (create if needed)
2. Generate file content based on contract scope
3. Write file
4. Run lint check
5. Checkpoint: Confirm or rollback

### Action: Modify
When modifying an existing file:
1. Verify file exists
2. Read current content
3. Apply modifications per contract scope
4. Write updated file
5. Run lint check
6. Checkpoint: Confirm or rollback

### Checkpoint
After each file:
```
[✓] {path}
    Lint: {pass/fail}

Continue? [C]ontinue / [R]ollback / [A]bort
```

## Error Handling

### Lint Failure
```
Lint failed for {path}:
{lint_errors}

Options:
[F] Fix and retry
[S] Skip lint check
[A] Abort execution
```

### File Conflict
```
File already exists: {path}
Expected action: create

Options:
[O] Overwrite
[M] Merge (manual)
[S] Skip
[A] Abort
```

## Progress Tracking
```
Progress: {completed}/{total} files
[=====>     ] 50%

Completed:
✓ src/hooks/useFeature.ts
✓ src/types.ts
○ src/tests/useFeature.test.ts (current)
○ src/components/Feature.tsx
```

## Navigation
- [C] Continue to next file
- [P] Pause execution
- [A] Abort (partial progress saved)
