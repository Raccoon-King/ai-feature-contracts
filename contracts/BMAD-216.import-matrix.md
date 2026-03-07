# BMAD-216 Import Matrix

## Purpose
Map BMAD capabilities to Grabby equivalents and make explicit adopt/adapt/defer/reject decisions.

## Decision Legend
- `adopt`: bring logic in with minimal adaptation.
- `adapt`: keep intent but fit Grabby governance and UX.
- `defer`: not now; reevaluate after earlier imports stabilize.
- `reject`: intentionally excluded from Grabby core.

| Capability | BMAD Source | Grabby Current | Decision | Rationale |
|---|---|---|---|---|
| Adaptive next-step guidance | `core/tasks/help.md` and module catalogs | Static `help` command text | adapt | High value routing lift; keep Grabby command model and governance gates. |
| Workflow/command discovery by stage | `bmad-help` dynamic recommendations | Static command list | adapt | Low-medium complexity, strong UX improvement in brownfield repos. |
| Quick-flow escalation gate | quick-dev mode detection + escalation | bounded quick flow with limited guardrails | adopt | Prevents misuse of quick flow for high-risk changes. |
| Adversarial review loop in quick flow | quick-dev self-check + review loop | minimal quick dev output | adapt | Keep single-loop lightweight version in Grabby. |
| Sprint/story status artifact | sprint-status workflow | no optional status artifact | adapt | Useful cadence support, must remain optional and non-blocking. |
| Implementation readiness gate | check-implementation-readiness | validate/plan/approve exists, no explicit readiness score output | adapt | Add lightweight PASS/CONCERNS/FAIL gate without adding ceremony debt. |
| Risk-tiered verification | QA/TEA style risk depth | single test-engineer flow | adopt | Better audit confidence for high-risk work. |
| Compatibility-first rollout | module install/upgrade docs culture | no BMAD-specific compatibility flags | adopt | Needed to safely ship behavior changes. |
| Full PRD workflow | create-prd/validate/edit-prd | contract-centric intake | reject | Conflicts with Grabby's compact contract-first positioning. |
| Full UX design workflow | create-ux-design | no dedicated UX workflow | reject | Out of scope for Grabby core CLI. |
| Full epics/stories ceremony | create-epics-and-stories | backlog command exists | defer | Revisit after cadence + readiness features land. |
| Full scrum retrospective cycle | retrospective workflow | no retrospective workflow | defer | Valuable later; not required for immediate reliability improvements. |

## Required Guards For Imported Logic
- Preserve `validate -> plan -> approve -> execute -> audit` gate order.
- Do not bypass plan-scoped file enforcement.
- Keep defaults backward-compatible where behavior changes are user-facing.

