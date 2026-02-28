# Step 2: Edit Section

## Goal
Make guided edits to the selected section.

## Edit Modes

### Objective
```
Current: {current_objective}

New objective (or Enter to keep):
> ___________________________________
```

### Scope (add/remove items)
```
Current scope:
1. {item1}
2. {item2}
3. {item3}

[A] Add item
[R] Remove item (enter number)
[D] Done editing scope

> ___
```

### Files (add/remove/reorder)
```
Current files:
1. create: src/hooks/useAuth.ts
2. modify: src/types.ts

[A] Add file
[R] Remove file (enter number)
[M] Move file (reorder)
[D] Done editing files

> ___
```

### Add File Dialog
```
Action (create/modify): ___
Path: ___
Reason: ___
```

## Validation

After each edit, validate:
```
Checking edit...
[✓] Valid change
```

Or:
```
[⚠] Warning: This adds a 4th scope item
    Large scopes increase risk. Continue? [Y/n]
```

## Navigation
- [S] Save changes
- [E] Edit another section
- [U] Undo last change
- [Q] Quit without saving
