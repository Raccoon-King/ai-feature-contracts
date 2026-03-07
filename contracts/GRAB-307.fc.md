# FC: Extract reusable I/O and parsing utilities to reduce duplication
**ID:** GRAB-307 | **Status:** complete

## Ticket
- Ticket ID: GRAB-307
- Who: Grabby developer
- What: Extract reusable I/O and parsing utilities to reduce duplication
- Why: Same patterns duplicated 15+ times across 20+ files violates DRY principle

**Data Change:** yes
**API Change:** no

## Data Impact
- [ ] Data model/schema changes required: No
- [ ] Migration required: No
- [ ] Backfill required: No
- [ ] Rollback notes documented

Rollback notes: revert `io-utils`/`parsing-utils` usage and return migrated callers to previous in-file parsing/I/O logic.

## Objective
Consolidate duplicated I/O and parsing patterns into reusable utilities, reducing code duplication by 300+ lines.

## Problem Statement
Current state:
- Config loading pattern repeated in 6+ files
- "Read → parse YAML/JSON → handle missing → return" duplicated 15+ times
- Contract resolution logic duplicated (commands.cjs, jira.cjs, api-server.cjs)
- ID extraction regex patterns duplicated across files
- Directory creation with error handling duplicated

## Scope
- lib/io-utils.cjs (new)
- lib/parsing-utils.cjs (new)
- lib/commands.cjs (migration)
- lib/jira.cjs (migration)
- lib/api-server.cjs (migration)
- tests/io-parsing-utils.test.js (new, combined test file)

## Non-Goals
- Refactoring all files at once (phased approach)
- Breaking API changes
- New dependencies

## Directories
**Allowed:** `lib`, `tests`
**Restricted:** `node_modules/`, `.git/`, `dist/`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | `lib/io-utils.cjs` | High-level I/O utilities (config loading, contract reading) |
| create | `lib/parsing-utils.cjs` | Markdown/YAML parsing, ID extraction, regex patterns |
| modify | `lib/commands.cjs` | Use new utilities |
| modify | `lib/jira.cjs` | Use new utilities |
| modify | `lib/api-server.cjs` | Use new utilities |
| create | `tests/io-parsing-utils.test.js` | Combined unit tests for both utilities |

## Utility APIs
```javascript
// lib/io-utils.cjs
loadConfig(projectRoot)                    // Load and merge config with defaults
loadContract(pathOrId, contractsDir)       // Read and parse contract markdown
saveContract(contract, path)               // Serialize and write contract
listContracts(contractsDir, { status })    // List contracts with optional filter

// lib/parsing-utils.cjs
extractContractId(markdown)                // Extract ID from contract markdown
extractSections(markdown)                  // Parse markdown into sections map
extractFrontmatter(markdown)               // Extract YAML frontmatter
parseTicketLine(line)                      // Parse "- Key: Value" format
ID_PATTERN                                 // Exported regex for contract IDs
```

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery
- Security: Run `npm audit` before adding packages
- Depends on: GRAB-304 (fs-utils)

## Security Considerations
- [ ] No secrets in code or test fixtures
- [ ] Path validation for contract operations
- [ ] Dependencies remain CVE-free (`npm audit`)

## Code Quality
- [ ] TypeScript strict mode preserved (no `any`)
- [ ] JSDoc comments for all public functions
- [ ] No console.log/debugger statements left behind
- [ ] Error handling matches existing project patterns

## Done When
- [ ] io-utils.cjs created with config/contract utilities
- [ ] parsing-utils.cjs created with extraction utilities
- [ ] At least 3 files migrated to use new utilities
- [ ] Duplicated code reduced by 100+ lines
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes
- [ ] Build succeeds

## Testing
- Test config loading with defaults, overrides, missing
- Test contract loading with valid, invalid, missing
- Test ID/section extraction edge cases

## Context Refs
- ARCH_INDEX_v1
- RULESET_CORE_v1
