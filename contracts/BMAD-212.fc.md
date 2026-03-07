# FC: quick-flow-guardrails
**ID:** BMAD-212 | **Status:** complete
ARCH_VERSION: v1
RULESET_VERSION: v1
ENV_VERSION: v1

## Ticket
- Ticket ID: BMAD-201
- Who: Grabby maintainers and AI-assisted developers
- What: Harden quick flow with escalation and adversarial review loops
- Why: Keep quick flow fast for small work while preventing unsafe use on larger changes

## Objective
Introduce BMAD-inspired quick-flow guardrails that escalate oversized work and enforce a lightweight review loop.

## Scope
- Add complexity-based escalation gate to quick flow
- Add mandatory self-check plus adversarial review phase in quick dev
- Classify review findings by severity and support single remediation loop
- Preserve low-friction path for truly bounded changes

## Non-Goals
- Full BMAD quick-dev parity
- Replacing full contract workflow with quick flow
- Adding external review dependencies

## Directories
**Allowed:** `lib/`, `workflows/`, `tests/`, `docs/`
**Restricted:** `contracts/`, `node_modules/`, `.git/`, `dist/`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | `workflows/quick-flow/workflow.yaml` | Add escalation decision point and threshold guidance |
| modify | `workflows/quick-dev/workflow.yaml` | Add self-check and adversarial review steps |
| modify | `lib/interactive-workflows.cjs` | Implement routing and loop behavior for quick flow |
| create | `tests/quick-flow-guardrails.test.js` | Verify escalation and review-loop behavior |
| modify | `docs/EXECUTION_PROTOCOL.md` | Document quick-flow escalation semantics |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery

## Security Considerations
- [x] No unsafe execution path can bypass escalation guardrails
- [x] Review-loop output does not leak sensitive repository data
- [x] Quick flow remains bounded by explicit thresholds

## Code Quality
- [x] Quick-flow logic remains modular and testable
- [x] Workflow YAML and runtime behavior stay consistent
- [x] Regression risk is covered by deterministic tests

## Done When
- [x] Quick flow escalates when complexity threshold is exceeded
- [x] Escalation output includes explicit reason and suggested full-flow command
- [x] Quick dev enforces self-check and adversarial review step
- [x] Severity mapping (`blocker`, `major`, `minor`) is reflected in output
- [x] Tests cover bounded, escalated, and remediated paths
- [x] Coverage remains at or above 80%
- [x] Lint passes
- [x] Tests pass

## Testing
Unit/integration tests for quick-flow routing, escalation detection, and review-loop transitions.

## Context Refs
- ARCH_INDEX_v1
- RULESET_CORE_v1

