# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.2.1] - 2026-03-13

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

[Unreleased]: https://github.com/Raccoon-King/ai-feature-contracts/compare/v2.2.1...HEAD
[2.2.1]: https://github.com/Raccoon-King/ai-feature-contracts/compare/v2.2.0...v2.2.1
[2.2.0]: https://github.com/Raccoon-King/ai-feature-contracts/compare/v2.1.1...v2.2.0
[2.1.1]: https://github.com/Raccoon-King/ai-feature-contracts/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/Raccoon-King/ai-feature-contracts/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/Raccoon-King/ai-feature-contracts/releases/tag/v2.0.0
