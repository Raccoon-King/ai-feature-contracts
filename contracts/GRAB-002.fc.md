# Feature Contract: AI-Powered Baseline Contracts
**ID:** GRAB-002 | **Status:** approved
CONTRACT_TYPE: FEATURE_CONTRACT
ARCH_VERSION: v1
RULESET_VERSION: v1
ENV_VERSION: v1

## Objective
Extend `grabby init` so a fresh project can generate baseline feature contracts from an AI-assisted project assessment without overwriting existing contract artifacts.

## Scope
- Update the `grabby init` workflow to run a project assessment after initializing core Grabby files
- Reuse `lib/ai-complete.cjs` or add a dedicated assessment helper for project structure and stack detection
- Generate `contracts/SYSTEM-BASELINE.fc.md` when it does not already exist
- Generate one or more initial project baseline contracts in `contracts/` based on detected project structure
- Update the `contracts/README.md` bootstrap content so baseline contracts are documented for initialized projects
- Add automated tests for the init flow and assessment-driven contract generation behavior

## Non-Goals
- Overwrite an existing baseline contract without an explicit confirmation path
- Automatically approve, plan, or execute generated baseline contracts
- Add network-only behavior that makes `grabby init` fail in offline environments
- Expand contract generation beyond `grabby init`

## Directories
**Allowed:** `lib/`, `bin/`, `templates/`, `tests/`
**Restricted:** `node_modules/`, `.git/`, `coverage/`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | `lib/commands.cjs` | Trigger project assessment and baseline contract generation from `grabby init` |
| modify | `lib/ai-complete.cjs` | Reuse or extend AI helpers for project assessment and baseline content generation |
| create | `lib/assessment.cjs` | Isolate repository scanning, tech stack detection, and baseline contract assembly if needed |
| create | `templates/system-baseline.md` | Provide a stable template for the generated system baseline contract |
| modify | `tests/commands.test.js` | Cover init behavior and generated baseline contract artifacts |
| modify | `tests/ai-complete.test.js` | Cover assessment helper behavior or AI prompt generation changes |

## Dependencies
- Existing runtime: Node.js `fs`, `path`, and current Grabby CLI infrastructure
- Existing tests: `jest@29.7.0`
- No new runtime dependency unless required to support deterministic project-structure detection

## Security Considerations
- [ ] Generated contracts must never include secrets, tokens, or environment variable values from the scanned project
- [ ] `grabby init` must only write generated artifacts inside the initialized repository's `contracts/` directory
- [ ] Existing contracts must be preserved unless the user explicitly confirms replacement behavior
- [ ] Assessment prompts or fallbacks must tolerate offline or missing-provider environments without unsafe failures

## Done When
- [ ] `grabby init` performs a project assessment step after creating core Grabby bootstrap files
- [ ] `contracts/SYSTEM-BASELINE.fc.md` is created when missing and preserved when already present
- [ ] At least one project baseline contract is generated in `contracts/` using detected repository structure
- [ ] Generated baseline contracts describe the detected stack or project shape with repository-specific scope
- [ ] `contracts/README.md` created by `grabby init` documents baseline contract generation
- [ ] Automated tests cover the init path and generated artifact behavior
- [ ] `npm test` passes with repository coverage thresholds: 80% lines, 80% functions, 80% statements, 70% branches
- [ ] `npm run lint` passes or the repository's current no-op lint contract remains unchanged
- [ ] `npm audit` shows no new high or critical findings introduced by this change

## Testing
- Unit: extend `tests/ai-complete.test.js` and related assessment coverage for stack detection and prompt assembly
- Integration: extend `tests/commands.test.js` to verify `grabby init` creates expected baseline contract artifacts
- Manual: run `node bin/index.cjs init` in a disposable fixture project and verify baseline contract generation without overwriting existing files

## Code Quality
- [ ] Keep baseline generation deterministic enough for stable automated tests
- [ ] Prefer small helper functions over expanding `init` into a monolithic flow
- [ ] Surface user-facing logging for skipped versus created baseline contracts

## Context Refs
- ARCH: stack@v1
- RULESET: imports@v1
- ENV: test-runner@v1

## Risk Assessment
| Risk | Mitigation |
|------|------------|
| AI provider unavailable during `init` | Provide deterministic fallback generation based on repository scanning |
| Generated contracts do not match repository shape | Keep assessment grounded in local file-system signals and test representative fixtures |
| `init` becomes noisy or slow | Limit scanning scope and log only major generation events |
