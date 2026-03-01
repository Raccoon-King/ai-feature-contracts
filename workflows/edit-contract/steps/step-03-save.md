# Step 3: Save Contract

## Goal
Save changes and re-validate the contract.

## Changes Summary

```
═══════════════════════════════════════════════════
CHANGES SUMMARY
═══════════════════════════════════════════════════

Contract: {filename}

Modified sections:
  - Scope: Added 1 item
  - Files: Added 2 files, removed 1

───────────────────────────────────────────────────
```

## Re-validation

```
Re-validating contract...

Required sections:  ✓ All present
Directory bounds:   ✓ No violations
Dependencies:       ✓ No banned packages
Scope size:         ✓ Within limits

Result: ✓ VALID
```

## Status Check

```
Contract status: {status}

[!] Note: Contract was previously approved.
    Edits will reset status to 'draft'.

    Continue? [Y/n]
```

## Save

```
Saving changes...

✓ Contract saved: contracts/{filename}
✓ Status: draft (reset due to edits)
✓ Backup: contracts/.backup/{filename}.{timestamp}

Next:
  - Validate: grabby validate {filename}
  - Re-approve: grabby approve {filename}
```

## Navigation
- [S] Save
- [B] Back to edit
- [Q] Quit without saving
