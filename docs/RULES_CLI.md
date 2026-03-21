# Grabby Rules CLI

Command-line interface for managing modular rulesets in Grabby.

## Overview

The Grabby Rules CLI provides commands to:
- Sync with a central ruleset repository
- Browse and search available rulesets
- Add/remove rulesets from your project
- Apply preset bundles
- Check sync status and detect drift

## Prerequisites

- Grabby CLI installed (`npm install -g grabby`)
- Git installed (for sync operations)
- Central ruleset repository configured

## Quick Start

```bash
# 1. Configure central repository in grabby.config.json
grabby config set rulesets.source.repo https://github.com/yourorg/grabby-rules.git

# 2. Sync with central repository
grabby rules sync

# 3. Browse available rulesets
grabby rules list

# 4. Add a ruleset to your project
grabby rules add languages/typescript

# 5. Check status
grabby rules status
```

## Commands

### `grabby rules sync`

Sync with the central ruleset repository to fetch the latest manifest and rulesets.

**Usage:**
```bash
grabby rules sync [--force] [--dry-run]
```

**Options:**
- `--force` - Force refresh even if recently synced
- `--dry-run` - Show what would change without making changes

**Examples:**
```bash
# Sync with central repository
$ grabby rules sync
🔄 Syncing with central repository...
✅ Sync successful
📦 Manifest version: 1.0.0
⏰ Last sync: 3/20/2026, 10:30:00 AM
📋 Available rulesets: 16

# Force refresh
$ grabby rules sync --force
```

---

### `grabby rules list`

List all available rulesets from the central repository.

**Usage:**
```bash
grabby rules list [--category <name>]
```

**Options:**
- `--category <name>` - Filter rulesets by category

**Examples:**
```bash
# List all rulesets
$ grabby rules list

Available Rulesets:

languages/ (4 rulesets)
  Programming language standards
  ✓ typescript@1.0.0 [frontend, backend] [active]
  ○ javascript@1.0.0 [frontend, backend]
  ○ go@1.0.0 [backend, microservices]
  ○ python@1.0.0 [backend, ml]

frameworks/ (3 rulesets)
  Framework-specific patterns
  ✓ react@1.0.0 [frontend] [active]
  ○ nextjs@1.0.0 [frontend, ssr]
  ○ express@1.0.0 [backend, api]

# Filter by category
$ grabby rules list --category languages
```

---

### `grabby rules search`

Search for rulesets by name, tags, or category.

**Usage:**
```bash
grabby rules search <query>
```

**Examples:**
```bash
# Search by name
$ grabby rules search typescript

Found 1 ruleset:

1. languages/typescript@1.0.0
   Programming language standards
   Tags: frontend, backend, strict

# Search by tag
$ grabby rules search security

Found 2 rulesets:

1. policies/security@1.0.0
   Security and compliance standards
   Tags: security, compliance

2. domains/auth@1.0.0
   Authentication patterns
   Tags: security, authentication
```

---

### `grabby rules show`

Show detailed information about a specific ruleset.

**Usage:**
```bash
grabby rules show <category/name>
```

**Examples:**
```bash
$ grabby rules show languages/typescript

Ruleset: typescript
Category: languages
Version: 1.0.0
Status: Active
Tags: frontend, backend, strict
Extends: -
Compatible with: frameworks/react, frameworks/express

Description: Programming language standards and conventions
```

---

### `grabby rules add`

Add a ruleset to your project's active rulesets.

**Usage:**
```bash
grabby rules add <category/name>
```

**Examples:**
```bash
$ grabby rules add policies/security
✅ Added policies/security@1.0.0 to active rulesets
📝 Updated grabby.config.json
🔄 Run 'grabby rules sync' to fetch ruleset

# Verify it was added
$ grabby config show | grep -A 5 "active"
  "active": [
    "languages/typescript",
    "frameworks/react",
    "policies/security"
  ]
```

---

### `grabby rules remove`

Remove a ruleset from your project's active rulesets.

**Usage:**
```bash
grabby rules remove <category/name>
```

