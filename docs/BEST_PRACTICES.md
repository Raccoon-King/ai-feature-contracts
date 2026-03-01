# Code Best Practices

## Overview

All code produced under feature contracts must follow these best practices to ensure quality, maintainability, and security.

## Coverage Requirements

**Minimum: 80% code coverage**

All contracts require:
- 80%+ line coverage
- 80%+ branch coverage
- 80%+ function coverage

```bash
# Run tests with coverage
npm test -- --coverage --coverageThreshold='{"global":{"lines":80,"branches":80,"functions":80}}'
```

## TypeScript Best Practices

### Type Safety
```typescript
// BAD - Avoid 'any'
function process(data: any) { ... }

// GOOD - Use proper types
function process(data: UserInput) { ... }

// GOOD - Use unknown for truly unknown data
function parse(data: unknown): Result { ... }
```

### Strict Mode
```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

### Null Handling
```typescript
// BAD
function getName(user: User) {
  return user.profile.name; // Could be null
}

// GOOD
function getName(user: User) {
  return user.profile?.name ?? 'Unknown';
}
```

## Error Handling

### Always Handle Errors
```typescript
// BAD
const data = await fetchData();

// GOOD
try {
  const data = await fetchData();
} catch (error) {
  logger.error('Failed to fetch data', { error });
  throw new AppError('DATA_FETCH_FAILED', error);
}
```

### Custom Error Classes
```typescript
class AppError extends Error {
  constructor(
    public code: string,
    public cause?: Error,
    public statusCode = 500
  ) {
    super(code);
    this.name = 'AppError';
  }
}
```

### Never Swallow Errors
```typescript
// BAD
try { riskyOperation(); } catch { /* silent */ }

// GOOD
try {
  riskyOperation();
} catch (error) {
  logger.warn('Operation failed, using fallback', { error });
  return fallbackValue;
}
```

## Testing Best Practices

### Test Structure (AAA Pattern)
```typescript
describe('UserService', () => {
  describe('createUser', () => {
    it('should create user with valid input', () => {
      // Arrange
      const input = { name: 'John', email: 'john@example.com' };

      // Act
      const result = userService.createUser(input);

      // Assert
      expect(result.id).toBeDefined();
      expect(result.name).toBe('John');
    });
  });
});
```

### Test Coverage Requirements
- **Unit tests**: All functions/methods
- **Integration tests**: API endpoints, database operations
- **Edge cases**: Null, undefined, empty, boundary values
- **Error cases**: Invalid input, network failures

### What to Test
```typescript
// Test happy path
it('should return user when found', async () => {
  const user = await getUser('123');
  expect(user.id).toBe('123');
});

// Test error cases
it('should throw when user not found', async () => {
  await expect(getUser('invalid')).rejects.toThrow('USER_NOT_FOUND');
});

// Test edge cases
it('should handle empty input', () => {
  expect(validateInput('')).toBe(false);
});

// Test boundaries
it('should reject input over max length', () => {
  const longInput = 'a'.repeat(256);
  expect(validateInput(longInput)).toBe(false);
});
```

## Code Quality Rules

### ESLint Configuration
```json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:security/recommended"
  ],
  "rules": {
    "no-console": "warn",
    "no-debugger": "error",
    "no-eval": "error",
    "no-implied-eval": "error",
    "no-new-func": "error",
    "security/detect-object-injection": "warn",
    "security/detect-non-literal-fs-filename": "warn",
    "security/detect-non-literal-require": "warn"
  }
}
```

### Naming Conventions
```typescript
// Classes: PascalCase
class UserService { }

// Functions/Methods: camelCase
function getUserById() { }

// Constants: SCREAMING_SNAKE_CASE
const MAX_RETRY_COUNT = 3;

// Private: prefix with underscore
private _internalState = {};

// Boolean: prefix with is/has/can/should
const isActive = true;
const hasPermission = false;
```

### Function Size
- **Max lines per function**: 50
- **Max parameters**: 4 (use object for more)
- **Max nesting depth**: 3

```typescript
// BAD - Too many params
function createUser(name, email, age, role, dept, manager, startDate) { }

// GOOD - Use object
function createUser(options: CreateUserOptions) { }
```

## Documentation

### JSDoc for Public APIs
```typescript
/**
 * Creates a new user in the system.
 *
 * @param options - User creation options
 * @param options.name - User's full name
 * @param options.email - User's email address
 * @returns The created user object
 * @throws {ValidationError} If input is invalid
 * @throws {DuplicateError} If email already exists
 *
 * @example
 * const user = await createUser({ name: 'John', email: 'john@example.com' });
 */
async function createUser(options: CreateUserOptions): Promise<User> { }
```

### README for Components
Each component/module should have:
- Purpose description
- Usage examples
- API documentation
- Dependencies

## Performance Best Practices

### Avoid Memory Leaks
```typescript
// BAD - Event listener not cleaned up
useEffect(() => {
  window.addEventListener('resize', handler);
}, []);

// GOOD - Clean up
useEffect(() => {
  window.addEventListener('resize', handler);
  return () => window.removeEventListener('resize', handler);
}, []);
```

### Optimize Loops
```typescript
// BAD - DOM access in loop
for (const item of items) {
  document.getElementById('list').appendChild(createItem(item));
}

// GOOD - Batch DOM updates
const fragment = document.createDocumentFragment();
for (const item of items) {
  fragment.appendChild(createItem(item));
}
document.getElementById('list').appendChild(fragment);
```

## Git Best Practices

### Commit Messages
```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types: feat, fix, docs, style, refactor, test, chore

### Pre-commit Hooks

**Grabby Hooks (Contract Enforcement):**
```bash
# Install grabby hooks
grabby init-hooks

# Enable strict mode
export GRABBY_STRICT=1
```

**Husky + lint-staged:**
```json
// package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged",
      "pre-push": "npm test"
    }
  },
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"]
  }
}
```

## Code Review Checklist

- [ ] Tests included and passing
- [ ] Coverage >= 80%
- [ ] No security vulnerabilities
- [ ] No console.log/debugger
- [ ] Error handling complete
- [ ] Types are correct (no `any`)
- [ ] Documentation updated
- [ ] No hardcoded values
- [ ] Performance considered
