# Migration Guide: Engine/Ruleset Separation

This guide covers changes introduced in the engine/ruleset decoupling update.

## Overview

The Grabby engine and ruleset subsystem are now independent modules. The engine can run without rulesets, and rulesets load as an optional plugin.

## Breaking Changes

None. All existing workflows continue to work unchanged.

## New Features

### Separate Rulesets Configuration

You can now use a dedicated `rulesets.config.json` file instead of embedding ruleset config in `grabby.config.json`.

**Before (still supported):**
```json
// grabby.config.json
{
  "rulesets": {
    "source": { "repo": "https://github.com/org/rules.git" },
    "active": ["languages/javascript"]
  }
}
```

**New option:**
```json
// rulesets.config.json
{
  "source": { "repo": "https://github.com/org/rules.git" },
  "active": ["languages/javascript"]
}
```

When both files exist, settings are merged with `rulesets.config.json` taking precedence.

### Optional Ruleset Metadata in Contracts

Contract ruleset metadata can now be stored in a sidecar file instead of YAML frontmatter.

**Configure in grabby.config.json:**
```json
{
  "rulesets": {
    "metadata": {
      "enabled": true,
      "location": "sidecar"
    }
  }
}
```

This creates `{contract-id}.rulesets.json` alongside contracts instead of embedding in frontmatter.

### Advisory Sync Checks

Ruleset sync checks are now advisory by default. Commands proceed even when drift is detected.

**To enable blocking (previous behavior):**
```json
{
  "rulesets": {
    "sync": {
      "blocking": true
    }
  }
}
```

## Module Restructure

Ruleset modules moved to `lib/rulesets/`. Backward-compatible re-exports exist at the old paths.

| Old Path | New Path |
|----------|----------|
| `lib/rules-sync.cjs` | `lib/rulesets/sync.cjs` |
| `lib/rules-cli.cjs` | `lib/rulesets/cli.cjs` |
| `lib/contract-rulesets.cjs` | `lib/rulesets/contract-integration.cjs` |
| `lib/ruleset-builder.cjs` | `lib/rulesets/builder.cjs` |
| `lib/ruleset-registry.cjs` | `lib/rulesets/registry.cjs` |
| `lib/rules-authoring.cjs` | `lib/rulesets/authoring.cjs` |
| `lib/manifest-parser.cjs` | `lib/rulesets/common/manifest-parser.cjs` |
| `lib/sync-lock.cjs` | `lib/rulesets/common/sync-lock.cjs` |

**For plugins/extensions:** Update imports to new paths. Old paths will be deprecated in a future release.

## Plugin System

A new plugin architecture supports extensibility. Rulesets are now the first built-in plugin.

### Plugin Hooks

Available hooks for custom plugins:
- `onInit` - Plugin initialization
- `onCommand` - Before any command executes
- `onContractCreate` - After contract creation
- `onValidate` - Before validate command
- `onPlan` - Before plan command
- `onExecute` - Before execute command
- `onAudit` - Before audit command

### Creating a Plugin

```javascript
// lib/plugins/my-plugin.plugin.cjs
module.exports = {
  id: 'my-plugin',
  name: 'My Plugin',
  version: '1.0.0',
  hooks: {
    onValidate: async (context) => {
      console.log('Validating:', context.contractPath);
      return { cancel: false };
    }
  }
};
```

Plugins are auto-discovered from `lib/plugins/*.plugin.cjs`.

## Running Without Rulesets

The engine now works without ruleset configuration:

1. Remove or empty the `rulesets` section in config
2. All core commands (`task`, `validate`, `plan`, `execute`) work normally
3. Ruleset-specific commands (`rules sync`, `rules status`) report "not configured"

## Troubleshooting

### "Ruleset integration unavailable" warning

This is informational. The engine continues without ruleset checks. To resolve:
- Ensure `lib/rulesets/` directory exists
- Check for syntax errors in ruleset modules

### Import errors after update

If you have custom code importing ruleset modules:
1. Update imports to new paths in `lib/rulesets/`
2. Or continue using old paths (deprecated but functional)

## Questions?

Open an issue at the project repository for migration assistance.
