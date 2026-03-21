# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [4.0.1] - 2026-03-21

### Added
- **Runtime-Driven Agent Architecture Documentation**
  - `docs/AGENT_PROMPT_EVALUATION.md` - Current state analysis and gap analysis
  - `docs/AGENT_RUNTIME_MIGRATION_PLAN.md` - Phased migration plan with pilot selection
  - `templates/agent-runtime-contract.example.yaml` - Example runtime-oriented contract
  - `templates/agent-runtime-minimal-prompt.md` - Before/after prompt comparison
- Four-layer architecture sections added to key docs (AGENT_ARCHITECTURE, CONTRACTS, EXECUTION_PROTOCOL, LLM_INSTALL)
- Documentation consistency tests for runtime-driven model terminology

### Fixed
- Test files now use Jest syntax (`beforeAll`) instead of Mocha (`before`)
- Cleaned up stale contract artifacts from previous releases

## [4.0.0] - 2026-03-21

### Added
- **Shared Rules Authoring**: Dedicated flow for generating and updating protected shared project rules
  - `grabby rules generate` - Generate shared rules from repository guidance (AGENTS.md, docs/, etc.)
  - `grabby rules update` - Update existing shared rulesets in place
  - `grabby rules shared` - List shared rulesets in protected path
- **Protected Path Model**: Shared rules stored in `.grabby/rulesets/shared/` are write-protected
  - Normal Grabby operations (task, execute, audit) cannot write to this path
  - Only explicit authoring commands can modify shared rules
  - Manual file edits outside Grabby remain permitted
- New `lib/rules-authoring.cjs` module with:
  - Authoring context management for write boundary enforcement
  - Guidance file discovery from configurable sources
  - LLM-powered rule generation with fallback templates
- Configuration: `rulesets.authoring` section in grabby.config.json
  - `enabled` - Enable/disable authoring commands
  - `protectedPath` - Configurable protected directory
  - `guidanceSources` - Files to scan for guidance
- TUI menu options for shared rules authoring in Rulesets menu
- Comprehensive test suite for rules-authoring module (89%+ coverage)
- Documentation: Extended `docs/RULES_CLI.md` with authoring commands section

### Changed
- **BREAKING**: Protected path writes blocked during contract execution
- Plan phase now warns when files target protected shared rules path
- Execute phase blocks if plan targets protected shared rules path
- Rules CLI help updated with authoring commands section

### Security
- Protected path checks prevent accidental writes outside intended shared rules location
- Authoring commands validate target paths and reject traversal

## [3.5.0] - 2026-03-17

### Added
- **Pre-Op Summary**: Formatted contract summary box displayed during ticket creation
- `formatContractSummaryBox()` in tui.cjs - renders rounded Unicode box for contract summaries
- `buildPreOpSummary()` and `savePreOpSummary()` in interactive-workflows.cjs
- Pre-commit hook displays pre-op summary before commits for active contracts
- Pre-op summaries saved to `.grabby/pre-ops/` for hook access
- Documentation: `docs/PRE-OP-SUMMARY.md` with full API reference

### Changed
- Pre-commit hook now shows contract summary box before allowing commits
- README updated with Pre-Op Summary section

### Fixed
- Variable naming conflicts in interactive-workflows.cjs (`contractContent` → `preOpContractContent`)

### Removed
- Cleaned up orphaned metrics files (61 files)
- Removed legacy `.clinerules.legacy.md`
- Removed nested `.claude/.claude/` duplicate directory
- Removed temp file `.tmp_head_bin.txt`

### Improved
- Added `coverage/`, `tmp-calc-cli/`, `.grabby/metrics/` to `.gitignore`

## [3.4.0] - 2026-03-15

### Added
- Calculator CLI test app for full Grabby workflow validation
- Archived plan YAML preservation in `.grabby/history/` during GC compaction
- Unit tests for calculator module with 80%+ coverage
- E2E tests for calculator CLI user flow
- Test helper utilities for CLI spawn support

### Changed
- **BREAKING**: GC compaction behavior now preserves plan YAML, deletes all other artifacts
- Metrics extraction uses `extractContractId` for robust ID parsing
- `feature gc archive` and `feature close` allowed in `externalLlmOnly` mode
- Added `.backlog.yaml` and `.prompt.md` to artifact cleanup list

