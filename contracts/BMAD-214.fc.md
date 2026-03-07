# FC: risk-tiered-verification
**ID:** BMAD-214 | **Status:** complete
ARCH_VERSION: v1
RULESET_VERSION: v1
ENV_VERSION: v1

## Ticket
- Ticket ID: BMAD-201
- Who: Grabby maintainers and AI-assisted developers
- What: Add risk-based verification tiers to the Test Engineer stage
- Why: Match verification effort to risk while preserving speed for low-risk work

## Objective
Add deterministic verification tiers with evidence requirements integrated into existing audit flow.

## Scope
- Define verification tiers (`basic`, `standard`, `high-risk`)
- Select tier using contract risk signals and change metadata
- Require tier-specific evidence before audit can pass cleanly
- Surface selected tier and missing evidence in verification/audit output

## Non-Goals
- Enterprise TEA-level framework adoption
- External compliance tooling integration
- Replacing existing test commands

## Directories
**Allowed:** `lib/`, `agents/`, `workflows/`, `tests/`, `docs/`
**Restricted:** `contracts/`, `node_modules/`, `.git/`, `dist/`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | `agents/test-engineer.agent.yaml` | Encode tiered verification role expectations |
| modify | `workflows/test-engineer/workflow.yaml` | Add tier selection and evidence enforcement steps |
| modify | `lib/commands.cjs` | Render tier/evidence summary in verification and audit paths |
| create | `tests/verification-tiering.test.js` | Validate deterministic tier selection and evidence checks |
| modify | `docs/AGENT_ARCHITECTURE.md` | Document tiered verification responsibilities |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery
- Security: Run `npm audit` before adding packages

## Security Considerations
- [x] Tier selection cannot be spoofed by untrusted input
- [x] Evidence output avoids exposing sensitive test fixture data
- [x] High-risk tier criteria include auth/payment/data-impact signals

## Code Quality
- [x] Tier rules are centralized and unit-tested
- [x] Agent/workflow docs stay aligned with runtime behavior
- [x] Verification output stays machine-parseable and human-readable

## Done When
- [x] Tier selection is deterministic for representative contract profiles
- [x] Missing required evidence prevents clean pass
- [x] Verification output includes selected tier and evidence summary
- [x] Tests cover at least one profile per tier
- [x] Coverage remains at or above 80%
- [x] Lint passes
- [x] Tests pass

## Testing
Unit tests for tier classification and evidence requirements; integration tests for verification/audit output.

## Context Refs
- ARCH_INDEX_v1
- RULESET_CORE_v1