**Examples:**
```bash
$ grabby rules remove policies/security
✅ Removed policies/security from active rulesets
📝 Updated grabby.config.json
```

---

### `grabby rules status`

Show sync status, active rulesets, and detect drift.

**Usage:**
```bash
grabby rules status
```

**Examples:**
```bash
$ grabby rules status

Sync Status:
Fresh (synced 2 hours ago)

Central Repository: https://github.com/yourorg/grabby-rules.git
Branch: main
Commit: abc123de
Manifest Version: 1.0.0

Active Rulesets (3):
  - languages/typescript@1.0.0 ✅
  - frameworks/react@1.0.0 ✅
  - policies/security@1.0.0 ✅

Drift Detection:
✅ No drift detected
```

**With Drift:**
```bash
$ grabby rules status

Drift Detection:
⚠️  2 changes detected
  - languages/typescript: 1.0.0 → 1.1.0
  - policies/security: 3.0.0 → 4.0.0 (BREAKING)

🔄 Run 'grabby rules sync' to update
```

---

### `grabby rules preset`

Apply a preset bundle of rulesets.

**Usage:**
```bash
grabby rules preset <name>
```

**Examples:**
```bash
$ grabby rules preset fullstack-typescript

Applying preset: fullstack-typescript
Description: Full-stack TypeScript application with React frontend and Express backend

Will add:
  - languages/typescript@1.0.0
  - frameworks/react@1.0.0
  - frameworks/express@1.0.0
  - domains/api-compat@1.0.0
  - policies/security@1.0.0
  - testing/unit@1.0.0

✅ Added 6 rulesets to config
📝 Updated grabby.config.json
🔄 Run 'grabby rules sync' to fetch rulesets
```

---

## Configuration

### Central Repository

Configure the central ruleset repository in `grabby.config.json`:

```json
{
  "rulesets": {
    "source": {
      "repo": "https://github.com/yourorg/grabby-rules.git",
      "branch": "main",
      "version": ""
    },
    "active": [],
    "sync": {
      "mode": "warn",
      "interval": "24h",
      "onDrift": "warn",
      "checkOnCommands": ["task", "validate", "plan", "execute"],
      "allowStale": false,
      "recordSnapshot": true
    },
    "drift": {
      "detection": "hash",
      "tolerance": "patch",
      "autoResolve": false,
      "notifyChannels": ["cli"]
    },
    "overrides": {},
    "local": [],
    "cacheDir": ".grabby/rulesets/cache",
    "lockPath": ".grabby/rulesets/sync.lock.yaml"
  }
}
```

### Sync Modes

- `auto` - Automatically sync when drift detected
- `strict` - Block execution if drift detected
- `warn` - Warn about drift but continue
- `manual` - Never auto-sync, just notify

### Drift Detection

- `hash` - Detect changes by content hash
- `version` - Detect changes by version number
- `timestamp` - Detect changes by modification time

## Common Workflows

### Setting Up a New Project

```bash
# 1. Initialize Grabby
grabby init

# 2. Configure central repository
grabby config set rulesets.source.repo https://github.com/yourorg/grabby-rules.git

# 3. Sync rulesets
grabby rules sync

# 4. Apply a preset or add individual rulesets
grabby rules preset fullstack-typescript

# 5. Sync to fetch the rulesets
grabby rules sync

# 6. Verify
grabby rules status
```

### Adding a New Ruleset

```bash
# Search for available rulesets
grabby rules search testing

# View details
grabby rules show testing/e2e

# Add it
grabby rules add testing/e2e

# Sync to fetch
grabby rules sync
```

### Updating Rulesets

```bash
# Check for updates
grabby rules status

# If drift detected, sync to update
grabby rules sync
```

### Troubleshooting

**"No central repository configured"**
```bash
grabby config set rulesets.source.repo <url>
```

**"Git is not available"**
- Install Git: https://git-scm.com/downloads

**"No cached manifest found"**
```bash
grabby rules sync
```

**"Ruleset not found"**
- Make sure you've run `grabby rules sync`
- Check the ruleset reference format: `category/name`
- Use `grabby rules search` to find available rulesets

