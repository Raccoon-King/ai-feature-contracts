# FC: Harden API server with input validation, security, and performance fixes
**ID:** GRAB-306 | **Status:** complete

## Ticket
- Ticket ID: GRAB-306
- Who: Grabby operator
- What: Harden API server with input validation, security, and performance fixes
- Why: API lacks path traversal protection, input validation, and has O(n) contract lookup

**Data Change:** no
**API Change:** yes

## API Impact
- [ ] API surface changed: validation and safeguards only (no new endpoints)
- [ ] Backward compatibility preserved for existing valid requests
- [ ] Versioning/deprecation handling documented
- [ ] Rollback notes documented

Versioning/deprecation/compatibility handling: this is a non-breaking hardening release for existing endpoints; no deprecation required.
Rollback notes: revert API validation/path-security changes in `lib/api-server.cjs` and `lib/path-security.cjs` if clients encounter regressions.

## Objective
Secure and optimize the API server to prevent vulnerabilities and improve performance.

## Problem Statement
Current state:
- POST `/api/contracts` doesn't validate name length or format
- No file path traversal protection (could write outside contracts dir)
- `findContractByIdOrFile()` reads every file on disk (O(n))
- Rate limiting lost on restart (in-memory only)
- PUT doesn't validate content before writing
- DELETE has no confirmation safeguard
- No request size limits

## Scope
- lib/api-server.cjs
- lib/path-security.cjs (new)
- tests/api-server.test.js

## Non-Goals
- Authentication/authorization (out of scope)
- HTTPS/TLS configuration
- Rate limit persistence to disk

## Directories
**Allowed:** `lib`, `tests`
**Restricted:** `node_modules/`, `.git/`, `dist/`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | `lib/path-security.cjs` | Path validation and traversal prevention |
| modify | `lib/api-server.cjs` | Add input validation, contract ID cache, safeguards |
| modify | `tests/api-server.test.js` | Security and edge case tests |

## Security Requirements
| Vulnerability | Mitigation |
|---------------|------------|
| Path traversal | Validate paths resolve within contracts dir |
| Arbitrary file write | Reject paths with `..`, absolute paths |
| DoS via large payload | Add request body size limit (1MB) |
| Contract name injection | Validate name format (alphanumeric + dash) |

## API Validation Rules
```javascript
// Contract name: alphanumeric, dash, underscore only, max 100 chars
const NAME_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;

// Path must resolve within contracts directory
function isPathSafe(requestedPath, contractsDir) {
  const resolved = path.resolve(contractsDir, requestedPath);
  return resolved.startsWith(path.resolve(contractsDir));
}
```

## Performance Optimization
- Build in-memory contract ID index on startup
- Invalidate index on file changes (debounced)
- O(1) contract lookup by ID

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery
- Security: Run `npm audit` before adding packages

## Security Considerations
- [ ] Path traversal prevention implemented and tested
- [ ] Input validation for all POST/PUT endpoints
- [ ] Request body size limits enforced
- [ ] No secrets in code or test fixtures
- [ ] Dependencies remain CVE-free (`npm audit`)

## Code Quality
- [ ] TypeScript strict mode preserved (no `any`)
- [ ] JSDoc comments for security functions
- [ ] No console.log/debugger statements left behind
- [ ] Error handling matches existing project patterns

## Done When
- [ ] Path traversal attacks blocked (with tests)
- [ ] Contract name validation added
- [ ] Request body size limit enforced
- [ ] Contract ID lookup is O(1)
- [ ] Security edge cases tested
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes
- [ ] Build succeeds

## Testing
- Test path traversal attempts (../../../etc/passwd)
- Test invalid contract names
- Test oversized payloads
- Test concurrent contract operations
- Test ID index invalidation

## Context Refs
- ARCH_INDEX_v1
- RULESET_CORE_v1
