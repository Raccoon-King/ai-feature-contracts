# FC: example-governed
**ID:** FC-EXAMPLE-GOV | **Status:** draft
CONTRACT_TYPE: FEATURE_CONTRACT
ARCH_VERSION: v3
RULESET_VERSION: v2
ENV_VERSION: v1

## Objective
Demonstrate deterministic context resolution, hard scope guardrails, and metrics.

## Scope
- Add context resolver command
- Enforce runtime file boundaries

## Non-Goals
- Multi-agent orchestration changes

## Directories
**Allowed:** `lib/`, `docs/`, `contracts/`
**Restricted:** `node_modules/`, `.env*`, `backend/`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | `lib/commands.cjs` | Command workflow hooks |
| create | `lib/governance-runtime.cjs` | Resolver and guardrail runtime |
| create | `docs/context-index.yaml` | Context reference registry |

## Done When
- [ ] Resolve command works
- [ ] Out-of-scope edits hard fail
- [ ] Metrics file generated

## Context Refs
- ARCH: auth-module@v3
- RULESET: imports@v2
- ENV: test-runner@v1