## Files

- `.grabby/rulesets/sync.lock.yaml` - Tracks synced rulesets and versions
- `.grabby/rulesets/cache/` - Cached central repository
- `grabby.config.json` - Project configuration

---

## Shared Rules Authoring

Grabby provides a dedicated authoring flow for **shared project rules** that are protected from normal operations.

### Protected Path Model

Shared rules are stored in a protected directory (default: `.grabby/rulesets/shared/`). This location is **write-protected** from normal Grabby operations:

- `grabby task`, `grabby execute`, and `grabby audit` **cannot** write to this path
- Only explicit authoring commands (`grabby rules generate`, `grabby rules update`) can modify these files
- Manual file edits outside Grabby are still permitted

This ensures shared rules are intentionally managed rather than accidentally mutated during contract execution.

### `grabby rules generate`

Generate a new shared ruleset from repository guidance sources.

**Usage:**
```bash
grabby rules generate [--title=<name>] [--goal=<text>] [--sources=<csv>]
```

**Options:**
- `--title=<name>` - Title for the ruleset (default: "Shared Project Rules")
- `--goal=<text>` - Goal/purpose description
- `--sources=<csv>` - Comma-separated list of guidance sources to use

**Example:**
```bash
$ grabby rules generate --title="API Standards"

Shared Rules Generation
----------------------------------------
Discovered guidance files:
  - AGENTS.md
  - docs
  - README.md

Found 3 guidance file(s) to process.

✅ Shared ruleset generated successfully
📁 Path: .grabby/rulesets/shared/api-standards.ruleset.md
📝 Sources used: 3

Note: This location is write-protected from normal Grabby operations.
Use 'grabby rules update' to modify this ruleset.
```

---

### `grabby rules update`

Update an existing shared ruleset.

**Usage:**
```bash
grabby rules update [file] [--goal=<text>] [--sources=<csv>]
```

**Options:**
- `file` - Path to the ruleset to update (auto-detected if only one exists)
- `--goal=<text>` - Description of the update goal
- `--sources=<csv>` - Additional guidance sources to incorporate

**Example:**
```bash
$ grabby rules update --goal="Add security rules"

Shared Rules Update
----------------------------------------

✅ Shared ruleset updated successfully
📁 Path: .grabby/rulesets/shared/api-standards.ruleset.md
📝 Sources incorporated: 3
```

---

### `grabby rules shared`

List all shared rulesets in the protected path.

**Usage:**
```bash
grabby rules shared
```

**Example:**
```bash
$ grabby rules shared

Shared Rulesets
----------------------------------------
Protected path: .grabby/rulesets/shared

1. api-standards
   Path: .grabby/rulesets/shared/api-standards.ruleset.md
   Modified: 3/21/2026, 10:30:00 AM

Note: These rulesets are write-protected from normal operations.
Use 'grabby rules update' to modify them.
```

---

### Configuration

Configure authoring behavior in `grabby.config.json`:

```json
{
  "rulesets": {
    "authoring": {
      "enabled": true,
      "protectedPath": ".grabby/rulesets/shared",
      "guidanceSources": ["AGENTS.md", "docs", ".cursor/rules", "README.md"]
    }
  }
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `true` | Enable/disable authoring commands |
| `protectedPath` | `.grabby/rulesets/shared` | Protected directory for shared rules |
| `guidanceSources` | `["AGENTS.md", "docs", ...]` | Files to scan for guidance |

---

### Why Protected Paths?

1. **Governance**: Shared project rules are intentionally managed, not accidentally mutated
2. **Safety**: Normal contract execution cannot write into the shared rules directory
3. **Consistency**: Rules authoring happens through a dedicated, repeatable command surface
4. **Traceability**: Changes to shared rules are clearly attributable to explicit authoring actions

---

## See Also

- [Modular Ruleset System Architecture](./MODULAR_RULESETS.md) (Phase 3+)
- [Central Repository Setup Guide](./CENTRAL_REPO_SETUP.md) (Coming soon)
- [Creating Custom Rulesets](./CUSTOM_RULESETS.md) (Coming soon)
