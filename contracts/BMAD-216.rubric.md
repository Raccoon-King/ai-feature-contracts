# BMAD-216 High-Value Import Rubric

## Scoring Model
Each candidate is scored 1-5 on four dimensions:

- `Impact`: expected reduction in rework/confusion and improvement in success rate.
- `Cost`: implementation + test complexity (higher score means lower cost).
- `Governance Fit`: alignment with Grabby contract gates.
- `Maintenance`: long-term complexity and operational burden (higher score means lower burden).

Weighted score:

`total = Impact * 0.40 + Cost * 0.20 + Governance Fit * 0.25 + Maintenance * 0.15`

Priority bands:
- `P0`: total >= 4.0
- `P1`: total >= 3.2 and < 4.0
- `P2`: total < 3.2

## Candidate Scoring

| Candidate | Impact | Cost | Governance Fit | Maintenance | Total | Priority | Decision |
|---|---:|---:|---:|---:|---:|---|---|
| Adaptive help routing | 5 | 4 | 5 | 4 | 4.65 | P0 | adapt |
| Quick-flow escalation guard | 5 | 4 | 5 | 4 | 4.65 | P0 | adopt |
| Quick-flow adversarial loop | 4 | 3 | 4 | 3 | 3.65 | P1 | adapt |
| Optional sprint/status artifact | 3 | 3 | 4 | 4 | 3.40 | P1 | adapt |
| Readiness PASS/CONCERNS/FAIL gate | 4 | 3 | 5 | 4 | 4.00 | P0 | adapt |
| Risk-tiered verification | 4 | 3 | 5 | 3 | 3.85 | P1 | adopt |
| Compatibility flags + upgrade docs | 5 | 4 | 5 | 4 | 4.65 | P0 | adopt |
| Full PRD/UX/ceremony parity | 2 | 1 | 2 | 1 | 1.65 | P2 | reject |

## Recommended Execution Waves

### Wave 1 (P0)
1. Adaptive help routing (`BMAD-211`)
2. Quick-flow escalation guard + baseline review loop (`BMAD-212`)
3. Compatibility flags and upgrade docs (`BMAD-215`)

### Wave 2 (P1)
1. Optional sprint/status + readiness result output (`BMAD-213`)
2. Risk-tiered verification (`BMAD-214`)

### Wave 3 (defer/revisit)
1. Broader cadence and ceremony additions beyond current contract model

## Guardrails
- Ship user-visible behavior changes behind config flags.
- Keep quick-flow latency low for bounded changes.
- Require tests for new routing and threshold logic.

