# SHARED RULESET: Shared Project Rules

## Purpose
- Define reusable project standards for consistent governance
- Serve as the single source of truth for engineering rules

## Standards
- Keep changes scoped and test-backed
- Follow existing architecture and naming conventions
- Prefer guided setup flows over ad hoc flags
- Document breaking changes and migration paths

## Quality Gates
- Require tests for behavior changes
- Require lint/build checks to pass
- Avoid hidden scope expansion
- Maintain backward compatibility when possible

## Security Requirements
- Validate all user input
- Escape output appropriately
- Use parameterized queries (no SQL injection)
- Store no secrets in code
- Pass npm audit with no high/critical vulnerabilities

## Non-Goals
- No unrelated refactors during feature work
- No undocumented workflow drift
- No automatic pushing to remote repositories

## Source References
- README.md
- docs/AGENT_ARCHITECTURE.md
- docs/AGENT_PROMPT_EVALUATION.md
- docs/AGENT_RUNTIME_MIGRATION_PLAN.md
- docs/API.md
- docs/ARCHITECTURE_INDEX.md
- docs/BEST_PRACTICES.md
- docs/BMAD_UPGRADE.md
- docs/BRAND_STYLE_GUIDE.md
- docs/context-index.yaml
- docs/CONTRACTS.md
- docs/CONTRACT_SYNC.md
- docs/ENV_STACK.md
- docs/EXECUTION_PROTOCOL.md
- docs/GITLAB_TEMPLATE.md
- docs/grabby-calculator-regression-report.md
- docs/jira-integration-roadmap.md
- docs/LLM_INSTALL.md
- docs/openapi.yaml
- docs/PRE-OP-SUMMARY.md
- docs/QUICKSTART.md
- docs/REST_API_INVESTIGATION.md
- docs/RULESET_API_COMPAT.md
- docs/RULESET_CORE.md
- docs/RULESET_DB_SAFETY.md
- docs/RULESET_FE_DEPS.md
- docs/RULESET_GIT_WORKFLOW.md
- docs/RULES_CLI.md
- docs/SECURITY.md
- .clinerules/00-grabby-core.md
- .clinerules/90-local-overrides.md
- .continue/rules/00-grabby-core.md
- .continue/rules/90-local-overrides.md
- .continue/rules/grabby.md
- AGENTS.md

---
Generated: 2026-03-21T20:02:15.666Z
