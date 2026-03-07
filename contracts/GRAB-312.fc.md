# FC: Create error handling framework with structured context
**ID:** GRAB-312 | **Status:** complete

## Ticket
- Ticket ID: GRAB-312
- Who: Grabby developer
- What: Create error handling framework with structured context
- Why: Inconsistent error patterns make debugging difficult and UX poor

## Objective
Establish consistent error handling with typed errors, context chains, and structured logging.

## Problem Statement
Current state:
- 5 occurrences of `throw new Error()` in core.cjs, inconsistent elsewhere
- Some functions throw, others return error objects, others fail silently
- Error messages lack context (which file? which operation? which step?)
- No centralized error handler or error type hierarchy
- No structured logging for debugging failures

## Scope
- lib/errors.cjs (new)
- lib/logger.cjs (new)
- lib/core.cjs
- lib/commands.cjs
- lib/api-server.cjs
- tests/errors.test.js (new)

## Non-Goals
- External logging library
- Error telemetry/reporting service
- Breaking changes to existing public APIs

## Directories
**Allowed:** `lib`, `tests`
**Restricted:** `node_modules/`, `.git/`, `dist/`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | `lib/errors.cjs` | Error types and context builder |
| create | `lib/logger.cjs` | Structured logging utility |
| modify | `lib/core.cjs` | Use typed errors |
| modify | `lib/commands.cjs` | Use typed errors |
| modify | `lib/api-server.cjs` | Use typed errors, structured logging |
| create | `tests/errors.test.js` | Error handling tests |

## Error Type Hierarchy
```javascript
// lib/errors.cjs
class GrabbyError extends Error {
  constructor(message, { code, context, cause }) {
    super(message);
    this.code = code;        // e.g., 'CONTRACT_NOT_FOUND'
    this.context = context;  // { file, operation, step }
    this.cause = cause;      // Original error if wrapped
  }
}

class ContractError extends GrabbyError { code = 'CONTRACT_ERROR' }
class ValidationError extends GrabbyError { code = 'VALIDATION_ERROR' }
class IOError extends GrabbyError { code = 'IO_ERROR' }
class ConfigError extends GrabbyError { code = 'CONFIG_ERROR' }

// Context builder
function withContext(error, context) { ... }
```

## Logger API
```javascript
// lib/logger.cjs
const logger = createLogger({ level: 'info', prefix: 'grabby' });

logger.info('message', { context });
logger.warn('message', { context });
logger.error('message', { error, context });
logger.debug('message', { context });
```

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery, winston, pino
- Security: Run `npm audit` before adding packages

## Security Considerations
- [ ] No secrets in error messages or logs
- [ ] Sanitize file paths in error context
- [ ] No stack traces in production user output
- [ ] Dependencies remain CVE-free (`npm audit`)

## Code Quality
- [ ] TypeScript strict mode preserved (no `any`)
- [ ] JSDoc comments for error classes
- [ ] No console.log/debugger statements left behind
- [ ] Consistent error patterns in migrated code

## Done When
- [ ] Error types created with context support
- [ ] Logger utility created
- [ ] At least 3 files migrated to use typed errors
- [ ] Error messages include actionable context
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes
- [ ] Build succeeds

## Testing
- Test error type creation and context chaining
- Test error serialization
- Test logger output format
- Test error handling in migrated code

## Context Refs
- ARCH_INDEX_v1
- RULESET_CORE_v1
