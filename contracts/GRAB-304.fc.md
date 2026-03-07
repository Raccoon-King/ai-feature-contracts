# FC: Extract filesystem abstraction layer with centralized error handling
**ID:** GRAB-304 | **Status:** complete

## Ticket
- Ticket ID: GRAB-304
- Who: Grabby developer
- What: Extract filesystem abstraction layer with centralized error handling
- Why: 496 sync I/O operations scattered across 36+ files with inconsistent error handling cause silent failures and poor UX

**Data Change:** no
**API Change:** no

## Objective
Create a centralized filesystem abstraction that provides consistent error handling, recovery patterns, and testability across all I/O operations.

## Problem Statement
Current state:
- `fs.readFileSync`, `fs.writeFileSync`, `fs.existsSync` scattered everywhere
- Some operations have try-catch, others don't
- Error messages lack context (which file? what operation?)
- Race conditions possible on concurrent file operations
- Hard to mock/test file operations in isolation

## Scope
- lib/fs-utils.cjs (new)
- lib/core.cjs
- lib/commands.cjs
- lib/config.cjs
- lib/api-server.cjs
- tests/fs-utils.test.js (new)

## Non-Goals
- Async I/O migration (keep sync for now)
- File watching/events
- Network I/O

## Directories
**Allowed:** `lib`, `tests`
**Restricted:** `node_modules/`, `.git/`, `dist/`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | `lib/fs-utils.cjs` | Centralized file system utilities |
| modify | `lib/core.cjs` | Replace direct fs calls with fs-utils |
| modify | `lib/commands.cjs` | Replace direct fs calls with fs-utils |
| modify | `lib/config.cjs` | Replace direct fs calls with fs-utils |
| modify | `lib/api-server.cjs` | Replace direct fs calls with fs-utils |
| create | `tests/fs-utils.test.js` | Unit tests for fs-utils |

## API Design
```javascript
// lib/fs-utils.cjs exports:
readFileSync(path, { encoding, fallback, context })  // returns { ok, data, error }
writeFileSync(path, data, { context, backup })       // returns { ok, error }
existsSync(path)                                      // returns boolean
ensureDir(path)                                       // creates recursively, returns { ok, error }
readYamlFile(path, { fallback })                     // parse + error context
readJsonFile(path, { fallback })                     // parse + error context
resolveContractPath(idOrFile)                        // centralized resolution
```

## Dependencies
- Allowed: existing packages only (fs, path, yaml)
- Banned: moment, lodash, jquery
- Security: Run `npm audit` before adding packages

## Security Considerations
- [ ] Path traversal prevention in all file operations
- [ ] No secrets in code or test fixtures
- [ ] Validate paths are within allowed directories
- [ ] Dependencies remain CVE-free (`npm audit`)

## Data Impact
- [ ] Data model/schema changes required: No
- [ ] Migration required: No
- [ ] Backfill required: No
- [ ] Rollback notes documented

Rollback notes: revert migrated callers and remove `lib/fs-utils.cjs` if needed to return to prior direct `fs` usage.

## Code Quality
- [ ] TypeScript strict mode preserved (no `any`)
- [ ] JSDoc comments for all public functions
- [ ] No console.log/debugger statements left behind
- [ ] Error handling matches existing project patterns

## Done When
- [ ] fs-utils.cjs created with all utilities
- [ ] At least 5 high-traffic files migrated to use fs-utils
- [ ] Error messages include file path and operation context
- [ ] Tests pass (80%+ coverage on fs-utils)
- [ ] Lint passes
- [ ] Build succeeds

## Testing
- Test all fs-utils functions with success/failure cases
- Test error context propagation
- Test fallback behavior
- Mock fs for isolation

## Context Refs
- ARCH_INDEX_v1
- RULESET_CORE_v1
