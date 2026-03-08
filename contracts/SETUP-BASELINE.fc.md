# Feature Contract: Setup Validation and Project Index Baseline
**ID:** SETUP-BASELINE | **Status:** complete
CONTRACT_TYPE: FEATURE_CONTRACT
ARCH_VERSION: v1
RULESET_VERSION: v1
ENV_VERSION: v1

## Objective
Define the deterministic setup validation and repository indexing procedure that any LLM must follow after `grabby init` so governed workflows start from a known-good baseline.

## Scope
- Verify required setup artifacts exist and are readable for this repository
- Verify CI/CD setup status and capture missing automation artifacts
- Build and refresh a project index snapshot grounded in current repository signals
- Produce a remediation checklist when setup gaps are detected

## Non-Goals
- Directly implement feature code outside setup/index governance artifacts
- Skip or bypass Grabby lifecycle gates
- Infer private runtime values or secrets from local environments

## Directories
**Allowed:** `lib/`, `hooks/`, `tests/`, `contracts/`, `.grabby/`, `.github/`, `docs/`
**Restricted:** `node_modules/`, `.git/`, `.env*`, `coverage/`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | `contracts/SETUP-BASELINE.fc.md` | Seed deterministic setup-validation instructions for any LLM |
| modify | `contracts/SETUP-BASELINE.fc.md` | Refine setup checks for repository-specific requirements |
| modify | `.grabby/project-context.json` | Refresh the indexed project context after setup validation |
| modify | `contracts/README.md` | Keep baseline guidance aligned with setup-validation workflow |

## Dependencies
- Detected stack: react, node
- Required setup commands: `grabby init`, `grabby cicd`, `grabby cicd --setup`
- Test signal scripts: test, test:coverage, test:watch

## Security Considerations
- [ ] Setup validation confirms baseline artifacts contain no secrets
- [ ] Restricted directories remain excluded from setup/index automation
- [ ] Remediation outputs avoid exposing sensitive local environment details

## Done When
- [ ] Required setup artifacts are validated: `.grabby/governance.lock`, `grabby.config.json`, `.grabby/config.json`, `contracts/SYSTEM-BASELINE.fc.md`, `contracts/PROJECT-BASELINE.fc.md`, `contracts/SETUP-BASELINE.fc.md`, `.grabby/project-context.json`
- [ ] CI/CD status is checked and missing artifacts are either generated or explicitly documented
- [ ] Project indexing signals (stack, directories, testing, plugins) are refreshed and traceable
- [ ] Any LLM can execute the same setup-validation sequence without improvisation

## Testing
- Run `grabby validate SETUP-BASELINE.fc.md`
- Run `grabby cicd` and confirm setup status output is captured
- Confirm `.grabby/project-context.json` reflects current repository structure after validation

## Feature Assessment Rules
- Score feature complexity using Fibonacci points only: `0.5`, `1`, `2`, `3`, `5`, `8`, `13`
- Estimate implementation time using these buckets only: `0.5 day`, `1 day`, `3 days`, `5 days`, `2 weeks`
- If time estimate is over `5 days` or complexity score is `13`, mark the feature for breakdown and require subtasks before implementation

## Post-Feature Ticket Format
- Feature ID
- Feature summary
- Complexity score (Fibonacci)
- Time estimate bucket
- Breakdown decision (required/not required)
- Subtasks list (required for complexity `13` or time > `5 days`)
- Validation results (tests/lint/audit)
- Follow-up risks or next actions

## LLM Setup Protocol
1. Read `contracts/SYSTEM-BASELINE.fc.md` and `contracts/PROJECT-BASELINE.fc.md` first.
2. Validate required setup artifacts listed in Done When.
3. Run CI/CD setup checks and generate missing files with `grabby cicd --setup` if needed.
4. Refresh and review `.grabby/project-context.json` as the canonical index artifact.
5. Record unresolved setup gaps before any post-setup feature work.

## Context Refs
- ARCH: setup-validation@v1
- RULESET: baseline-governance@v1
- ENV: local-repo-index@v1

## Status Notes
- Assessment summary: React application detected from local repository structure. Primary working areas include lib, hooks, tests. Testing signals are present in the repository.
- Baseline stack profile: React application
