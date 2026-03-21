# Contract Ruleset Synchronization

## Overview

The Contract Sync feature integrates automatic ruleset synchronization checks into the Grabby contract lifecycle. This ensures all team members are working with the same rule versions and provides audit trails of which rules were active for each contract.

## Features

- **Automatic Sync Checks**: Runs before key contract commands (task, validate, plan, execute)
- **Ruleset Snapshots**: Records active ruleset versions in contract metadata
- **Drift Detection**: Identifies when local rulesets differ from the central repository
- **Flexible Sync Modes**: Choose how to handle drift (auto, strict, warn, manual)
- **Audit Trail**: Tracks all drift checks throughout the contract lifecycle

## Configuration

Add ruleset sync configuration to your `grabby.config.json`:

```json
{
  "rulesets": {
    "source": {
      "repo": "https://github.com/yourorg/grabby-rules.git",
      "branch": "main"
    },
    "active": [
      "languages/typescript",
      "frameworks/react",
      "policies/security"
    ],
    "sync": {
      "mode": "warn",
      "interval": "24h",
      "checkOnCommands": ["task", "validate", "plan", "execute"],
      "recordSnapshot": true
    }
  }
}
```

### Sync Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `mode` | string | `"warn"` | Sync strategy: `auto`, `strict`, `warn`, or `manual` |
| `interval` | string | `"24h"` | How often to sync (e.g., `12h`, `30m`, `7d`) |
| `checkOnCommands` | array | `[]` | Commands that trigger sync checks |
| `recordSnapshot` | boolean | `false` | Whether to record ruleset snapshots in contracts |

## Sync Modes

### auto
Automatically syncs when drift is detected.

```bash
$ grabby validate FC-003.fc.md

🔍 Checking ruleset sync...
⚠️  Drift detected:
  - policies/security: 3.0.0 → 3.1.0 (non-breaking)

🔄 Auto-syncing...
✅ Synced 1 ruleset in 0.8s
📝 Updated sync.lock

Proceeding with validation...
```

**Use when:** You want seamless updates for the team

**Pros:** Zero friction, team stays synchronized

**Cons:** Automatic updates may introduce unexpected changes

### strict
Blocks execution when any drift is detected. Requires manual sync.

```bash
$ grabby execute FC-003.fc.md

🔍 Checking ruleset sync...
❌ Rules drift detected - blocking execution

Local vs Remote:
  languages/typescript: 1.0.0 → 2.0.0 (BREAKING)

⚙️  Mode: strict - Execution blocked
Run: grabby rules sync

Error: Ruleset drift detected in strict mode
```

**Use when:** You need strict version control and reproducibility

**Pros:** Maximum control, no surprise updates

**Cons:** Requires manual intervention, can slow down workflow

### warn
Warns about drift but allows execution to continue.

```bash
$ grabby plan FC-003.fc.md

🔍 Checking ruleset sync...
⚠️  Drift detected:
  - languages/typescript: 1.0.0 → 1.1.0 (non-breaking)

⚙️  Mode: warn - Continuing with outdated rules
📝 Drift logged to contract metadata

Proceeding with plan generation...
```

**Use when:** You want awareness without blocking workflow

**Pros:** Non-disruptive, maintains awareness

**Cons:** Team may drift out of sync over time

### manual
Notifies about available updates but takes no action.

```bash
$ grabby task "Add user authentication"

🔍 Checking ruleset sync...
ℹ️  Updates available:
  - policies/security: 3.0.0 → 3.1.0

💡 Run: grabby rules sync (when ready)

Proceeding with contract creation...
```

**Use when:** You want full manual control

**Pros:** Complete control over when to update

**Cons:** Easy to fall behind on updates

## Contract Metadata

When `recordSnapshot: true`, contracts include ruleset metadata in YAML frontmatter:

```yaml
---
contract_id: FC-003
created: 2026-03-20T10:35:00Z

rulesets:
  version: "1.2.0"
  syncedAt: "2026-03-20T10:30:00Z"
  snapshot:
    - category: languages/typescript
      version: "1.0.0"
      hash: "sha256:abc123def..."
    - category: frameworks/react
      version: "2.0.0"
      hash: "sha256:def456abc..."
  driftChecks:
    - timestamp: "2026-03-20T10:35:00Z"
      command: "task"
      status: "clean"
    - timestamp: "2026-03-20T11:00:00Z"
      command: "plan"
      status: "clean"
    - timestamp: "2026-03-21T09:00:00Z"
      command: "execute"
      status: "drift_detected"
      action: "warned"
      changes:
        - ruleset: languages/typescript
          from: "1.0.0"
          to: "1.1.0"
          breaking: false
---

# Feature Contract: Add User Authentication
...
```

### Metadata Fields

**`rulesets.version`**: Version of the central manifest when contract was created

**`rulesets.syncedAt`**: Timestamp of last sync before contract creation

**`rulesets.snapshot`**: Array of active rulesets with versions and content hashes

**`rulesets.driftChecks`**: History of drift checks performed during contract lifecycle