### Fixed
- GC archive preserves execution context by archiving plan YAML
- Defensive check in `addToHistory` prevents crash on malformed history files
- Metrics gracefully handles malformed contracts during ID extraction

## [2.3.13] - 2026-03-15

### Fixed
- GC archive now preserves plan YAML to `.grabby/history/` instead of deleting it
- Added `.backlog.yaml` and `.prompt.md` to `ARCHIVABLE_ARTIFACT_SUFFIXES` for proper cleanup
- `feature gc archive` and `feature close` now allowed in `externalLlmOnly` mode (cleanup ops, not LLM execution)
- Defensive check in `addToHistory` prevents crash on malformed history files
- Agent name resolution now uses kebab-case IDs from filenames (e.g., `contract-architect` not `archie`)

### Changed
- GC compaction now: archives plan YAML, deletes all other artifacts (contract, backlog, prompt, audit)

## [2.3.9] - 2026-03-14

### Added
- Calculator web app integration test for end-to-end workflow validation
- Cloudflare Workers deployment configuration (`wrangler.jsonc`)
- Deploy and preview npm scripts for Cloudflare deployment

### Fixed
- Test isolation for help output when `externalLlmOnly` config is present

## [2.3.8] - 2026-03-13

### Changed
- Version bump for release

## [2.3.3] - 2026-03-13

### Changed
- Minor fixes and stability improvements

## [2.3.2] - 2026-03-13

### Changed
- Documentation updates

## [2.3.1] - 2026-03-13

### Added
- `LICENSE` file (MIT)
- `.gitattributes` for consistent line-ending normalization (LF)
- `.editorconfig` for consistent editor settings across contributors
- `CONTRIBUTING.md` with full contribution guide and contract workflow
- `CHANGELOG.md` (this file)
- GitHub issue templates: Bug Report and Feature Request

### Changed
- `package.json`: files list now includes `LICENSE` and `CONTRIBUTING.md`

## [2.2.0] - 2026-03-13

### Added
- `grabby orchestrate` full persona handoff (Archie → Val → Sage → Dev → Iris)
- `grabby agent architect CC` interactive contract creation
- `grabby party` team workflow overview
- `grabby init-hooks` git hook installer with optional `GRABBY_STRICT` mode
- Docs + website audit artifact on release tags
- CI: sync website repo on release tags

### Changed
- Token-efficiency improvements across all contract templates
- Version bump to 2.2.0

## [2.1.1] - 2025-01-01

### Fixed
- Aligned default context expectation with system references in tests

## [2.1.0] - 2025-01-01

### Added
- `grabby task` interview-driven task breakdown with auto persona routing
- `grabby quick` spec generator for small changes (< 3 files)
- `grabby validate`, `grabby plan`, `grabby backlog`, `grabby approve`, `grabby execute`, `grabby audit` pipeline

## [2.0.0] - 2024-01-01

### Added
- Initial 2.x release
- Token-efficient feature contract system
- Multi-AI-agent support (Claude Code, Cline, Codex, Continue)

[Unreleased]: https://github.com/Raccoon-King/ai-feature-contracts/compare/v2.3.9...HEAD
[2.3.9]: https://github.com/Raccoon-King/ai-feature-contracts/compare/v2.3.8...v2.3.9
[2.3.8]: https://github.com/Raccoon-King/ai-feature-contracts/compare/v2.3.3...v2.3.8
[2.3.3]: https://github.com/Raccoon-King/ai-feature-contracts/compare/v2.3.2...v2.3.3
[2.3.2]: https://github.com/Raccoon-King/ai-feature-contracts/compare/v2.3.1...v2.3.2
[2.3.1]: https://github.com/Raccoon-King/ai-feature-contracts/compare/v2.2.0...v2.3.1
[2.2.0]: https://github.com/Raccoon-King/ai-feature-contracts/compare/v2.1.1...v2.2.0
[2.1.1]: https://github.com/Raccoon-King/ai-feature-contracts/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/Raccoon-King/ai-feature-contracts/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/Raccoon-King/ai-feature-contracts/releases/tag/v2.0.0
