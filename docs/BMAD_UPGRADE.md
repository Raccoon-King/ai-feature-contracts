# BMAD-Derived Upgrade Guide

## Purpose
Enable selected BMAD-inspired behaviors in Grabby incrementally and safely.

## Feature Flags

Set these in `grabby.config.json`:

```json
{
  "bmadFeatures": {
    "adaptiveHelp": false,
    "quickFlowGuardrails": false,
    "riskTieredVerification": false
  }
}
```

## Rollout Order

1. Enable `adaptiveHelp`
2. Enable `quickFlowGuardrails`
3. Enable `riskTieredVerification`

## Behavior Mapping

| Area | Default Behavior | Feature-Enabled Behavior |
|---|---|---|
| `grabby help` | static command catalog | stage-aware `Suggested Now` guidance |
| quick flow | bounded flow, limited escalation detail | explicit complexity escalation + adversarial review loop guidance |
| verification output | single-level checklist | includes `basic`/`standard`/`high-risk` tier and rationale |

## Rollback

To rollback, set all flags to `false` and rerun commands:
- `grabby help`
- `grabby quick`
- `grabby execute <file>`
- `grabby audit <file>`

No schema/data migration is required for rollback.
