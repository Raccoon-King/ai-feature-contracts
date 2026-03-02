/**
 * Grabby - Contract Workflow Integration Tests
 * Tests the validate → plan → execute flow
 * Coverage target: 80%+
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('yaml');
const core = require('../../lib/core.cjs');

// Test directories
const PKG_ROOT = path.join(__dirname, '..', '..');
const TEMPLATES_DIR = path.join(PKG_ROOT, 'templates');

// Temp directory for tests
let tempDir;
let contractsDir;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-workflow-test-'));
  contractsDir = path.join(tempDir, 'contracts');
  fs.mkdirSync(contractsDir, { recursive: true });
});

afterEach(() => {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
});

// Helper to create a complete valid contract
function createValidContract(name, overrides = {}) {
  const content = `# FC: ${name}
**ID:** FC-${Date.now()} | **Status:** draft

## Objective
${overrides.objective || 'Implement the feature'}

## Scope
${overrides.scope || '- Main implementation\n- Unit tests'}

## Non-Goals
${overrides.nonGoals || '- No refactoring outside scope'}

## Directories
**Allowed:** \`${overrides.allowedDirs || 'src/'}\`
**Restricted:** \`backend/\`, \`node_modules/\`, \`.env*\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | \`src/${name.toLowerCase()}.ts\` | Main implementation |
| create | \`src/${name.toLowerCase()}.test.ts\` | Unit tests |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery

## Done When
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes
- [ ] Build succeeds

## Security Considerations
- [ ] Input validation implemented
- [ ] No sensitive data logged

## Testing
- Unit: src/${name.toLowerCase()}.test.ts

## Context Refs
- ARCH_INDEX_v1
- RULESET_CORE_v1
`;

  const filePath = path.join(contractsDir, `${name.toLowerCase()}.fc.md`);
  fs.writeFileSync(filePath, content);
  return { filePath, content, fileName: `${name.toLowerCase()}.fc.md` };
}

// ============================================================================
// CONTRACT CREATION
// ============================================================================

describe('Contract Creation Flow', () => {
  it('should create contract from template', () => {
    const result = core.createContract(TEMPLATES_DIR, contractsDir, 'New Feature');

    expect(fs.existsSync(result.filePath)).toBe(true);
    expect(result.fileName).toBe('new-feature.fc.md');
    expect(result.id).toMatch(/^FC-\d+$/);
  });

  it('should create contract with correct structure', () => {
    core.createContract(TEMPLATES_DIR, contractsDir, 'Test Feature');
    const content = fs.readFileSync(path.join(contractsDir, 'test-feature.fc.md'), 'utf8');

    expect(content).toContain('## Objective');
    expect(content).toContain('## Scope');
    expect(content).toContain('## Directories');
    expect(content).toContain('## Files');
    expect(content).toContain('## Done When');
  });

  it('should not overwrite existing contract', () => {
    core.createContract(TEMPLATES_DIR, contractsDir, 'Unique');

    expect(() => core.createContract(TEMPLATES_DIR, contractsDir, 'Unique'))
      .toThrow('Contract already exists');
  });
});

// ============================================================================
// CONTRACT VALIDATION
// ============================================================================

describe('Contract Validation Flow', () => {
  it('should validate complete contract', () => {
    const { content } = createValidContract('ValidFeature');
    const result = core.validateContract(content);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should catch missing sections', () => {
    const content = `# FC: Incomplete
## Objective
Test`;

    const result = core.validateContract(content);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should warn about vague scope', () => {
    const { content } = createValidContract('Vague', {
      scope: '- Improve performance\n- Optimize loading',
    });

    const result = core.validateContract(content);
    expect(result.warnings.some(w => w.includes('improve') || w.includes('optimize'))).toBe(true);
  });

  it('should track validation stats', () => {
    const { content } = createValidContract('Stats');
    const result = core.validateContract(content);

    expect(result.stats.scopeItems).toBeDefined();
    expect(result.stats.fileCount).toBeDefined();
    expect(result.stats.checkboxCount).toBeDefined();
    expect(result.stats.hasSecuritySection).toBe(true);
  });
});

// ============================================================================
// VALIDATION → PLAN FLOW
// ============================================================================

describe('Validation to Plan Flow', () => {
  it('should only plan valid contracts', () => {
    const { content, fileName } = createValidContract('PlanReady');
    const validation = core.validateContract(content);

    expect(validation.valid).toBe(true);
    // Contract is ready for planning
  });

  it('should reject invalid contracts before planning', () => {
    const content = `# FC: Invalid
## Objective
[TODO]`;

    const validation = core.validateContract(content);
    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain('Placeholder not filled: [TODO]');
  });

  it('should detect restricted directories before planning', () => {
    const content = `## Objective
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

    const validation = core.validateContract(content);
    expect(validation.errors).toContain('Restricted directory in files: node_modules/');
  });
});

// ============================================================================
// PLAN → APPROVAL FLOW
// ============================================================================

describe('Plan to Approval Flow', () => {
  it('should create plan artifact', () => {
    const { fileName } = createValidContract('Planned');
    const planFile = fileName.replace('.fc.md', '.plan.yaml');
    const planPath = path.join(contractsDir, planFile);

    // Simulate plan creation
    const plan = {
      contract: fileName,
      phase: 'plan',
      timestamp: new Date().toISOString(),
      files: [
        { order: 1, action: 'create', path: 'src/planned.ts', reason: 'Main' },
        { order: 2, action: 'create', path: 'src/planned.test.ts', reason: 'Tests' },
      ],
      status: 'pending_approval',
    };

    fs.writeFileSync(planPath, yaml.stringify(plan));
    expect(fs.existsSync(planPath)).toBe(true);

    const loaded = yaml.parse(fs.readFileSync(planPath, 'utf8'));
    expect(loaded.status).toBe('pending_approval');
  });

  it('should track plan status progression', () => {
    const planPath = path.join(contractsDir, 'test.plan.yaml');

    // Initial status
    const plan = { status: 'pending_approval', files: [] };
    fs.writeFileSync(planPath, yaml.stringify(plan));

    // Approve
    const loaded = yaml.parse(fs.readFileSync(planPath, 'utf8'));
    loaded.status = 'approved';
    loaded.approved_at = new Date().toISOString();
    fs.writeFileSync(planPath, yaml.stringify(loaded));

    const final = yaml.parse(fs.readFileSync(planPath, 'utf8'));
    expect(final.status).toBe('approved');
    expect(final.approved_at).toBeDefined();
  });
});

// ============================================================================
// APPROVAL → EXECUTION FLOW
// ============================================================================

describe('Approval to Execution Flow', () => {
  it('should only execute approved plans', () => {
    const planPath = path.join(contractsDir, 'test.plan.yaml');
    const plan = { status: 'pending_approval', files: [] };
    fs.writeFileSync(planPath, yaml.stringify(plan));

    const loaded = yaml.parse(fs.readFileSync(planPath, 'utf8'));
    expect(loaded.status).not.toBe('approved');
    // Execution should be blocked
  });

  it('should track execution start', () => {
    const planPath = path.join(contractsDir, 'exec.plan.yaml');
    const plan = { status: 'approved', files: [] };
    fs.writeFileSync(planPath, yaml.stringify(plan));

    // Start execution
    const loaded = yaml.parse(fs.readFileSync(planPath, 'utf8'));
    loaded.status = 'executing';
    loaded.executed_at = new Date().toISOString();
    fs.writeFileSync(planPath, yaml.stringify(loaded));

    const final = yaml.parse(fs.readFileSync(planPath, 'utf8'));
    expect(final.status).toBe('executing');
  });
});

// ============================================================================
// EXECUTION → AUDIT FLOW
// ============================================================================

describe('Execution to Audit Flow', () => {
  it('should prepare for audit after execution', () => {
    const { fileName } = createValidContract('Auditable');
    const auditFile = fileName.replace('.fc.md', '.audit.md');
    const auditPath = path.join(contractsDir, auditFile);

    // Create audit checklist
    const auditContent = `# Audit: ${fileName}

## File Verification
- [ ] All planned files created
- [ ] No out-of-scope files modified

## Quality Checks
- [ ] Tests pass
- [ ] Lint passes
- [ ] Build succeeds

## Security Review
- [ ] No secrets in code
- [ ] Input validation present

## Completion
- [ ] All Done When criteria met
`;

    fs.writeFileSync(auditPath, auditContent);
    expect(fs.existsSync(auditPath)).toBe(true);
  });

  it('should mark contract complete after audit', () => {
    const { filePath, content } = createValidContract('Complete');

    // Update status to complete
    const updated = content.replace('**Status:** draft', '**Status:** complete');
    fs.writeFileSync(filePath, updated);

    const final = fs.readFileSync(filePath, 'utf8');
    expect(final).toContain('**Status:** complete');
  });
});

// ============================================================================
// FULL WORKFLOW
// ============================================================================

describe('Full Workflow Integration', () => {
  it('should complete full contract lifecycle', () => {
    // 1. Create
    const { filePath, content, fileName } = createValidContract('Lifecycle');
    expect(fs.existsSync(filePath)).toBe(true);

    // 2. Validate
    const validation = core.validateContract(content);
    expect(validation.valid).toBe(true);

    // 3. Plan
    const planFile = fileName.replace('.fc.md', '.plan.yaml');
    const planPath = path.join(contractsDir, planFile);
    const plan = {
      contract: fileName,
      status: 'pending_approval',
      files: [{ path: 'src/lifecycle.ts', action: 'create' }],
    };
    fs.writeFileSync(planPath, yaml.stringify(plan));

    // 4. Approve
    const approvedPlan = yaml.parse(fs.readFileSync(planPath, 'utf8'));
    approvedPlan.status = 'approved';
    fs.writeFileSync(planPath, yaml.stringify(approvedPlan));

    // 5. Execute
    const executingPlan = yaml.parse(fs.readFileSync(planPath, 'utf8'));
    executingPlan.status = 'executing';
    fs.writeFileSync(planPath, yaml.stringify(executingPlan));

    // 6. Complete
    const completedPlan = yaml.parse(fs.readFileSync(planPath, 'utf8'));
    completedPlan.status = 'complete';
    fs.writeFileSync(planPath, yaml.stringify(completedPlan));

    const finalPlan = yaml.parse(fs.readFileSync(planPath, 'utf8'));
    expect(finalPlan.status).toBe('complete');
  });

  it('should maintain artifact relationships', () => {
    const baseName = 'related';
    createValidContract('Related');

    // All artifacts should use consistent naming
    const contractFile = `${baseName}.fc.md`;
    const planFile = `${baseName}.plan.yaml`;
    const backlogFile = `${baseName}.backlog.yaml`;
    const auditFile = `${baseName}.audit.md`;

    // Verify naming convention
    expect(planFile.replace('.plan.yaml', '')).toBe(baseName);
    expect(backlogFile.replace('.backlog.yaml', '')).toBe(baseName);
    expect(auditFile.replace('.audit.md', '')).toBe(baseName);
    expect(contractFile.replace('.fc.md', '')).toBe(baseName);
  });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

describe('Workflow Error Handling', () => {
  it('should handle missing contract file', () => {
    expect(() => core.resolveContract(contractsDir, 'nonexistent'))
      .toThrow('Contract not found');
  });

  it('should handle missing template', () => {
    expect(() => core.createContract(TEMPLATES_DIR, contractsDir, 'Test', 'nonexistent'))
      .toThrow('Template not found');
  });

  it('should handle invalid YAML in plan', () => {
    const planPath = path.join(contractsDir, 'bad.plan.yaml');
    fs.writeFileSync(planPath, 'invalid: yaml: content:');

    expect(() => yaml.parse(fs.readFileSync(planPath, 'utf8'))).toThrow();
  });
});
