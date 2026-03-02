/**
 * Grabby - Governance Enforcement Integration Tests
 * Tests governance rules across modules
 * Coverage target: 80%+
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('yaml');
const core = require('../../lib/core.cjs');
const governanceRuntime = require('../../lib/governance-runtime.cjs');

// Test directories
const PKG_ROOT = path.join(__dirname, '..', '..');

// Temp directory for tests
let tempDir;
let contractsDir;
let docsDir;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-governance-int-test-'));
  contractsDir = path.join(tempDir, 'contracts');
  docsDir = path.join(tempDir, 'docs');
  fs.mkdirSync(contractsDir, { recursive: true });
  fs.mkdirSync(docsDir, { recursive: true });

  // Set up context index
  const contextIndex = {
    defaults: {
      ARCH: 'module-map@v1',
      RULESET: 'coding@v1',
      ENV: 'local-dev@v1',
    },
    references: {
      ARCH: {
        'module-map@v1': {
          file: 'architecture.md',
          section: 'Module Map',
          phases: ['plan', 'execute'],
          status: 'active',
        },
      },
      RULESET: {
        'coding@v1': {
          file: 'rules.md',
          section: 'Coding Standards',
          phases: ['plan', 'execute'],
          status: 'active',
        },
      },
      ENV: {
        'local-dev@v1': {
          file: 'environment.md',
          section: 'Local Development',
          phases: ['plan', 'execute'],
          status: 'active',
        },
      },
    },
    versions: {
      latest: {
        ARCH_VERSION: 'v1',
        RULESET_VERSION: 'v1',
        ENV_VERSION: 'v1',
      },
      deprecated: {},
    },
  };

  fs.writeFileSync(path.join(docsDir, 'context-index.yaml'), yaml.stringify(contextIndex));
  fs.writeFileSync(path.join(docsDir, 'architecture.md'), '## Module Map\nModule documentation.');
  fs.writeFileSync(path.join(docsDir, 'rules.md'), '## Coding Standards\nCoding rules.');
  fs.writeFileSync(path.join(docsDir, 'environment.md'), '## Local Development\nDev setup.');
});

afterEach(() => {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
});

// ============================================================================
// VALIDATION ENFORCEMENT
// ============================================================================

describe('Validation Enforcement', () => {
  it('should enforce required sections in contracts', () => {
    const incomplete = `# FC: Test
## Objective
Test objective`;

    const result = core.validateContract(incomplete);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Missing section'))).toBe(true);
  });

  it('should enforce security section for auth features', () => {
    const authContract = `# FC: Auth Feature
## Objective
Implement user authentication and login
## Scope
- Login page
## Directories
**Allowed:** src/
## Files
| Action | Path |
|--------|------|
| create | src/auth.ts |
## Done When
- [ ] Done`;

    const result = core.validateContract(authContract);
    expect(result.errors.some(e => e.includes('Security-sensitive'))).toBe(true);
  });

  it('should enforce 80% coverage requirement', () => {
    const contract = `## Objective
Test
## Scope
- Item
## Directories
**Allowed:** src/
## Files
| Action | Path |
|--------|------|
| create | src/test.ts |
## Done When
- [ ] Tests pass`;

    const result = core.validateContract(contract);
    expect(result.warnings).toContain('Done When should include 80%+ coverage requirement');
  });

  it('should enforce lint check requirement', () => {
    const contract = `## Objective
Test
## Scope
- Item
## Directories
**Allowed:** src/
## Files
| Action | Path |
|--------|------|
| create | src/test.ts |
## Done When
- [ ] Tests pass (80%+ coverage)`;

    const result = core.validateContract(contract);
    expect(result.warnings).toContain('Done When should include lint check');
  });
});

// ============================================================================
// DIRECTORY ENFORCEMENT
// ============================================================================

describe('Directory Enforcement', () => {
  it('should block node_modules modifications', () => {
    const contract = `## Objective
Test
## Scope
- Item
## Directories
**Allowed:** src/
## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | \`node_modules/pkg/index.js\` | Hack |
## Done When
- [ ] Done`;

    const result = core.validateContract(contract);
    expect(result.errors).toContain('Restricted directory in files: node_modules/');
  });

  it('should block .env file modifications', () => {
    const contract = `## Objective
Test
## Scope
- Item
## Directories
**Allowed:** src/
## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | \`.env\` | Config |
## Done When
- [ ] Done`;

    const result = core.validateContract(contract);
    expect(result.errors).toContain('Restricted directory in files: .env');
  });

  it('should block backend directory when restricted', () => {
    const contract = `## Objective
Test
## Scope
- Item
## Directories
**Allowed:** src/
**Restricted:** \`backend/\`
## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | \`backend/server.js\` | API |
## Done When
- [ ] Done`;

    const result = core.validateContract(contract);
    expect(result.errors).toContain('Restricted directory in files: backend/');
  });
});

// ============================================================================
// DEPENDENCY ENFORCEMENT
// ============================================================================

describe('Dependency Enforcement', () => {
  const baseContract = `## Objective
Test
## Scope
- Item
## Directories
**Allowed:** src/
## Files
| Action | Path |
|--------|------|
| create | src/test.ts |
## Done When
- [ ] Done`;

  it('should block moment dependency', () => {
    const contract = `${baseContract}
## Dependencies
- Allowed: moment, react`;

    const result = core.validateContract(contract);
    expect(result.errors).toContain('Banned dependency: moment');
  });

  it('should block lodash dependency', () => {
    const contract = `${baseContract}
## Dependencies
- Allowed: lodash`;

    const result = core.validateContract(contract);
    expect(result.errors).toContain('Banned dependency: lodash');
  });

  it('should block jquery dependency', () => {
    const contract = `${baseContract}
## Dependencies
- Allowed: jquery`;

    const result = core.validateContract(contract);
    expect(result.errors).toContain('Banned dependency: jquery');
  });

  it('should allow valid dependencies', () => {
    const contract = `${baseContract}
## Dependencies
- Allowed: react, typescript, jest`;

    const result = core.validateContract(contract);
    expect(result.errors.filter(e => e.includes('Banned'))).toHaveLength(0);
  });
});

// ============================================================================
// SCOPE ENFORCEMENT
// ============================================================================

describe('Scope Enforcement', () => {
  it('should limit scope to 7 items', () => {
    const contract = `## Objective
Test
## Scope
- Item 1
- Item 2
- Item 3
- Item 4
- Item 5
- Item 6
- Item 7
- Item 8
## Directories
**Allowed:** src/
## Files
| Action | Path |
|--------|------|
| create | src/test.ts |
## Done When
- [ ] Done`;

    const result = core.validateContract(contract);
    expect(result.errors.some(e => e.includes('Scope too large'))).toBe(true);
  });

  it('should warn about large scope', () => {
    const contract = `## Objective
Test
## Scope
- Item 1
- Item 2
- Item 3
- Item 4
- Item 5
- Item 6
## Directories
**Allowed:** src/
## Files
| Action | Path |
|--------|------|
| create | src/test.ts |
## Done When
- [ ] Done`;

    const result = core.validateContract(contract);
    expect(result.warnings.some(w => w.includes('Large scope'))).toBe(true);
  });

  it('should detect vague scope terms', () => {
    const vagueTerms = ['improve', 'optimize', 'enhance', 'better', 'faster', 'refactor'];

    vagueTerms.forEach(term => {
      const contract = `## Objective
Test
## Scope
- ${term} the system
## Directories
**Allowed:** src/
## Files
| Action | Path |
|--------|------|
| create | src/test.ts |
## Done When
- [ ] Done`;

      const result = core.validateContract(contract);
      expect(result.warnings.some(w => w.toLowerCase().includes(term))).toBe(true);
    });
  });
});

// ============================================================================
// CONTEXT REFERENCE ENFORCEMENT
// ============================================================================

describe('Context Reference Enforcement', () => {
  it('should resolve valid context refs', () => {
    const contractContent = `## Context Refs
- ARCH: module-map@v1
- RULESET: coding@v1
- ENV: local-dev@v1`;

    const result = governanceRuntime.resolveContextRefs({
      docsDir,
      contractContent,
      phase: 'plan',
      tokenBudget: 10000,
    });

    expect(result.resolved.length).toBe(3);
  });

  it('should enforce token budget', () => {
    const contractContent = `## Context Refs
- ARCH: module-map@v1`;

    expect(() => governanceRuntime.resolveContextRefs({
      docsDir,
      contractContent,
      phase: 'plan',
      tokenBudget: 1,
    })).toThrow(/token budget exceeded/);
  });

  it('should use default refs when not specified', () => {
    const contractContent = '## Objective\nTest';

    const result = governanceRuntime.resolveContextRefs({
      docsDir,
      contractContent,
      phase: 'plan',
      tokenBudget: 10000,
    });

    expect(result.resolved.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// VERSION COMPATIBILITY ENFORCEMENT
// ============================================================================

describe('Version Compatibility Enforcement', () => {
  it('should warn about missing version pins', () => {
    const contractContent = '## Objective\nTest';
    const result = governanceRuntime.checkVersionCompatibility(contractContent, docsDir);

    expect(result.warnings.some(w => w.includes('Missing version pins'))).toBe(true);
  });

  it('should accept latest versions', () => {
    const contractContent = `ARCH_VERSION: v1
RULESET_VERSION: v1
ENV_VERSION: v1`;

    const result = governanceRuntime.checkVersionCompatibility(contractContent, docsDir);
    expect(result.errors).toHaveLength(0);
  });
});

// ============================================================================
// INTEGRATED GOVERNANCE CHECKS
// ============================================================================

describe('Integrated Governance Checks', () => {
  it('should pass fully compliant contract', () => {
    const contract = `# FC: Compliant Feature
**ID:** FC-123 | **Status:** draft

## Objective
Implement a well-defined feature

## Scope
- Add new component
- Add unit tests

## Non-Goals
- No refactoring

## Directories
**Allowed:** \`src/\`
**Restricted:** \`backend/\`, \`node_modules/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | \`src/feature.ts\` | Main |
| create | \`src/feature.test.ts\` | Tests |

## Dependencies
- Allowed: react, typescript
- Banned: moment, lodash, jquery

## Done When
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes
- [ ] Build succeeds

## Security Considerations
- [ ] Input validation

## Testing
- Unit: src/feature.test.ts

## Context Refs
- ARCH: module-map@v1
- RULESET: coding@v1
`;

    const validationResult = core.validateContract(contract);
    expect(validationResult.valid).toBe(true);

    const contextResult = governanceRuntime.resolveContextRefs({
      docsDir,
      contractContent: contract,
      phase: 'plan',
      tokenBudget: 10000,
    });
    expect(contextResult.resolved.length).toBeGreaterThan(0);
  });

  it('should reject non-compliant contract', () => {
    const contract = `# FC: Non-Compliant
## Objective
[TODO] - improve everything
## Scope
- Item 1
- Item 2
- Item 3
- Item 4
- Item 5
- Item 6
- Item 7
- Item 8
## Files
| Action | Path |
|--------|------|
| modify | node_modules/pkg/hack.js |
## Dependencies
- Allowed: lodash, moment`;

    const result = core.validateContract(contract);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// LINT CONTEXT INDEX
// ============================================================================

describe('Context Index Linting', () => {
  it('should pass for valid context index', () => {
    const result = governanceRuntime.lintContextIndex(docsDir);
    expect(result.valid).toBe(true);
  });

  it('should fail for missing referenced files', () => {
    fs.unlinkSync(path.join(docsDir, 'architecture.md'));
    const result = governanceRuntime.lintContextIndex(docsDir);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Missing file'))).toBe(true);
  });
});