Each drift check records:
- `timestamp`: When the check was performed
- `command`: Which command triggered the check
- `status`: `"clean"` or `"drift_detected"`
- `action`: What action was taken (e.g., `"warned"`, `"synced"`, `"blocked"`)
- `changes`: Array of detected ruleset changes

## Workflow Integration

### Contract Creation

When creating a contract with `grabby task`:

1. Sync check runs automatically (if configured)
2. Contract is created with ruleset snapshot in metadata
3. Snapshot captures exact ruleset versions at time of creation

### Contract Validation

Before `grabby validate`:

1. Sync check verifies rulesets are current
2. Drift check is recorded in contract metadata
3. Validation proceeds based on sync mode

### Contract Planning

Before `grabby plan`:

1. Sync check ensures planning uses current rules
2. Drift detection identifies changed requirements
3. Plan reflects active ruleset versions

### Contract Execution

Before `grabby execute`:

1. Final sync check before implementation begins
2. Ensures execution follows latest approved rules
3. Drift history helps debug rule-related issues

## Drift Detection

Drift is detected by comparing:

1. **Versions**: Semantic version changes (1.0.0 → 1.1.0)
2. **Hashes**: Content hash mismatches (indicates manual edits)
3. **Additions**: New rulesets in central repo
4. **Removals**: Rulesets removed from central repo

### Breaking vs Non-Breaking Changes

Drift is classified as **breaking** when:
- Major version increases (1.x.x → 2.0.0)
- Ruleset is removed from central repo
- Hash changes indicate content modifications

Non-breaking drift includes:
- Minor version updates (1.0.x → 1.1.0)
- Patch version updates (1.0.0 → 1.0.1)
- New ruleset additions

## Common Scenarios

### Scenario 1: New Team Member Setup

```bash
# Clone repo
git clone https://github.com/yourorg/project.git
cd project

# First contract command triggers sync
grabby task "My first task"

🔍 Checking ruleset sync...
⚠️  No sync lock found - run: grabby rules sync

# Sync rulesets
grabby rules sync

📦 Cloning central repo...
✅ Synced 6 rulesets from central repo
📝 Created sync.lock

# Now ready to work
grabby task "My first task"

🔍 Checking ruleset sync...
✅ All rulesets up to date

📋 Starting contract creation...
```

### Scenario 2: Working on Old Contract

```bash
# Contract was created 2 weeks ago with old rules
grabby plan FC-002.fc.md

🔍 Checking ruleset sync...
⚠️  Drift detected:
  - policies/security: 2.0.0 → 2.1.0 (non-breaking)
  - testing/unit: 1.0.0 → 1.1.0 (non-breaking)

⚙️  Mode: warn - Continuing with current rules
📝 Drift logged to contract metadata

Proceeding with plan generation...
```

The drift is logged but work continues. Review drift checks in metadata:

```yaml
driftChecks:
  - timestamp: "2026-03-05T10:00:00Z"
    command: "task"
    status: "clean"
  - timestamp: "2026-03-20T14:30:00Z"
    command: "plan"
    status: "drift_detected"
    action: "warned"
    changes:
      - ruleset: policies/security
        from: "2.0.0"
        to: "2.1.0"
        breaking: false
```

### Scenario 3: Breaking Change Detected

```bash
# Central repo has breaking security update
grabby execute FC-004.fc.md

🔍 Checking ruleset sync...
❌ Rules drift detected - blocking execution

Local vs Remote:
  policies/security: 2.0.0 → 3.0.0 (BREAKING)

⚙️  Mode: strict - Execution blocked
Run: grabby rules sync

# Review changes before syncing
grabby rules status

Active Rulesets:
  policies/security: 2.0.0 (central: 3.0.0) ⚠️  BREAKING

# Sync when ready
grabby rules sync

⚠️  Breaking changes detected:
  policies/security: 2.0.0 → 3.0.0

Continue? (y/N): y

✅ Synced 1 ruleset
📝 Updated sync.lock

# Now unblocked
grabby execute FC-004.fc.md

🔍 Checking ruleset sync...
✅ All rulesets up to date

Proceeding with execution...
```

### Scenario 4: Offline Development

```bash
# Working offline (no network access)
grabby validate FC-005.fc.md

🔍 Checking ruleset sync...
⚠️  Cannot reach central repo (offline)

⚙️  Mode: warn - Using cached manifest
📝 Drift check skipped (offline)

Proceeding with validation...
```

Sync checks gracefully degrade when offline:
- Uses cached manifest for drift detection
- Warns but doesn't block (except in strict mode with fresh cache)
- Logs offline status in drift checks

## Troubleshooting

### "No sync lock found"

**Cause**: You haven't synced rulesets yet

**Solution**:
```bash
grabby rules sync
```

### "Sync is stale"

**Cause**: Last sync was longer ago than configured interval

**Solution**:
```bash
# Check status
grabby rules status

# Sync if needed
grabby rules sync
```

### "No cached manifest"

**Cause**: Central repo hasn't been cloned yet

**Solution**:
```bash
# Clone and sync
grabby rules sync
```

### "Execution blocked by ruleset sync check"

**Cause**: Drift detected in strict mode

