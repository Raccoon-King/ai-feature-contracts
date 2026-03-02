# Agent Instructions

This repository uses Grabby for request intake, contract governance, planning, execution, and audit.

For Codex-specific guidance, use:
- [.codex/rules/grabby.md](C:/Users/jesse/ai-feature-contracts/.codex/rules/grabby.md)

## Default Workflow

1. `grabby list`
2. `grabby ticket "request"` if the request is not already a complete ticket
3. `grabby task "request"` or `grabby orchestrate "request"`
4. `grabby validate <file>`
5. `grabby plan <file>`
6. `grabby approve <file>`
7. `grabby execute <file>`
8. Implement only within approved scope
9. `grabby audit <file>`

## Canonical Artifacts

- `contracts/<ID>.fc.md`
- `contracts/<ID>.plan.yaml`
- `contracts/<ID>.audit.md`

Standalone ticket markdown files are deprecated. Use the feature contract as the canonical repo artifact.
