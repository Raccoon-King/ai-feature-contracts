/**
 * Grabby - Governance Runtime Tests
 * Coverage target: 80%+
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('yaml');
const governanceRuntime = require('../lib/governance-runtime.cjs');

// Test directories
const PKG_ROOT = path.join(__dirname, '..');

// Temp directory for tests
let tempDir;
let docsDir;
let contractsDir;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-governance-test-'));
  docsDir = path.join(tempDir, 'docs');
  contractsDir = path.join(tempDir, 'contracts');
  fs.mkdirSync(docsDir, { recursive: true });
  fs.mkdirSync(contractsDir, { recursive: true });
});

afterEach(() => {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
});

// Helper to create context-index.yaml
function createContextIndex(content = null) {
  const defaultContent = {
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

  fs.writeFileSync(
    path.join(docsDir, 'context-index.yaml'),
    yaml.stringify(content || defaultContent)
  );
}

// Helper to create documentation files
function createDocFiles() {
  fs.writeFileSync(
    path.join(docsDir, 'architecture.md'),
    `# Architecture

## Module Map
This is the module map content.
`
  );

  fs.writeFileSync(
    path.join(docsDir, 'rules.md'),
    `# Coding Rules

## Coding Standards
These are the coding standards.
`
  );

  fs.writeFileSync(
    path.join(docsDir, 'environment.md'),
    `# Environment

## Local Development
Local development setup instructions.
`
  );
}

// Helper to create a test contract
function createTestContract(name = 'test', content = null) {
  const defaultContent = `# FC: Test Feature
**ID:** FC-123 | **Status:** draft

## Context Refs
- ARCH: module-map@v1
- RULESET: coding@v1
- ENV: local-dev@v1

## Objective
Test objective

## Scope
- Item 1

## Directories
**Allowed:** \`src/\`
**Restricted:** \`backend/\`, \`node_modules/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | \`src/test.ts\` | Main |

## Done When
- [ ] Tests pass
`;

  const filePath = path.join(contractsDir, `${name}.fc.md`);
  fs.writeFileSync(filePath, content || defaultContent);
  return filePath;
}

// ============================================================================
// PARSE CONTRACT METADATA
// ============================================================================

describe('parseContractMetadata', () => {
  it('should extract context refs from contract', () => {
    const content = `## Context Refs
- ARCH: module-map@v1
- RULESET: coding@v1
- ENV: local-dev@v1
`;
    const metadata = governanceRuntime.parseContractMetadata(content);
    expect(metadata.refs.ARCH).toBe('module-map@v1');
    expect(metadata.refs.RULESET).toBe('coding@v1');
    expect(metadata.refs.ENV).toBe('local-dev@v1');
  });

  it('should handle missing refs', () => {
    const content = '## Objective\nSome content';
    const metadata = governanceRuntime.parseContractMetadata(content);
    expect(Object.keys(metadata.refs).length).toBe(0);
  });

  it('should extract version pins', () => {
    const content = `ARCH_VERSION: v2
RULESET_VERSION: v1
ENV_VERSION: v3
`;
    const metadata = governanceRuntime.parseContractMetadata(content);
    expect(metadata.archVersion).toBe('v2');
    expect(metadata.rulesetVersion).toBe('v1');
    expect(metadata.envVersion).toBe('v3');
  });

  it('should extract contract type', () => {
    const content = 'CONTRACT_TYPE: QUICK_FIX';
    const metadata = governanceRuntime.parseContractMetadata(content);
    expect(metadata.type).toBe('QUICK_FIX');
  });

  it('should default contract type to FEATURE_CONTRACT', () => {
    const content = '## Objective\nTest';
    const metadata = governanceRuntime.parseContractMetadata(content);
    expect(metadata.type).toBe('FEATURE_CONTRACT');
  });
});

// ============================================================================
// RESOLVE CONTEXT REFS
// ============================================================================

describe('resolveContextRefs', () => {
  beforeEach(() => {
    createContextIndex();
    createDocFiles();
  });

  it('should resolve context refs for plan phase', () => {
    const contractContent = `## Context Refs
- ARCH: module-map@v1
- RULESET: coding@v1
- ENV: local-dev@v1
`;
    const result = governanceRuntime.resolveContextRefs({
      docsDir,
      contractContent,
      phase: 'plan',
      tokenBudget: 10000,
    });

    expect(result.resolved.length).toBe(3);
    expect(result.tokenUsage).toBeLessThan(result.tokenBudget);
  });

  it('should resolve context refs for execute phase', () => {
    const contractContent = `## Context Refs
- ARCH: module-map@v1
`;
    const result = governanceRuntime.resolveContextRefs({
      docsDir,
      contractContent,
      phase: 'execute',
      tokenBudget: 10000,
    });

    expect(result.resolved.length).toBeGreaterThan(0);
  });

  it('should throw when context-index.yaml is missing', () => {
    fs.unlinkSync(path.join(docsDir, 'context-index.yaml'));

    expect(() =>
      governanceRuntime.resolveContextRefs({
        docsDir,
        contractContent: '',
        phase: 'plan',
        tokenBudget: 1000,
      })
    ).toThrow('Missing docs/context-index.yaml');
  });

  it('should throw when referenced file is missing', () => {
    fs.unlinkSync(path.join(docsDir, 'architecture.md'));

    const contractContent = `## Context Refs
- ARCH: module-map@v1
`;

    expect(() =>
      governanceRuntime.resolveContextRefs({
        docsDir,
        contractContent,
        phase: 'plan',
        tokenBudget: 1000,
      })
    ).toThrow(/ENOENT|no such file/);
  });

  it('should throw when token budget exceeded', () => {
    const contractContent = `## Context Refs
- ARCH: module-map@v1
- RULESET: coding@v1
- ENV: local-dev@v1
`;

    expect(() =>
      governanceRuntime.resolveContextRefs({
        docsDir,
        contractContent,
        phase: 'plan',
        tokenBudget: 1, // Very low budget
      })
    ).toThrow(/token budget exceeded/);
  });

  it('should throw for deprecated reference', () => {
    createContextIndex({
      defaults: {},
      references: {
        ARCH: {
          'old-map@v1': {
            file: 'architecture.md',
            section: 'Module Map',
            phases: ['plan'],
            status: 'deprecated',
          },
        },
      },
      versions: {},
    });

    const contractContent = `## Context Refs
- ARCH: old-map@v1
`;

    expect(() =>
      governanceRuntime.resolveContextRefs({
        docsDir,
        contractContent,
        phase: 'plan',
        tokenBudget: 1000,
      })
    ).toThrow(/Deprecated context reference/);
  });
});

// ============================================================================
// CHECK VERSION COMPATIBILITY
// ============================================================================

describe('checkVersionCompatibility', () => {
  beforeEach(() => {
    createContextIndex();
  });

  it('should warn when version pins are missing', () => {
    const contractContent = '## Objective\nTest';
    const result = governanceRuntime.checkVersionCompatibility(contractContent, docsDir);

    expect(result.warnings).toContain('Missing version pins: ARCH_VERSION, RULESET_VERSION, ENV_VERSION');
  });

  it('should error for deprecated versions', () => {
    createContextIndex({
      defaults: {},
      references: {},
      versions: {
        latest: { ARCH_VERSION: 'v2' },
        deprecated: { ARCH_VERSION: ['v1'] },
      },
    });

    const contractContent = 'ARCH_VERSION: v1';
    const result = governanceRuntime.checkVersionCompatibility(contractContent, docsDir);

    expect(result.errors.some((e) => e.includes('deprecated'))).toBe(true);
  });

  it('should warn when not using latest version', () => {
    createContextIndex({
      defaults: {},
      references: {},
      versions: {
        latest: { ARCH_VERSION: 'v2' },
        deprecated: {},
      },
    });

    const contractContent = 'ARCH_VERSION: v1';
    const result = governanceRuntime.checkVersionCompatibility(contractContent, docsDir);

    expect(result.warnings.some((w) => w.includes('not latest'))).toBe(true);
  });

  it('should return no errors for valid latest versions', () => {
    createContextIndex({
      defaults: {},
      references: {},
      versions: {
        latest: {
          ARCH_VERSION: 'v1',
          RULESET_VERSION: 'v1',
          ENV_VERSION: 'v1',
        },
        deprecated: {},
      },
    });

    const contractContent = `ARCH_VERSION: v1
RULESET_VERSION: v1
ENV_VERSION: v1`;
    const result = governanceRuntime.checkVersionCompatibility(contractContent, docsDir);

    expect(result.errors.length).toBe(0);
  });
});

// ============================================================================
// VALIDATE EXECUTION SCOPE
// ============================================================================

describe('validateExecutionScope', () => {
  it('should pass when no files changed', () => {
    const result = governanceRuntime.validateExecutionScope({
      cwd: tempDir,
      planData: { files: [] },
      contractContent: `## Directories
**Allowed:** \`src/\`
**Restricted:** \`backend/\``,
    });

    expect(result.valid).toBe(true);
    expect(result.violations.length).toBe(0);
  });

  it('should detect restricted directory violations', () => {
    // Create a git repo and stage a file in restricted directory
    const backendDir = path.join(tempDir, 'backend');
    fs.mkdirSync(backendDir, { recursive: true });
    fs.writeFileSync(path.join(backendDir, 'test.js'), '// test');

    // Mock git status output would show this file
    // In real scenario, this would be detected by git status --porcelain
  });
});

// ============================================================================
// COLLECT FEATURE METRICS
// ============================================================================

describe('collectFeatureMetrics', () => {
  it('should collect metrics for a feature', () => {
    const metrics = governanceRuntime.collectFeatureMetrics({
      cwd: tempDir,
      contractFileName: 'test-feature.fc.md',
      planData: { files: [] },
      contextStats: { plan: 100, execute: 200 },
      violations: [],
    });

    expect(metrics.feature).toBe('test-feature');
    expect(metrics.timestamp).toBeDefined();
    expect(metrics.token_usage.plan).toBe(100);
    expect(metrics.token_usage.execute).toBe(200);
    expect(metrics.token_usage.total).toBe(300);
  });

  it('should handle missing context stats', () => {
    const metrics = governanceRuntime.collectFeatureMetrics({
      cwd: tempDir,
      contractFileName: 'test.fc.md',
      planData: { files: [] },
      contextStats: null,
      violations: [],
    });

    expect(metrics.token_usage.total).toBe(0);
  });

  it('should count violations', () => {
    const metrics = governanceRuntime.collectFeatureMetrics({
      cwd: tempDir,
      contractFileName: 'test.fc.md',
      planData: { files: [] },
      contextStats: {},
      violations: ['violation1', 'violation2'],
    });

    expect(metrics.rule_violations_detected).toBe(2);
  });
});

// ============================================================================
// SAVE AND SUMMARIZE METRICS
// ============================================================================

describe('saveFeatureMetrics', () => {
  it('should save metrics to file', () => {
    const metricsDir = path.join(tempDir, 'metrics');
    const metrics = {
      feature: 'test-feature',
      timestamp: new Date().toISOString(),
      token_usage: { total: 100 },
    };

    const filePath = governanceRuntime.saveFeatureMetrics(metricsDir, metrics);
    expect(fs.existsSync(filePath)).toBe(true);

    const saved = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(saved.feature).toBe('test-feature');
  });

  it('should create metrics directory if not exists', () => {
    const metricsDir = path.join(tempDir, 'new-metrics');
    governanceRuntime.saveFeatureMetrics(metricsDir, { feature: 'test' });
    expect(fs.existsSync(metricsDir)).toBe(true);
  });
});

describe('summarizeFeatureMetrics', () => {
  it('should return zero summary for empty metrics dir', () => {
    const summary = governanceRuntime.summarizeFeatureMetrics(path.join(tempDir, 'nonexistent'));
    expect(summary.features).toBe(0);
    expect(summary.total_tokens).toBe(0);
  });

  it('should summarize multiple metrics files', () => {
    const metricsDir = path.join(tempDir, 'metrics');
    fs.mkdirSync(metricsDir, { recursive: true });

    fs.writeFileSync(
      path.join(metricsDir, 'feature1.metrics.json'),
      JSON.stringify({
        feature: 'feature1',
        token_usage: { total: 100 },
        files_modified: 2,
        lines_changed: 50,
        rule_violations_detected: 1,
        plan_execution_drift: { drift_count: 0 },
      })
    );

    fs.writeFileSync(
      path.join(metricsDir, 'feature2.metrics.json'),
      JSON.stringify({
        feature: 'feature2',
        token_usage: { total: 200 },
        files_modified: 3,
        lines_changed: 75,
        rule_violations_detected: 0,
        plan_execution_drift: { drift_count: 1 },
      })
    );

    const summary = governanceRuntime.summarizeFeatureMetrics(metricsDir);
    expect(summary.features).toBe(2);
    expect(summary.total_tokens).toBe(300);
    expect(summary.total_files_modified).toBe(5);
    expect(summary.total_lines_changed).toBe(125);
    expect(summary.total_violations).toBe(1);
    expect(summary.total_drift).toBe(1);
  });
});

// ============================================================================
// UPGRADE CONTRACT VERSIONS
// ============================================================================

describe('upgradeContractVersions', () => {
  beforeEach(() => {
    createContextIndex();
  });

  it('should upgrade version pins to latest', () => {
    const content = `ARCH_VERSION: v0
RULESET_VERSION: v0
ENV_VERSION: v0`;

    const upgraded = governanceRuntime.upgradeContractVersions(content, docsDir);
    expect(upgraded).toContain('ARCH_VERSION: v1');
    expect(upgraded).toContain('RULESET_VERSION: v1');
    expect(upgraded).toContain('ENV_VERSION: v1');
  });
});

// ============================================================================
// LINT CONTEXT INDEX
// ============================================================================

describe('lintContextIndex', () => {
  it('should pass for valid context index', () => {
    createContextIndex();
    createDocFiles();

    const result = governanceRuntime.lintContextIndex(docsDir);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('should error for missing referenced file', () => {
    createContextIndex();
    // Don't create doc files

    const result = governanceRuntime.lintContextIndex(docsDir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Missing file'))).toBe(true);
  });

  it('should error for missing section', () => {
    createContextIndex({
      defaults: {},
      references: {
        ARCH: {
          'test@v1': {
            file: 'test.md',
            section: 'Nonexistent Section',
            phases: ['plan'],
          },
        },
      },
      versions: {},
    });

    fs.writeFileSync(path.join(docsDir, 'test.md'), '## Some Other Section\nContent');

    const result = governanceRuntime.lintContextIndex(docsDir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Missing section'))).toBe(true);
  });

  it('should error for non-numeric token_budget', () => {
    createContextIndex({
      defaults: {},
      references: {
        ARCH: {
          'test@v1': {
            file: 'test.md',
            section: 'Test',
            phases: ['plan'],
            token_budget: 'invalid',
          },
        },
      },
      versions: {},
    });

    fs.writeFileSync(path.join(docsDir, 'test.md'), '## Test\nContent');

    const result = governanceRuntime.lintContextIndex(docsDir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Non-numeric token_budget'))).toBe(true);
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Edge Cases', () => {
  it('should handle contract with no directories section', () => {
    const result = governanceRuntime.validateExecutionScope({
      cwd: tempDir,
      planData: { files: [] },
      contractContent: '## Objective\nTest',
    });

    expect(result.valid).toBe(true);
  });

  it('should handle contract with empty context refs', () => {
    createContextIndex();
    createDocFiles();

    const result = governanceRuntime.resolveContextRefs({
      docsDir,
      contractContent: '## Objective\nTest',
      phase: 'plan',
      tokenBudget: 10000,
    });

    // Should use defaults from context-index
    expect(result.resolved.length).toBeGreaterThan(0);
  });

  it('should handle metrics with missing optional fields', () => {
    const metrics = governanceRuntime.collectFeatureMetrics({
      cwd: tempDir,
      contractFileName: 'test.fc.md',
      planData: {},
      contextStats: undefined,
      violations: [],
    });

    expect(metrics.feature).toBe('test');
    expect(metrics.rule_violations_detected).toBe(0);
  });
});