**Solution**:
```bash
# Check what changed
grabby rules status

# Review changes
grabby rules show <category/name>

# Sync when ready
grabby rules sync
```

### "Cannot reach central repo"

**Cause**: Network unavailable or repo URL incorrect

**Solutions**:
1. Check network connection
2. Verify `rulesets.source.repo` URL in config
3. Check credentials/permissions for private repos
4. Work offline (in warn mode, sync checks are skipped)

## Best Practices

### For Teams

1. **Choose the right sync mode**:
   - Start with `warn` for gradual adoption
   - Move to `auto` for seamless updates
   - Use `strict` for critical projects requiring reproducibility

2. **Set appropriate sync intervals**:
   - Active projects: `12h` or `24h`
   - Stable projects: `7d` or `30d`
   - Critical projects: `1h` (with `strict` mode)

3. **Always record snapshots**:
   ```json
   {
     "rulesets": {
       "sync": {
         "recordSnapshot": true
       }
     }
   }
   ```

4. **Review drift history**: Check contract metadata to understand how rules evolved

5. **Communicate breaking changes**: Announce major ruleset updates to the team

### For Individuals

1. **Sync regularly**: Run `grabby rules sync` at start of day

2. **Check drift before major work**:
   ```bash
   grabby rules status
   ```

3. **Review ruleset changes**:
   ```bash
   grabby rules show policies/security
   ```

4. **Update stale contracts**: When resuming old work, check for drift and decide whether to sync

## API Reference

### Exported Functions

**`performSyncCheck(commandName, options, cwd)`**

Performs sync check before command execution.

- **Parameters**:
  - `commandName` (string): Command triggering the check
  - `options` (object): Options including `logger`
  - `cwd` (string): Working directory
- **Returns**: Promise<object> with sync check result

**`addRulesetSnapshotToContract(contractPath, cwd)`**

Adds ruleset snapshot to contract metadata.

- **Parameters**:
  - `contractPath` (string): Path to contract file
  - `cwd` (string): Working directory
- **Returns**: Promise<boolean> - true if snapshot added

**`updateContractDriftCheck(contractPath, checkResult, commandName, cwd)`**

Records drift check in contract metadata.

- **Parameters**:
  - `contractPath` (string): Path to contract file
  - `checkResult` (object): Result from performSyncCheck
  - `commandName` (string): Command that triggered check
  - `cwd` (string): Working directory
- **Returns**: Promise<boolean> - true if updated

## Related Documentation

- [Rules CLI Reference](./RULES_CLI.md) - Complete guide to ruleset commands
- [Ruleset Manifest](../templates/manifest.yaml) - Example manifest structure
- [Sync Lock Format](../templates/sync.lock.yaml) - Lock file structure

## Migration Guide

### Enabling Sync Checks for Existing Project

1. **Add ruleset configuration** to `grabby.config.json`:
   ```json
   {
     "rulesets": {
       "source": {
         "repo": "https://github.com/yourorg/grabby-rules.git",
         "branch": "main"
       },
       "active": ["languages/typescript"],
       "sync": {
         "mode": "warn",
         "checkOnCommands": ["task", "validate"],
         "recordSnapshot": true
       }
     }
   }
   ```

2. **Initial sync**:
   ```bash
   grabby rules sync
   ```

3. **Test with a new contract**:
   ```bash
   grabby task "Test sync checks"
   ```

4. **Gradually add more commands** to `checkOnCommands`:
   ```json
   {
     "checkOnCommands": ["task", "validate", "plan", "execute"]
   }
   ```

5. **Consider stricter mode** once team is comfortable:
   ```json
   {
     "mode": "auto"  // or "strict"
   }
   ```

### Backward Compatibility

- Sync checks are **opt-in** (only run if rulesets configured)
- Existing contracts **without metadata continue to work**
- Sync checks can be **disabled per-command** via `checkOnCommands`
- **Graceful degradation** when offline or repo unavailable

## FAQ

**Q: Do sync checks slow down my workflow?**

A: Minimal impact. Checks use cached manifests and typically complete in < 100ms. Network fetches only occur during actual sync operations.

**Q: What happens if I work offline?**

A: In `warn` or `manual` mode, sync checks are skipped. In `strict` mode, execution may be blocked if the cache is stale.

**Q: Can I have different sync modes per project?**

A: Yes, configure `rulesets.sync.mode` in each project's `grabby.config.json`.

**Q: Will old contracts break if I enable sync checks?**

A: No. Contracts without metadata continue to work. Sync checks only apply to new contracts or when explicitly run.

**Q: How do I temporarily disable sync checks?**

A: Set `checkOnCommands: []` in config, or use `--no-sync-check` flag (if implemented).

**Q: What if my team uses different rule versions?**

A: This is exactly what sync checks prevent! Use `auto` or `strict` mode to keep the team synchronized.

**Q: Can I sync from multiple repos?**

A: Not currently. The system supports one central repo per project. Use local overrides for project-specific rules.

**Q: Are sync checks compatible with CI/CD?**

A: Yes! In CI, use `strict` mode and run `grabby rules sync` in your setup phase to ensure reproducible builds.
