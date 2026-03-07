# BMAD-201 Story Set: BMAD Logic Adoption

## Epic 1: Baseline and Import Boundaries

### Story BMAD-201-01: Build BMAD-to-Grabby Capability Matrix
- Type: analysis
- Goal: Document which BMAD workflows/behaviors should be adopted, adapted, or rejected for Grabby.
- Acceptance Criteria:
- A matrix exists mapping BMAD capability -> Grabby equivalent -> decision (`adopt`, `adapt`, `defer`, `reject`).
- Each rejected/deferred item includes a concrete reason (complexity, overlap, or governance conflict).
- Matrix includes at least: help routing, quick flow, story cycle, readiness checks, QA depth, retrospectives.
- Dependencies: none

### Story BMAD-201-02: Define "High-Value Logic" Rubric
- Type: analysis
- Goal: Prevent over-importing BMAD logic that adds ceremony without measurable value.
- Acceptance Criteria:
- Rubric includes scoring for user impact, implementation cost, governance fit, and maintenance burden.
- Rubric is applied to all candidate imports from Story BMAD-201-01.
- A prioritized import list (P0/P1/P2) is produced.
- Dependencies: BMAD-201-01

## Epic 2: Adaptive Guidance and Routing

### Story BMAD-201-03: Add Adaptive Next-Step Recommendations to `grabby help`
- Type: feature
- Goal: Bring BMAD-style "what next" intelligence into Grabby CLI help flow.
- Acceptance Criteria:
- `grabby help` recommendations vary by artifact state (no contract, draft contract, planned, approved, in execution, audit-ready).
- Recommendations include exact next command and short rationale.
- Guidance avoids suggesting plan/execute actions when governance gates are not met.
- Dependencies: BMAD-201-02

### Story BMAD-201-04: Add Command Discovery Summary for Current Repo Context
- Type: feature
- Goal: Surface relevant workflows and commands by current stage, not static listing only.
- Acceptance Criteria:
- Help output contains a "Suggested Now" section and a "Also Available" section.
- Suggested commands are limited to top 3 most relevant actions for current stage.
- Output remains deterministic when no repo artifacts exist.
- Dependencies: BMAD-201-03

### Story BMAD-201-05: Test Adaptive Guidance Branches
- Type: test
- Goal: Lock behavior of guidance logic and avoid regressions.
- Acceptance Criteria:
- Automated tests cover at least 6 workflow states with expected command suggestions.
- Tests verify that forbidden transitions (e.g., execute before approve) are never recommended.
- Dependencies: BMAD-201-03, BMAD-201-04

## Epic 3: Quick Flow Hardening

### Story BMAD-201-06: Add Quick-Flow Scope Escalation Gate
- Type: feature
- Goal: Auto-detect when quick flow should escalate to full contract flow.
- Acceptance Criteria:
- Quick flow evaluates request complexity using measurable signals (file count estimate, cross-layer impact, risk keywords).
- When threshold is exceeded, CLI proposes `grabby task`/`grabby orchestrate` with explicit reason.
- User can still override with documented warning.
- Dependencies: BMAD-201-02

### Story BMAD-201-07: Add Adversarial Review Loop to Quick Dev
- Type: feature
- Goal: Import BMAD quick-dev review discipline before quick changes are considered done.
- Acceptance Criteria:
- Quick dev includes a mandatory self-check plus adversarial review step.
- Findings are classified by severity (`blocker`, `major`, `minor`) with clear remediation path.
- Workflow can loop back once remediation is requested.
- Dependencies: BMAD-201-06

### Story BMAD-201-08: Test Quick-Flow Escalation and Review Paths
- Type: test
- Goal: Prove quick-flow safety behavior.
- Acceptance Criteria:
- Tests cover bounded quick change, forced escalation, and review-loop scenarios.
- Regression test confirms quick flow remains fast for truly small changes.
- Dependencies: BMAD-201-06, BMAD-201-07

## Epic 4: Story and Sprint Cadence (Lightweight)

### Story BMAD-201-09: Introduce Optional Contract-Linked Sprint Status Artifact
- Type: feature
- Goal: Track sequencing/progress in a lightweight BMAD-inspired artifact.
- Acceptance Criteria:
- New artifact schema supports epic/task/story status at minimum.
- Artifact is optional and does not break existing contract-only workflows.
- `grabby` can render current status summary when artifact exists.
- Dependencies: BMAD-201-02

### Story BMAD-201-10: Add Story-Readiness Checklist Command
- Type: feature
- Goal: Add an implementation-readiness gate before coding steps.
- Acceptance Criteria:
- Command checks contract completeness, plan availability, and required test intent.
- Output is `PASS`, `CONCERNS`, or `FAIL` with actionable items.
- Gate integrates with existing approve/execute governance without bypasses.
- Dependencies: BMAD-201-09

## Epic 5: Verification Depth and Risk Tiers

### Story BMAD-201-11: Add Risk-Based Verification Tiers for Test Engineer
- Type: feature
- Goal: Move from single-level verification to tiered depth by risk.
- Acceptance Criteria:
- Verification tiers defined at least as `basic`, `standard`, `high-risk`.
- Tier selection uses contract risk signals and declared change type.
- Audit output includes tier and evidence summary.
- Dependencies: BMAD-201-02

### Story BMAD-201-12: Add Tier-Aware Verification Tests
- Type: test
- Goal: Validate that tier logic and evidence requirements are enforced.
- Acceptance Criteria:
- Tests verify tier selection deterministically for representative contract profiles.
- Tests verify missing required evidence yields non-pass result.
- Dependencies: BMAD-201-11

## Epic 6: Migration and Compatibility

### Story BMAD-201-13: Add Compatibility Flags for New BMAD-Derived Behaviors
- Type: feature
- Goal: Ship safely without breaking current Grabby users.
- Acceptance Criteria:
- New behaviors are controllable via config flags with documented defaults.
- Default behavior preserves current UX unless explicitly enabled.
- Dependencies: BMAD-201-03

### Story BMAD-201-14: Publish Migration Notes and Operator Guide
- Type: docs
- Goal: Make adoption understandable and reversible for maintainers.
- Acceptance Criteria:
- Docs include: feature flags, rollout order, rollback steps, and known tradeoffs.
- Docs map old behavior -> new behavior for each BMAD-derived import.
- Dependencies: BMAD-201-13

## Suggested Execution Order

1. BMAD-216 (import matrix and scoring rubric)
2. BMAD-211 (adaptive help routing)
3. BMAD-212 (quick-flow guardrails)
4. BMAD-215 (compatibility flags and upgrade docs)
5. BMAD-213 (lightweight sprint cadence)
6. BMAD-214 (risk-tiered verification)

## Priority Waves

- P0: BMAD-211, BMAD-212, BMAD-215
- P1: BMAD-213, BMAD-214
- P2: deferred ceremony expansions

## Explicit Non-Import Decisions
- Do not import full BMAD PRD/UX/enterprise document ceremony into default Grabby flow.
- Do not import BMAD module proliferation into Grabby core command surface.
- Keep Grabby contract governance as the primary gate model.
