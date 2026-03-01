# Step 2: Confirm & Generate

## Goal
Confirm the quick spec and generate minimal contract.

## Quick Spec Summary

```
═══════════════════════════════════════════════════
QUICK SPEC
═══════════════════════════════════════════════════

Change: {description}

Files:
  - {file1}
  - {file2}

Test: {test_criteria}

Risk: {risk_or_none}

═══════════════════════════════════════════════════
```

## Confirmation

```
Does this look right? [Y/n]
```

## Quick Contract Template

```markdown
# QFC: {name}
**ID:** QFC-{timestamp} | **Status:** approved

## Change
{description}

## Files
| Action | Path |
|--------|------|
| modify | `{file1}` |
| modify | `{file2}` |

## Done When
- [ ] {test_criteria}
- [ ] Tests pass
- [ ] Lint passes

## Risk
{risk_or_none}
```

## Output

Quick contracts are auto-approved (no separate approval step).

```
Quick contract created: contracts/{slug}.quick.md
Status: approved (auto)

Ready to implement!
Paste the above to your AI assistant, or run:
  grabby agent quick QD {slug}.quick.md
```

## Navigation
- [Y] Yes, generate and proceed
- [E] Edit spec
- [Q] Quit
