/**
 * Grabby - File Generation E2E Tests
 * Tests contract/plan file generation
 * Coverage target: 80%+
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('yaml');
const core = require('../../lib/core.cjs');
const agile = require('../../lib/agile.cjs');
const taskBrief = require('../../lib/task-brief.cjs');

// Test directories
const PKG_ROOT = path.join(__dirname, '..', '..');
const TEMPLATES_DIR = path.join(PKG_ROOT, 'templates');

// Temp directory for tests
let tempDir;
let contractsDir;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-filegen-test-'));
  contractsDir = path.join(tempDir, 'contracts');
  fs.mkdirSync(contractsDir, { recursive: true });
});

afterEach(() => {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
});

// ============================================================================
// CONTRACT FILE GENERATION
// ============================================================================

describe('Contract File Generation', () => {
  it('should generate contract from default template', () => {
    const result = core.createContract(TEMPLATES_DIR, contractsDir, 'Test Feature');

    expect(fs.existsSync(result.filePath)).toBe(true);
    expect(result.fileName).toBe('test-feature.fc.md');

    const content = fs.readFileSync(result.filePath, 'utf8');
    expect(content).toContain('# FC:');
    expect(content).toContain('## Objective');
    expect(content).toContain('## Scope');
    expect(content).toContain('## Files');
    expect(content).toContain('## Done When');
  });

  it('should generate contract from ui-component template', () => {
    const result = core.createContract(TEMPLATES_DIR, contractsDir, 'Button', 'ui-component');

    expect(fs.existsSync(result.filePath)).toBe(true);

    const content = fs.readFileSync(result.filePath, 'utf8');
    expect(content).toContain('UI component');
  });

  it('should generate contract from api-endpoint template', () => {
    const result = core.createContract(TEMPLATES_DIR, contractsDir, 'Users API', 'api-endpoint');

    expect(fs.existsSync(result.filePath)).toBe(true);

    const content = fs.readFileSync(result.filePath, 'utf8');
    expect(content).toContain('API');
  });

  it('should generate contract from bug-fix template', () => {
    const result = core.createContract(TEMPLATES_DIR, contractsDir, 'Fix Login Bug', 'bug-fix');

    expect(fs.existsSync(result.filePath)).toBe(true);
  });

  it('should generate contract with unique ID', () => {
    const result1 = core.createContract(TEMPLATES_DIR, contractsDir, 'Feature One');
    const result2 = core.createContract(TEMPLATES_DIR, contractsDir, 'Feature Two');

    expect(result1.id).not.toBe(result2.id);
  });

  it('should slugify contract filename correctly', () => {
    const result = core.createContract(TEMPLATES_DIR, contractsDir, 'My Feature @v2.0 (Enhanced!)');

    expect(result.fileName).toMatch(/^my-feature.*\.fc\.md$/);
    expect(result.fileName).not.toContain('@');
    expect(result.fileName).not.toContain('(');
  });
});

// ============================================================================
// PLAN FILE GENERATION
// ============================================================================

describe('Plan File Generation', () => {
  it('should generate plan YAML file', () => {
    const contractContent = `# FC: Test Feature
## Scope
- Implement login
- Add tests

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | src/login.ts | Login logic |
| create | src/login.test.ts | Tests |
`;

    const planPath = path.join(contractsDir, 'test.plan.yaml');
    const plan = {
      contract: 'test.fc.md',
      phase: 'plan',
      timestamp: new Date().toISOString(),
      files: [
        { order: 1, action: 'create', path: 'src/login.ts', reason: 'Login logic' },
        { order: 2, action: 'create', path: 'src/login.test.ts', reason: 'Tests' },
      ],
      status: 'pending_approval',
    };

    fs.writeFileSync(planPath, yaml.stringify(plan));

    expect(fs.existsSync(planPath)).toBe(true);

    const loaded = yaml.parse(fs.readFileSync(planPath, 'utf8'));
    expect(loaded.contract).toBe('test.fc.md');
    expect(loaded.files.length).toBe(2);
    expect(loaded.status).toBe('pending_approval');
  });

  it('should generate plan with correct file ordering', () => {
    const plan = {
      files: [
        { order: 1, path: 'src/types.ts' },
        { order: 2, path: 'src/hooks/useAuth.ts' },
        { order: 3, path: 'src/components/Login.tsx' },
        { order: 4, path: 'src/components/Login.test.tsx' },
      ],
    };

    const planPath = path.join(contractsDir, 'ordered.plan.yaml');
    fs.writeFileSync(planPath, yaml.stringify(plan));

    const loaded = yaml.parse(fs.readFileSync(planPath, 'utf8'));
    expect(loaded.files[0].order).toBe(1);
    expect(loaded.files[3].order).toBe(4);
  });

  it('should include checkpoints in plan', () => {
    const plan = {
      files: [{ path: 'src/a.ts' }, { path: 'src/b.ts' }],
      checkpoints: [
        { after: 1, verify: 'Core functionality works' },
        { after: 2, verify: 'All tests pass' },
      ],
    };

    const planPath = path.join(contractsDir, 'checkpoints.plan.yaml');
    fs.writeFileSync(planPath, yaml.stringify(plan));

    const loaded = yaml.parse(fs.readFileSync(planPath, 'utf8'));
    expect(loaded.checkpoints.length).toBe(2);
  });
});

// ============================================================================
// BACKLOG FILE GENERATION
// ============================================================================

describe('Backlog File Generation', () => {
  const defaultConfig = {
    agile: {
      naming: {
        epicPrefix: 'EPIC',
        taskPrefix: 'TASK',
        subtaskPrefix: 'SUB',
      },
      splitBy: ['scope'],
      maxTasksPerEpic: 10,
      maxSubtasksPerTask: 5,
    },
  };

  it('should generate backlog YAML file', () => {
    const contractContent = `# FC: Test Feature
## Scope
- Implement feature A
- Implement feature B

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | src/a.ts | A |
| create | src/b.ts | B |
`;

    const backlog = agile.generateBacklog({
      content: contractContent,
      fileName: 'test.fc.md',
      config: defaultConfig,
    });

    const backlogPath = agile.getBacklogPath(contractsDir, 'test.fc.md');
    fs.writeFileSync(backlogPath, yaml.stringify(backlog));

    expect(fs.existsSync(backlogPath)).toBe(true);

    const loaded = yaml.parse(fs.readFileSync(backlogPath, 'utf8'));
    expect(loaded.epics.length).toBeGreaterThan(0);
    expect(loaded.epics[0].tasks.length).toBe(2);
  });

  it('should generate backlog with correct IDs', () => {
    const contractContent = `# FC: Test
## Scope
- Task 1

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | src/test.ts | Test |
`;

    const backlog = agile.generateBacklog({
      content: contractContent,
      fileName: 'test.fc.md',
      config: defaultConfig,
    });

    expect(backlog.epics[0].id).toBe('EPIC-1');
    expect(backlog.epics[0].tasks[0].id).toBe('TASK-1');
    expect(backlog.epics[0].tasks[0].subtasks[0].id).toBe('SUB-1');
  });
});

// ============================================================================
// TASK BRIEF GENERATION
// ============================================================================

describe('Task Brief Generation', () => {
  it('should generate task brief markdown file', () => {
    const briefPath = taskBrief.getTaskBriefPath(contractsDir, 'Authentication Feature');
    const briefContent = taskBrief.buildTaskBrief({
      taskName: 'Authentication Feature',
      request: 'Add user authentication',
      persona: {
        agentName: 'Archie',
        title: 'Contract Architect',
        mode: 'architect',
        rationale: 'Creating new feature',
        handoffCommand: 'grabby agent architect CC',
      },
      objective: 'Implement secure authentication',
      scopeItems: ['Login page', 'Session management'],
      constraints: 'Use existing auth library',
      doneWhen: 'Tests pass, security review complete',
    });

    fs.writeFileSync(briefPath, briefContent);

    expect(fs.existsSync(briefPath)).toBe(true);
    expect(briefPath).toContain('authentication-feature.brief.md');

    const loaded = fs.readFileSync(briefPath, 'utf8');
    expect(loaded).toContain('# Grabby Task Brief');
    expect(loaded).toContain('Authentication Feature');
    expect(loaded).toContain('Archie');
  });

  it('should generate brief with all sections', () => {
    const brief = taskBrief.buildTaskBrief({
      taskName: 'Test',
      request: 'Test request',
      persona: {
        agentName: 'Test',
        title: 'Tester',
        mode: 'test',
        rationale: 'Testing',
        handoffCommand: 'test',
      },
      objective: 'Test objective',
      scopeItems: ['Item 1'],
      constraints: 'Test constraints',
      doneWhen: 'Test done',
    });

    expect(brief).toContain('## Request');
    expect(brief).toContain('## Facilitator');
    expect(brief).toContain('## Objective');
    expect(brief).toContain('## Scope Breakdown');
    expect(brief).toContain('## Constraints');
    expect(brief).toContain('## Done When');
    expect(brief).toContain('## Recommended Handoff');
  });
});

// ============================================================================
// AUDIT FILE GENERATION
// ============================================================================

describe('Audit File Generation', () => {
  it('should generate audit checklist file', () => {
    const auditPath = path.join(contractsDir, 'test.audit.md');
    const auditContent = `# Audit Checklist: test.fc.md

## File Verification
- [ ] All planned files created
- [ ] No out-of-scope files modified
- [ ] File locations match plan

## Quality Checks
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes (no warnings)
- [ ] Build succeeds
- [ ] No TypeScript errors

## Security Review
- [ ] No secrets in code
- [ ] Input validation present
- [ ] Error handling complete
- [ ] No console.log in production

## Definition of Done
- [ ] All contract criteria met
- [ ] Code reviewed
- [ ] Documentation updated

## Sign-off
- Auditor: _______________
- Date: _______________
`;

    fs.writeFileSync(auditPath, auditContent);

    expect(fs.existsSync(auditPath)).toBe(true);

    const loaded = fs.readFileSync(auditPath, 'utf8');
    expect(loaded).toContain('## File Verification');
    expect(loaded).toContain('## Quality Checks');
    expect(loaded).toContain('## Security Review');
  });
});

// ============================================================================
// FILE NAMING CONVENTIONS
// ============================================================================

describe('File Naming Conventions', () => {
  it('should use consistent naming across artifacts', () => {
    const baseName = 'user-authentication';

    const contractFile = `${baseName}.fc.md`;
    const planFile = `${baseName}.plan.yaml`;
    const backlogFile = `${baseName}.backlog.yaml`;
    const briefFile = `${baseName}.brief.md`;
    const auditFile = `${baseName}.audit.md`;

    // All should derive from same base name
    expect(contractFile.replace('.fc.md', '')).toBe(baseName);
    expect(planFile.replace('.plan.yaml', '')).toBe(baseName);
    expect(backlogFile.replace('.backlog.yaml', '')).toBe(baseName);
    expect(briefFile.replace('.brief.md', '')).toBe(baseName);
    expect(auditFile.replace('.audit.md', '')).toBe(baseName);
  });

  it('should slugify names consistently', () => {
    const names = [
      'User Authentication',
      'user authentication',
      'USER AUTHENTICATION',
      'User  Authentication',
    ];

    const slugs = names.map(name => core.slug(name));

    // All should produce same slug
    expect(new Set(slugs).size).toBe(1);
    expect(slugs[0]).toBe('user-authentication');
  });
});

// ============================================================================
// FILE CONTENT VALIDATION
// ============================================================================

describe('File Content Validation', () => {
  it('should generate valid YAML in plan files', () => {
    const plan = {
      contract: 'test.fc.md',
      files: [{ path: 'src/test.ts' }],
    };

    const planPath = path.join(contractsDir, 'test.plan.yaml');
    fs.writeFileSync(planPath, yaml.stringify(plan));

    const content = fs.readFileSync(planPath, 'utf8');

    // Should be valid YAML
    expect(() => yaml.parse(content)).not.toThrow();
  });

  it('should generate valid Markdown in contract files', () => {
    core.createContract(TEMPLATES_DIR, contractsDir, 'Markdown Test');

    const content = fs.readFileSync(
      path.join(contractsDir, 'markdown-test.fc.md'),
      'utf8'
    );

    // Should have valid markdown structure
    expect(content).toMatch(/^# /m); // H1 header
    expect(content).toMatch(/^## /m); // H2 headers
    expect(content).toMatch(/\| .+ \| .+ \|/); // Tables
    expect(content).toMatch(/- \[ \]/); // Checkboxes
  });

  it('should preserve special characters in content', () => {
    const briefContent = taskBrief.buildTaskBrief({
      taskName: 'Test <Feature> "v2"',
      request: 'Request with $pecial & <chars>',
      persona: {
        agentName: 'Test',
        title: 'Test',
        mode: 'test',
        rationale: 'Test',
        handoffCommand: 'test',
      },
      objective: 'Objective with [brackets]',
      scopeItems: ['Item with `backticks`'],
      constraints: 'Constraints',
      doneWhen: 'Done',
    });

    expect(briefContent).toContain('<Feature>');
    expect(briefContent).toContain('"v2"');
    expect(briefContent).toContain('[brackets]');
    expect(briefContent).toContain('`backticks`');
  });
});

// ============================================================================
// FILE SYSTEM INTEGRATION
// ============================================================================

describe('File System Integration', () => {
  it('should create contracts directory if not exists', () => {
    const newDir = path.join(tempDir, 'new-contracts');

    core.createContract(TEMPLATES_DIR, newDir, 'Auto Create');

    expect(fs.existsSync(newDir)).toBe(true);
    expect(fs.existsSync(path.join(newDir, 'auto-create.fc.md'))).toBe(true);
  });

  it('should handle nested directory creation', () => {
    const nestedDir = path.join(tempDir, 'level1', 'level2', 'contracts');

    core.createContract(TEMPLATES_DIR, nestedDir, 'Nested');

    expect(fs.existsSync(path.join(nestedDir, 'nested.fc.md'))).toBe(true);
  });

  it('should preserve file permissions', () => {
    core.createContract(TEMPLATES_DIR, contractsDir, 'Permissions');

    const stats = fs.statSync(path.join(contractsDir, 'permissions.fc.md'));

    // File should be readable
    expect(stats.mode & fs.constants.S_IRUSR).toBeTruthy();
  });
});
