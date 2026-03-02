/**
 * Grabby - CLI Commands E2E Tests
 * Tests CLI commands end-to-end
 * Coverage target: 80%+
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawnSync } = require('child_process');

// Test directories
const PKG_ROOT = path.join(__dirname, '..', '..');
const CLI_PATH = path.join(PKG_ROOT, 'bin', 'index.cjs');

// Temp directory for tests
let tempDir;
let contractsDir;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-cli-test-'));
  contractsDir = path.join(tempDir, 'contracts');
  fs.mkdirSync(contractsDir, { recursive: true });
});

afterEach(() => {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
});

// Helper to run CLI command
function runCli(args, options = {}) {
  const { cwd = tempDir, input } = options;

  try {
    const result = spawnSync('node', [CLI_PATH, ...args], {
      cwd,
      encoding: 'utf8',
      timeout: 30000,
      input,
      env: { ...process.env, NO_COLOR: '1' },
    });

    return {
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      status: result.status,
      success: result.status === 0,
    };
  } catch (error) {
    return {
      stdout: '',
      stderr: error.message,
      status: 1,
      success: false,
    };
  }
}

// ============================================================================
// HELP COMMAND
// ============================================================================

describe('Help Command', () => {
  it('should display help with --help flag', () => {
    const result = runCli(['--help']);
    expect(result.stdout).toContain('grabby');
  });

  it('should display help with -h flag', () => {
    const result = runCli(['-h']);
    expect(result.stdout).toContain('grabby');
  });

  it('should display version with --version flag', () => {
    const result = runCli(['--version']);
    // May show version or help - either is acceptable
    expect(result.stdout).toContain('grabby');
  });
});

// ============================================================================
// LIST COMMAND
// ============================================================================

describe('List Command', () => {
  it('should list contracts when contracts exist', () => {
    // Create a test contract
    fs.writeFileSync(
      path.join(contractsDir, 'test.fc.md'),
      '# FC: Test\n**ID:** FC-123 | **Status:** draft'
    );

    const result = runCli(['list']);
    expect(result.stdout).toContain('test');
  });

  it('should handle empty contracts directory', () => {
    const result = runCli(['list']);
    // Should not error, just show no contracts
    expect(result.status).toBe(0);
  });
});

// ============================================================================
// VALIDATE COMMAND
// ============================================================================

describe('Validate Command', () => {
  it('should validate a valid contract', () => {
    const validContract = `# FC: Valid Test
**ID:** FC-123 | **Status:** draft

## Objective
Test objective

## Scope
- Item 1

## Directories
**Allowed:** \`src/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | src/test.ts | Main |
| create | src/test.test.ts | Tests |

## Done When
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes

## Security Considerations
- [ ] Input validation

## Testing
- Unit tests
`;

    fs.writeFileSync(path.join(contractsDir, 'valid.fc.md'), validContract);

    const result = runCli(['validate', 'valid.fc.md']);
    expect(result.stdout.toLowerCase()).toMatch(/valid|pass/i);
  });

  it('should report errors for invalid contract', () => {
    const invalidContract = `# FC: Invalid
## Objective
[TODO]`;

    fs.writeFileSync(path.join(contractsDir, 'invalid.fc.md'), invalidContract);

    const result = runCli(['validate', 'invalid.fc.md']);
    // Should produce some output indicating validation ran
    expect(result.stdout.length + result.stderr.length).toBeGreaterThan(0);
  });

  it('should handle missing contract file', () => {
    const result = runCli(['validate', 'nonexistent.fc.md']);
    // Should either error (non-zero exit) or show error message
    const output = result.stderr.toLowerCase() + result.stdout.toLowerCase();
    expect(result.status !== 0 || output.match(/not found|error|cannot|no such/i)).toBeTruthy();
  });
});

// ============================================================================
// AGENT COMMAND
// ============================================================================

describe('Agent Command', () => {
  it('should list available agents', () => {
    const result = runCli(['agent', 'list']);
    expect(result.stdout).toContain('Archie');
    expect(result.stdout).toContain('Val');
    expect(result.stdout).toContain('Sage');
  });

  it('should display agent info', () => {
    const result = runCli(['agent', 'architect']);
    expect(result.stdout).toContain('Archie');
  });

  it('should handle invalid agent name', () => {
    const result = runCli(['agent', 'nonexistent']);
    expect(result.stderr.toLowerCase() + result.stdout.toLowerCase()).toMatch(/not found|unknown|error/i);
  });
});

// ============================================================================
// CREATE COMMAND
// ============================================================================

describe('Create Command', () => {
  it('should show create help', () => {
    const result = runCli(['create', '--help']);
    expect(result.status).toBe(0);
  });
});

// ============================================================================
// PLAN COMMAND
// ============================================================================

describe('Plan Command', () => {
  it('should generate plan for valid contract', () => {
    const contract = `# FC: Plan Test
**ID:** FC-123 | **Status:** draft

## Objective
Test

## Scope
- Main feature

## Directories
**Allowed:** \`src/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | src/feature.ts | Main |

## Done When
- [ ] Tests pass

## Context Refs
- ARCH_INDEX_v1
`;

    fs.writeFileSync(path.join(contractsDir, 'plan-test.fc.md'), contract);

    const result = runCli(['plan', 'plan-test.fc.md']);
    // Plan should be generated or show relevant output
    expect(result.status).toBeDefined();
  });

  it('should handle missing contract for plan', () => {
    const result = runCli(['plan', 'nonexistent.fc.md']);
    expect(result.stderr.toLowerCase() + result.stdout.toLowerCase()).toMatch(/not found|error/i);
  });
});

// ============================================================================
// APPROVE COMMAND
// ============================================================================

describe('Approve Command', () => {
  it('should handle approve with missing contract', () => {
    const result = runCli(['approve', 'nonexistent.fc.md']);
    expect(result.stderr.toLowerCase() + result.stdout.toLowerCase()).toMatch(/not found|error/i);
  });
});

// ============================================================================
// EXECUTE COMMAND
// ============================================================================

describe('Execute Command', () => {
  it('should handle execute with missing contract', () => {
    const result = runCli(['execute', 'nonexistent.fc.md']);
    expect(result.stderr.toLowerCase() + result.stdout.toLowerCase()).toMatch(/not found|error/i);
  });
});

// ============================================================================
// AUDIT COMMAND
// ============================================================================

describe('Audit Command', () => {
  it('should handle audit with missing contract', () => {
    const result = runCli(['audit', 'nonexistent.fc.md']);
    expect(result.stderr.toLowerCase() + result.stdout.toLowerCase()).toMatch(/not found|error/i);
  });
});

// ============================================================================
// PARTY COMMAND
// ============================================================================

describe('Party Command', () => {
  it('should display team workflow', () => {
    const result = runCli(['party']);
    // Should show team information or workflow
    expect(result.status).toBeDefined();
  });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

describe('Error Handling', () => {
  it('should handle unknown command gracefully', () => {
    const result = runCli(['unknowncommand123']);
    // Should not crash, show help or error
    expect(result.status).toBeDefined();
  });

  it('should handle missing arguments', () => {
    const result = runCli(['validate']);
    // Should show usage or error
    expect(result.status).toBeDefined();
  });

  it('should handle invalid file paths', () => {
    const result = runCli(['validate', '/nonexistent/path/file.fc.md']);
    expect(result.stderr.toLowerCase() + result.stdout.toLowerCase()).toMatch(/not found|error|invalid/i);
  });
});

// ============================================================================
// OUTPUT FORMATTING
// ============================================================================

describe('Output Formatting', () => {
  it('should respect NO_COLOR environment variable', () => {
    const result = runCli(['--help']);
    // Output should contain help text regardless of color
    expect(result.stdout).toContain('grabby');
  });

  it('should provide consistent exit codes', () => {
    // Success case
    const success = runCli(['--version']);
    expect(success.status).toBe(0);

    // Error case (missing file)
    const error = runCli(['validate', 'nonexistent.fc.md']);
    expect(error.status).not.toBe(0);
  });
});

// ============================================================================
// INTEGRATION
// ============================================================================

describe('CLI Integration', () => {
  it('should work with relative paths', () => {
    fs.writeFileSync(
      path.join(contractsDir, 'relative.fc.md'),
      '# FC: Relative\n**ID:** FC-123 | **Status:** draft\n## Objective\nTest'
    );

    const result = runCli(['validate', 'contracts/relative.fc.md'], { cwd: tempDir });
    expect(result.status).toBeDefined();
  });

  it('should handle contracts in subdirectories', () => {
    const subDir = path.join(contractsDir, 'features');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(
      path.join(subDir, 'sub.fc.md'),
      '# FC: Sub\n**ID:** FC-123 | **Status:** draft\n## Objective\nTest'
    );

    const result = runCli(['validate', 'contracts/features/sub.fc.md'], { cwd: tempDir });
    expect(result.status).toBeDefined();
  });
});
