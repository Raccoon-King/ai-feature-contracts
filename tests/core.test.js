/**
 * Grabby - Core Library Tests
 * Coverage target: 80%+
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const core = require('../lib/core.cjs');

// Test directories
const PKG_ROOT = path.join(__dirname, '..');
const TEMPLATES_DIR = path.join(PKG_ROOT, 'templates');
const AGENTS_DIR = path.join(PKG_ROOT, 'agents');
const WORKFLOWS_DIR = path.join(PKG_ROOT, 'workflows');

// Temp directory for tests
let tempDir;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-test-'));
});

afterEach(() => {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

describe('Utility Functions', () => {
  describe('genId', () => {
    it('should generate unique IDs with FC- prefix', () => {
      const id = core.genId();
      expect(id).toMatch(/^FC-\d+$/);
    });

    it('should generate IDs based on timestamp', () => {
      const before = Date.now();
      const id = core.genId();
      const after = Date.now();
      const idNum = parseInt(id.replace('FC-', ''));
      expect(idNum).toBeGreaterThanOrEqual(before);
      expect(idNum).toBeLessThanOrEqual(after);
    });
  });

  describe('slug', () => {
    it('should convert to lowercase', () => {
      expect(core.slug('HelloWorld')).toBe('helloworld');
    });

    it('should replace spaces with hyphens', () => {
      expect(core.slug('hello world')).toBe('hello-world');
    });

    it('should remove special characters', () => {
      expect(core.slug('hello@world!')).toBe('hello-world');
    });

    it('should handle multiple spaces/special chars', () => {
      expect(core.slug('hello   world!!!')).toBe('hello-world');
    });

    it('should trim leading/trailing hyphens', () => {
      expect(core.slug('--hello--')).toBe('hello');
      expect(core.slug('!!!hello!!!')).toBe('hello');
    });

    it('should handle empty string', () => {
      expect(core.slug('')).toBe('');
    });

    it('should handle numbers', () => {
      expect(core.slug('feature123')).toBe('feature123');
    });
  });

  describe('timestamp', () => {
    it('should return ISO format timestamp', () => {
      const ts = core.timestamp();
      expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should return current time', () => {
      const before = new Date().toISOString().slice(0, 19);
      const ts = core.timestamp();
      const after = new Date().toISOString().slice(0, 19);
      expect(ts.slice(0, 19)).toBe(before); // Should be same second
    });
  });

  describe('colors', () => {
    it('should have color codes defined', () => {
      expect(core.colors.reset).toBeDefined();
      expect(core.colors.red).toBeDefined();
      expect(core.colors.green).toBeDefined();
    });

    it('should format error messages in red', () => {
      const msg = core.c.error('error');
      expect(msg).toContain(core.colors.red);
      expect(msg).toContain('error');
      expect(msg).toContain(core.colors.reset);
    });

    it('should format success messages in green', () => {
      const msg = core.c.success('success');
      expect(msg).toContain(core.colors.green);
    });

    it('should format warnings in yellow', () => {
      const msg = core.c.warn('warning');
      expect(msg).toContain(core.colors.yellow);
    });
  });
});

// ============================================================================
// VALIDATION
// ============================================================================

describe('Contract Validation', () => {
  describe('Required Sections', () => {
    it('should fail when missing all required sections', () => {
      const content = '# FC: Test\nSome content';
      const result = core.validateContract(content);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should list all missing sections', () => {
      const content = '# FC: Test\n## Objective\nTest';
      const result = core.validateContract(content);
      expect(result.errors).toContain('Missing section: Scope');
      expect(result.errors).toContain('Missing section: Directories');
      expect(result.errors).toContain('Missing section: Files');
      expect(result.errors).toContain('Missing section: Done When');
    });

    it('should pass when all required sections present', () => {
      const content = `# FC: Test
## Objective
Test objective

## Scope
- Item 1

## Directories
**Allowed:** src/

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | src/test.ts | Test |

## Done When
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes

## Security Considerations
- [ ] Input validation

## Testing
- Unit tests`;

      const result = core.validateContract(content);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Restricted Directories', () => {
    const baseContent = `## Objective
Test
## Scope
- Item
## Directories
**Allowed:** src/
## Done When
- [ ] Done`;

    it('should fail when using node_modules in files', () => {
      const content = `${baseContent}
## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | node_modules/pkg/index.js | Hack |`;

      const result = core.validateContract(content);
      expect(result.errors).toContain('Restricted directory in files: node_modules/');
    });

    it('should fail when using .env in files', () => {
      const content = `${baseContent}
## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | .env | Secrets |`;

      const result = core.validateContract(content);
      expect(result.errors).toContain('Restricted directory in files: .env');
    });

    it('should fail when using backend/ in files', () => {
      const content = `${baseContent}
## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | backend/api.js | API |`;

      const result = core.validateContract(content);
      expect(result.errors).toContain('Restricted directory in files: backend/');
    });
  });

  describe('Banned Dependencies', () => {
    const baseContent = `## Objective
Test
## Scope
- Item
## Directories
**Allowed:** src/
## Files
| Action | Path |
## Done When
- [ ] Done`;

    it('should fail when allowing moment', () => {
      const content = `${baseContent}
## Dependencies
- Allowed: moment, react`;

      const result = core.validateContract(content);
      expect(result.errors).toContain('Banned dependency: moment');
    });

    it('should fail when allowing lodash', () => {
      const content = `${baseContent}
## Dependencies
- Allowed: lodash`;

      const result = core.validateContract(content);
      expect(result.errors).toContain('Banned dependency: lodash');
    });

    it('should fail when allowing jquery', () => {
      const content = `${baseContent}
## Dependencies
- Allowed: jquery`;

      const result = core.validateContract(content);
      expect(result.errors).toContain('Banned dependency: jquery');
    });
  });

  describe('Vague Terms Detection', () => {
    const baseContent = `## Scope
- Item
## Directories
**Allowed:** src/
## Files
| Action | Path |
## Done When
- [ ] Done`;

    it('should warn about "improve" in objective', () => {
      const content = `## Objective
Improve the performance
${baseContent}`;

      const result = core.validateContract(content);
      expect(result.warnings.some(w => w.includes('improve'))).toBe(true);
    });

    it('should warn about "optimize" in objective', () => {
      const content = `## Objective
Optimize loading times
${baseContent}`;

      const result = core.validateContract(content);
      expect(result.warnings.some(w => w.includes('optimize'))).toBe(true);
    });

    it('should warn about vague terms in scope', () => {
      const content = `## Objective
Test
## Scope
- Enhance user experience
## Directories
**Allowed:** src/
## Files
| Action | Path |
## Done When
- [ ] Done`;

      const result = core.validateContract(content);
      expect(result.warnings.some(w => w.includes('enhance'))).toBe(true);
    });
  });

  describe('Scope Size', () => {
    it('should error when scope has more than 7 items', () => {
      const content = `## Objective
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
## Done When
- [ ] Done`;

      const result = core.validateContract(content);
      expect(result.errors.some(e => e.includes('Scope too large'))).toBe(true);
    });

    it('should warn when scope has 6-7 items', () => {
      const content = `## Objective
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
## Done When
- [ ] Done`;

      const result = core.validateContract(content);
      expect(result.warnings.some(w => w.includes('Large scope'))).toBe(true);
    });
  });

  describe('Placeholder Detection', () => {
    it('should fail when [NAME] placeholder not filled', () => {
      const content = `# FC: [NAME]
## Objective
Test
## Scope
- Item
## Directories
**Allowed:** src/
## Files
| Action | Path |
## Done When
- [ ] Done`;

      const result = core.validateContract(content);
      expect(result.errors).toContain('Placeholder not filled: [NAME]');
    });

    it('should fail when [TODO] placeholder exists', () => {
      const content = `## Objective
[TODO] Add description
## Scope
- Item
## Directories
**Allowed:** src/
## Files
| Action | Path |
## Done When
- [ ] Done`;

      const result = core.validateContract(content);
      expect(result.errors).toContain('Placeholder not filled: [TODO]');
    });

    it('should detect multiple placeholders', () => {
      const content = `# FC: [NAME]
## Objective
[TBD]
## Scope
- [FILL]
## Directories
**Allowed:** src/
## Files
| Action | Path |
## Done When
- [ ] Done`;

      const result = core.validateContract(content);
      expect(result.errors).toContain('Placeholder not filled: [NAME]');
      expect(result.errors).toContain('Placeholder not filled: [TBD]');
      expect(result.errors).toContain('Placeholder not filled: [FILL]');
    });
  });

  describe('Security Section', () => {
    const baseContent = `## Objective
Test
## Scope
- Item
## Directories
**Allowed:** src/
## Files
| Action | Path |
## Done When
- [ ] Done`;

    it('should warn when security section missing', () => {
      const result = core.validateContract(baseContent);
      expect(result.warnings).toContain('Missing Security Considerations section');
      expect(result.stats.hasSecuritySection).toBe(false);
    });

    it('should not warn when security section present', () => {
      const content = `${baseContent}
## Security Considerations
- [ ] Input validation`;

      const result = core.validateContract(content);
      expect(result.warnings).not.toContain('Missing Security Considerations section');
      expect(result.stats.hasSecuritySection).toBe(true);
    });

    it('should require security section for auth-related features', () => {
      const content = `## Objective
Implement user authentication
## Scope
- Login flow
## Directories
**Allowed:** src/
## Files
| Action | Path |
## Done When
- [ ] Done`;

      const result = core.validateContract(content);
      expect(result.errors.some(e => e.includes('Security-sensitive feature'))).toBe(true);
    });
  });

  describe('Coverage Requirement', () => {
    const baseContent = `## Objective
Test
## Scope
- Item
## Directories
**Allowed:** src/
## Files
| Action | Path |`;

    it('should warn when 80% coverage not mentioned', () => {
      const content = `${baseContent}
## Done When
- [ ] Tests pass`;

      const result = core.validateContract(content);
      expect(result.warnings).toContain('Done When should include 80%+ coverage requirement');
    });

    it('should not warn when 80% coverage is mentioned', () => {
      const content = `${baseContent}
## Done When
- [ ] Tests pass (80%+ coverage)`;

      const result = core.validateContract(content);
      expect(result.warnings).not.toContain('Done When should include 80%+ coverage requirement');
    });

    it('should accept 80+ as coverage format', () => {
      const content = `${baseContent}
## Done When
- [ ] Tests pass (80+ coverage)`;

      const result = core.validateContract(content);
      expect(result.warnings).not.toContain('Done When should include 80%+ coverage requirement');
    });
  });

  describe('Lint Requirement', () => {
    it('should warn when lint check not mentioned', () => {
      const content = `## Objective
Test
## Scope
- Item
## Directories
**Allowed:** src/
## Files
| Action | Path |
## Done When
- [ ] Tests pass`;

      const result = core.validateContract(content);
      expect(result.warnings).toContain('Done When should include lint check');
    });
  });

  describe('Test Files', () => {
    it('should warn when no test files in Files section', () => {
      const content = `## Objective
Test
## Scope
- Item
## Directories
**Allowed:** src/
## Files
| Action | Path | Reason |
|--------|------|--------|
| create | src/main.ts | Main |
## Done When
- [ ] Done`;

      const result = core.validateContract(content);
      expect(result.warnings).toContain('No test files in Files section');
    });

    it('should not warn when test files present', () => {
      const content = `## Objective
Test
## Scope
- Item
## Directories
**Allowed:** src/
## Files
| Action | Path | Reason |
|--------|------|--------|
| create | src/test.ts | Tests |
## Done When
- [ ] Done`;

      const result = core.validateContract(content);
      expect(result.warnings).not.toContain('No test files in Files section');
    });
  });

  describe('Stats', () => {
    it('should return correct stats', () => {
      const content = `## Objective
Test
## Scope
- Item 1
- Item 2
- Item 3
## Directories
**Allowed:** src/
## Files
| Action | Path | Reason |
|--------|------|--------|
| create | src/a.ts | A |
| create | src/b.ts | B |
## Done When
- [ ] Done 1
- [ ] Done 2
## Security Considerations
- [ ] Security check`;

      const result = core.validateContract(content);
      expect(result.stats.scopeItems).toBe(3);
      expect(result.stats.fileCount).toBe(2);
      expect(result.stats.checkboxCount).toBe(2);
      expect(result.stats.hasSecuritySection).toBe(true);
    });
  });
});

// ============================================================================
// AGENTS
// ============================================================================

describe('Agent Functions', () => {
  describe('loadAgent', () => {
    it('should load agent by name', () => {
      const agent = core.loadAgent(AGENTS_DIR, 'contract-architect');
      expect(agent).not.toBeNull();
      expect(agent.agent.metadata.name).toBe('Archie');
    });

    it('should load agent by alias', () => {
      const agent = core.loadAgent(AGENTS_DIR, 'architect');
      expect(agent).not.toBeNull();
      expect(agent.agent.metadata.name).toBe('Archie');
    });

    it('should return null for non-existent agent', () => {
      const agent = core.loadAgent(AGENTS_DIR, 'nonexistent');
      expect(agent).toBeNull();
    });

    it('should load all standard agents', () => {
      const agents = ['architect', 'validator', 'strategist', 'dev', 'auditor', 'quick'];
      agents.forEach(alias => {
        const agent = core.loadAgent(AGENTS_DIR, alias);
        expect(agent).not.toBeNull();
      });
    });
  });

  describe('listAgents', () => {
    it('should list all agents', () => {
      const agents = core.listAgents(AGENTS_DIR);
      expect(agents.length).toBe(6);
    });

    it('should return agent metadata', () => {
      const agents = core.listAgents(AGENTS_DIR);
      agents.forEach(a => {
        expect(a.name).toBeDefined();
        expect(a.title).toBeDefined();
        expect(a.icon).toBeDefined();
      });
    });

    it('should return empty array for non-existent dir', () => {
      const agents = core.listAgents('/nonexistent');
      expect(agents).toHaveLength(0);
    });
  });
});

// ============================================================================
// WORKFLOWS
// ============================================================================

describe('Workflow Functions', () => {
  describe('loadWorkflow', () => {
    it('should load workflow by name', () => {
      const wf = core.loadWorkflow(WORKFLOWS_DIR, 'create-contract/workflow.yaml');
      expect(wf).not.toBeNull();
      expect(wf.name).toBe('create-contract');
    });

    it('should return null for non-existent workflow', () => {
      const wf = core.loadWorkflow(WORKFLOWS_DIR, 'nonexistent/workflow.yaml');
      expect(wf).toBeNull();
    });
  });

  describe('listWorkflows', () => {
    it('should list all workflows', () => {
      const workflows = core.listWorkflows(WORKFLOWS_DIR);
      expect(workflows.length).toBeGreaterThan(0);
    });

    it('should include workflow metadata', () => {
      const workflows = core.listWorkflows(WORKFLOWS_DIR);
      const createContract = workflows.find(w => w.name === 'create-contract');
      expect(createContract).toBeDefined();
      expect(createContract.description).toBeDefined();
    });
  });
});

// ============================================================================
// PROGRESS
// ============================================================================

describe('Progress Functions', () => {
  describe('saveProgress', () => {
    it('should save progress to file', () => {
      const progressDir = path.join(tempDir, '.progress');
      const file = core.saveProgress(progressDir, 'test-workflow', { step: 1 });
      expect(fs.existsSync(file)).toBe(true);
    });

    it('should create progress directory if not exists', () => {
      const progressDir = path.join(tempDir, '.newprogress');
      core.saveProgress(progressDir, 'test', { step: 1 });
      expect(fs.existsSync(progressDir)).toBe(true);
    });
  });

  describe('loadProgress', () => {
    it('should load saved progress', () => {
      const progressDir = path.join(tempDir, '.progress');
      core.saveProgress(progressDir, 'test', { step: 2 });
      const progress = core.loadProgress(progressDir, 'test');
      expect(progress.data.step).toBe(2);
    });

    it('should return null for non-existent progress', () => {
      const progress = core.loadProgress(tempDir, 'nonexistent');
      expect(progress).toBeNull();
    });
  });

  describe('clearProgress', () => {
    it('should delete progress file', () => {
      const progressDir = path.join(tempDir, '.progress');
      core.saveProgress(progressDir, 'test', { step: 1 });
      core.clearProgress(progressDir, 'test');
      expect(core.loadProgress(progressDir, 'test')).toBeNull();
    });

    it('should handle non-existent file gracefully', () => {
      expect(() => core.clearProgress(tempDir, 'nonexistent')).not.toThrow();
    });
  });

  describe('listProgress', () => {
    it('should list all progress files', () => {
      const progressDir = path.join(tempDir, '.progress');
      core.saveProgress(progressDir, 'workflow1', { step: 1 });
      core.saveProgress(progressDir, 'workflow2', { step: 2 });
      const list = core.listProgress(progressDir);
      expect(list.length).toBe(2);
    });

    it('should return empty for non-existent dir', () => {
      const list = core.listProgress('/nonexistent');
      expect(list).toHaveLength(0);
    });
  });
});

// ============================================================================
// CONTRACTS
// ============================================================================

describe('Contract Functions', () => {
  describe('createContract', () => {
    it('should create contract file', () => {
      const contractsDir = path.join(tempDir, 'contracts');
      const result = core.createContract(TEMPLATES_DIR, contractsDir, 'Test Feature');
      expect(fs.existsSync(result.filePath)).toBe(true);
      expect(result.fileName).toBe('test-feature.fc.md');
      expect(result.id).toMatch(/^FC-\d+$/);
    });

    it('should throw if contract already exists', () => {
      const contractsDir = path.join(tempDir, 'contracts');
      core.createContract(TEMPLATES_DIR, contractsDir, 'Test');
      expect(() => core.createContract(TEMPLATES_DIR, contractsDir, 'Test'))
        .toThrow('Contract already exists');
    });

    it('should throw if template not found', () => {
      const contractsDir = path.join(tempDir, 'contracts');
      expect(() => core.createContract(TEMPLATES_DIR, contractsDir, 'Test', 'nonexistent'))
        .toThrow('Template not found');
    });

    it('should use ui-component template', () => {
      const contractsDir = path.join(tempDir, 'contracts');
      core.createContract(TEMPLATES_DIR, contractsDir, 'Button', 'ui-component');
      const content = fs.readFileSync(path.join(contractsDir, 'button.fc.md'), 'utf8');
      expect(content).toContain('UI component');
    });
  });

  describe('resolveContract', () => {
    it('should resolve existing file path', () => {
      const contractsDir = path.join(tempDir, 'contracts');
      core.createContract(TEMPLATES_DIR, contractsDir, 'Test');
      const resolved = core.resolveContract(contractsDir, 'test.fc.md');
      expect(resolved).toContain('test.fc.md');
    });

    it('should add .fc.md extension', () => {
      const contractsDir = path.join(tempDir, 'contracts');
      core.createContract(TEMPLATES_DIR, contractsDir, 'Test');
      const resolved = core.resolveContract(contractsDir, 'test');
      expect(resolved).toContain('test.fc.md');
    });

    it('should throw for non-existent file', () => {
      expect(() => core.resolveContract(tempDir, 'nonexistent'))
        .toThrow('Contract not found');
    });

    it('should throw for empty file', () => {
      expect(() => core.resolveContract(tempDir, ''))
        .toThrow('No file specified');
    });
  });
});

// ============================================================================
// FILE SYSTEM INTEGRITY
// ============================================================================

describe('File System Integrity', () => {
  describe('Templates', () => {
    it('should have all required templates', () => {
      const templates = ['contract.md', 'ui-component.md', 'api-endpoint.md', 'bug-fix.md', 'refactor.md', 'integration.md'];
      templates.forEach(t => {
        expect(fs.existsSync(path.join(TEMPLATES_DIR, t))).toBe(true);
      });
    });

    it('all templates should have security section', () => {
      const templates = fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.md'));
      templates.forEach(t => {
        const content = fs.readFileSync(path.join(TEMPLATES_DIR, t), 'utf8');
        // Main contract template should have security
        if (t === 'contract.md') {
          expect(content).toContain('## Security Considerations');
        }
      });
    });

    it('templates should require 80% coverage', () => {
      const content = fs.readFileSync(path.join(TEMPLATES_DIR, 'contract.md'), 'utf8');
      expect(content).toContain('80%');
    });
  });

  describe('Documentation', () => {
    it('should have security documentation', () => {
      expect(fs.existsSync(path.join(PKG_ROOT, 'docs', 'SECURITY.md'))).toBe(true);
    });

    it('should have best practices documentation', () => {
      expect(fs.existsSync(path.join(PKG_ROOT, 'docs', 'BEST_PRACTICES.md'))).toBe(true);
    });

    it('security doc should mention OWASP', () => {
      const content = fs.readFileSync(path.join(PKG_ROOT, 'docs', 'SECURITY.md'), 'utf8');
      expect(content).toContain('OWASP');
    });

    it('security doc should mention CVE', () => {
      const content = fs.readFileSync(path.join(PKG_ROOT, 'docs', 'SECURITY.md'), 'utf8');
      expect(content).toContain('CVE');
    });
  });
});
