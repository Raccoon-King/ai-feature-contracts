# Pre-Op Summary Feature

The pre-op summary displays a formatted contract overview in a rounded box during dev ticket creation and before commits. This helps developers stay aligned with their contract scope.

## Overview

When you create a dev ticket using `grabby task` or `grabby orchestrate`, a pre-op summary is automatically generated and displayed. This summary is also shown in the pre-commit hook before each commit.

## How It Works

### During Ticket Creation

1. Run `grabby task "your feature description"`
2. After artifacts are created, the pre-op summary is displayed:

```
PRE-OP SUMMARY
╭──────────────────────────────────────────────────────────────────────╮
│ Plan to implement                                                    │
│                                                                      │
│ Your Feature Title                                                   │
│                                                                      │
│ Overview                                                             │
│ Brief description from the contract context...                       │
│                                                                      │
│ User Requirements                                                    │
│ - Requirement from Done When checklist                               │
│ - Another requirement                                                │
│                                                                      │
│ ---                                                                  │
│ Files to Modify                                                      │
│ ┌────────────────┬─────────────────────────────────────────────────┐ │
│ │File            │Changes                                          │ │
│ ├────────────────┼─────────────────────────────────────────────────┤ │
│ │src/app.js      │allowed directory                                │ │
│ └────────────────┴─────────────────────────────────────────────────┘ │
│ ---                                                                  │
│ Verification Plan                                                    │
│ 1. First verification item                                           │
│ 2. Second verification item                                          │
╰──────────────────────────────────────────────────────────────────────╯
```

3. The summary is saved to `.grabby/pre-ops/<contract-id>.preop.txt`

### During Pre-Commit

When you commit code, the pre-commit hook displays the pre-op summary for any active contracts:

```bash
git commit -m "feat: implement feature"

[grabby] Contract Enforcement Check
─────────────────────────────────────
  Staged files: 3
  Active contracts: 1

✓ Active contracts found:
  - FC-001

Pre-Op Summary:
╭──────────────────────────────────────────────────────────────────────╮
│ Plan to implement                                                    │
│ ...                                                                  │
╰──────────────────────────────────────────────────────────────────────╯

✓ Pre-commit checks passed.
```

## API Reference

### `formatContractSummaryBox(options)`

Formats a contract summary in a rounded Unicode box.

**Location:** `lib/tui.cjs`

**Parameters:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `title` | string | `'Contract Summary'` | Main title |
| `subtitle` | string | `''` | Optional subtitle |
| `overview` | string | `''` | Brief overview text |
| `requirements` | string[] | `[]` | User requirements list |
| `phases` | object[] | `[]` | Implementation phases `[{name, file, items}]` |
| `files` | object[] | `[]` | Files to modify `[{file, changes}]` |
| `verification` | string[] | `[]` | Verification plan items |
| `width` | number | `80` | Box width in characters |

**Example:**

```javascript
const { formatContractSummaryBox } = require('./lib/tui.cjs');

const summary = formatContractSummaryBox({
  title: 'Mobile Layout Overhaul',
  subtitle: 'Phase 1',
  overview: 'Redesign mobile layout for landscape orientation',
  requirements: [
    'Landscape-only orientation',
    'Bottom shelf navigation',
    'Minimal visible controls'
  ],
  phases: [
    {
      name: 'Phase 1: CSS Foundation',
      file: 'src/styles.css',
      items: ['Add media queries', 'Create shelf styles']
    }
  ],
  files: [
    { file: 'src/styles.css', changes: 'New mobile styles' },
    { file: 'src/App.jsx', changes: 'Mobile state logic' }
  ],
  verification: [
    'Desktop layout unchanged',
    'Mobile landscape works',
    'Touch targets 44px minimum'
  ],
  width: 70
});

console.log(summary);
```

### `buildPreOpSummary(contractContent, planContent)`

Builds a pre-op summary from contract and plan content.

**Location:** `lib/interactive-workflows.cjs`

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `contractContent` | string | Raw markdown content of the contract |
| `planContent` | string \| null | Raw YAML content of the plan (optional) |

**Returns:** Formatted pre-op summary string

**Example:**

```javascript
const { buildPreOpSummary } = require('./lib/interactive-workflows.cjs');
const fs = require('fs');

const contract = fs.readFileSync('contracts/FC-001.fc.md', 'utf8');
const plan = fs.readFileSync('contracts/FC-001.plan.yaml', 'utf8');

const summary = buildPreOpSummary(contract, plan);
console.log(summary);
```

### `savePreOpSummary(grabbyDir, contractId, summary)`

Saves the pre-op summary for use by the pre-commit hook.

**Location:** `lib/interactive-workflows.cjs`

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `grabbyDir` | string | Path to `.grabby` directory |
| `contractId` | string | Contract ID (e.g., `FC-001`) |
| `summary` | string | Formatted pre-op summary |

**Returns:** Path to the saved pre-op file

## File Storage

Pre-op summaries are stored in:

```
.grabby/
  pre-ops/
    FC-001.preop.txt
    FC-002.preop.txt
```

These files are read by the pre-commit hook to display summaries before commits.

## Git Hook Integration

The pre-commit hook (`hooks/pre-commit`) automatically displays pre-op summaries:

1. Finds active contracts (status: approved or executing)
2. Looks for corresponding `.grabby/pre-ops/<id>.preop.txt` file
3. Displays the summary before allowing the commit

To install hooks:

```bash
grabby init-hooks
```

## Best Practices

1. **Review the pre-op before committing** - Ensure your changes align with the contract scope
2. **Update contracts when scope changes** - Re-run `grabby task` to regenerate the pre-op
3. **Use strict mode for enforcement** - Set `GRABBY_STRICT=1` to block commits without contracts
