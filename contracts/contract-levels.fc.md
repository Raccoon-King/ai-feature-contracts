# Feature Contract: Contract Level System

**ID:** FC-003
**Status:** completed
**Created:** 2026-03-01
**Author:** Developer

## Objective

Add support for system-level (global) and project-level contracts, allowing developers to define universal rules that apply across all projects while maintaining project-specific architecture contracts.

## Summary

Developers need consistent coding standards, security requirements, and workflow rules across all their projects. Currently, contracts are only project-scoped. This feature adds:
- **System contracts** - Global rules stored in `~/.grabby/contracts/` that apply everywhere
- **Project contracts** - Project-specific architecture in `./contracts/`
- **Smart detection** - Grabby asks when context is ambiguous

## Problem Statement

- Repeating the same security/quality rules in every project is tedious
- No way to enforce consistent standards across multiple projects
- Unclear whether a new contract should be global or project-specific

## Scope

- Global contract storage in user home directory (`~/.grabby/`)
- Contract type classification: `system` vs `project`
- Merged contract context during validation/execution
- Interactive prompt when contract type is ambiguous
- Commands to manage system-level contracts
- Inheritance/override system (project can override system rules)

## Non-Goals

- Team-shared contracts (future: requires server)
- Contract versioning/history
- Automatic sync between machines

## Files

**Create:**
- `lib/contract-levels.cjs` - System/project contract management
- `tests/contract-levels.test.cjs` - Unit tests

**Modify:**
- `bin/index.cjs` - Add system contract commands
- `lib/core.cjs` - Integrate contract levels into validation
- `lib/commands.cjs` - Update command handlers

## Directories

**Allowed:** `lib/`, `bin/`, `tests/`
**Restricted:** `node_modules/`, `.env`

## Context

- `lib/core.cjs` - Existing validation logic
- `lib/features.cjs` - Pattern for global storage

## Dependencies

- No new dependencies

## Security Considerations

- System contracts stored in user home with appropriate permissions
- No execution of contract content (contracts are documentation)
- Path traversal prevention for contract paths

## Testing

- Unit tests for contract level detection
- Unit tests for contract merging
- Integration tests for CLI commands
- Test system + project contract interaction

## Done When

- [ ] `grabby system init` creates ~/.grabby/ structure
- [ ] `grabby system list` shows system-level contracts
- [ ] `grabby system add <file>` adds contract to system level
- [ ] `grabby create` asks "System or Project level?" when ambiguous
- [ ] Validation includes both system and project contracts
- [ ] Project contracts can override system contract rules
- [ ] `grabby contracts` shows merged view (system + project)
- [ ] 80%+ test coverage
- [ ] ESLint passes

## Technical Design

### Directory Structure
```
~/.grabby/
├── config.yaml           # Global Grabby config
├── contracts/            # System-level contracts
│   ├── security.fc.md    # Security standards
│   ├── quality.fc.md     # Code quality rules
│   └── workflow.fc.md    # Dev workflow rules
└── templates/            # Contract templates

./project/
├── .grabby/              # Project Grabby data
├── contracts/            # Project-level contracts
│   └── feature-x.fc.md
```

### Contract Type Detection
```yaml
# In contract frontmatter
**Level:** system  # or "project"
```

### Merge Strategy
1. Load system contracts first
2. Load project contracts
3. Project rules override system rules (same section)
4. Validation runs against merged ruleset

### Ambiguity Detection
Ask user when:
- Contract mentions "all projects" or "every project"
- Contract is about standards/conventions (not features)
- Contract has no project-specific paths

## Code Quality

- [ ] No `any` types
- [ ] Functions < 50 lines
- [ ] No console.log in production
- [ ] Proper error handling
