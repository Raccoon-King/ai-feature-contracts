/**
 * Grabby - Contract Levels Module Tests
 * Comprehensive regression tests for system/project contract management
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('yaml');
const contractLevels = require('../lib/contract-levels.cjs');

describe('Contract Levels Module', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-levels-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('getContractLevel', () => {
    it('should detect system level from content', () => {
      const content = '**Status:** approved\n**Level:** system\n';
      expect(contractLevels.getContractLevel(content)).toBe('system');
    });

    it('should detect project level from content', () => {
      const content = '**Status:** approved\n**Level:** project\n';
      expect(contractLevels.getContractLevel(content)).toBe('project');
    });

    it('should be case insensitive', () => {
      const content = '**Level:** SYSTEM\n';
      expect(contractLevels.getContractLevel(content)).toBe('system');
    });

    it('should return null if no level marker', () => {
      const content = '**Status:** approved\n## Objective\nTest\n';
      expect(contractLevels.getContractLevel(content)).toBeNull();
    });
  });

  describe('detectLikelySystemContract', () => {
    it('should detect system indicators with high confidence', () => {
      const content = `
## Objective
Define security standards that apply to all projects.
Company-wide coding standards and best practices.
`;
      const result = contractLevels.detectLikelySystemContract(content);
      expect(result.likely).toBe('system');
      expect(result.confidence).toBe('high');
      expect(result.systemScore).toBeGreaterThan(result.projectScore);
    });

    it('should detect project indicators with high confidence', () => {
      const content = `
## Objective
This feature implements the login page.
Files: src/components/Login.tsx, api/auth.ts
`;
      const result = contractLevels.detectLikelySystemContract(content);
      expect(result.likely).toBe('project');
      expect(result.confidence).toBe('high');
      expect(result.projectScore).toBeGreaterThan(result.systemScore);
    });

    it('should return low confidence for borderline cases', () => {
      const content = `
## Objective
Implement security checks for this project.
`;
      const result = contractLevels.detectLikelySystemContract(content);
      expect(result.confidence).toBe('low');
    });

    it('should return none confidence when no indicators', () => {
      const content = `
## Objective
Simple task.
`;
      const result = contractLevels.detectLikelySystemContract(content);
      expect(result.confidence).toBe('none');
      expect(result.likely).toBeNull();
    });

    it('should detect organization-wide patterns', () => {
      const content = 'Organization-wide policy for code quality.';
      const result = contractLevels.detectLikelySystemContract(content);
      expect(result.systemScore).toBeGreaterThan(0);
    });

    it('should detect coding standard patterns', () => {
      const content = 'Coding standard for TypeScript projects.';
      const result = contractLevels.detectLikelySystemContract(content);
      expect(result.systemScore).toBeGreaterThan(0);
    });

    it('should detect style guide patterns', () => {
      const content = 'Style guide for React components.';
      const result = contractLevels.detectLikelySystemContract(content);
      expect(result.systemScore).toBeGreaterThan(0);
    });
  });

  describe('listProjectContracts', () => {
    function writeProjectContract(name, content) {
      const contractsDir = path.join(tempDir, 'contracts');
      fs.mkdirSync(contractsDir, { recursive: true });
      fs.writeFileSync(path.join(contractsDir, name), content, 'utf8');
    }

    it('should return empty array if no contracts directory', () => {
      const result = contractLevels.listProjectContracts(tempDir);
      expect(result).toEqual([]);
    });

    it('should list project contracts', () => {
      writeProjectContract('feature.fc.md', `# Feature Contract: Test Feature
**ID:** FC-001 | **Status:** approved

## Objective
Test feature.
`);

      const result = contractLevels.listProjectContracts(tempDir);
      expect(result).toHaveLength(1);
      expect(result[0].file).toBe('feature.fc.md');
      expect(result[0].id).toBe('FC-001');
      expect(result[0].status).toBe('approved');
      expect(result[0].level).toBe('project');
    });

    it('should only include .fc.md files', () => {
      const contractsDir = path.join(tempDir, 'contracts');
      fs.mkdirSync(contractsDir, { recursive: true });
      fs.writeFileSync(path.join(contractsDir, 'README.md'), '# Readme', 'utf8');
      fs.writeFileSync(path.join(contractsDir, 'test.fc.md'), '# FC: Test\n**ID:** FC-001', 'utf8');

      const result = contractLevels.listProjectContracts(tempDir);
      expect(result).toHaveLength(1);
      expect(result[0].file).toBe('test.fc.md');
    });

    it('should extract title from content', () => {
      writeProjectContract('login.fc.md', `# Feature Contract: Login Page
**ID:** FC-002 | **Status:** draft

## Objective
Implement login.
`);

      const result = contractLevels.listProjectContracts(tempDir);
      expect(result[0].title).toBe('Login Page');
    });

    it('should fallback to filename for missing metadata', () => {
      writeProjectContract('simple.fc.md', '# Simple Contract\nNo metadata here.\n');

      const result = contractLevels.listProjectContracts(tempDir);
      expect(result[0].id).toBe('simple');
      expect(result[0].status).toBe('unknown');
    });
  });

  describe('listAllContracts', () => {
    function writeProjectContract(name, content) {
      const contractsDir = path.join(tempDir, 'contracts');
      fs.mkdirSync(contractsDir, { recursive: true });
      fs.writeFileSync(path.join(contractsDir, name), content, 'utf8');
    }

    it('should return structure with system and project arrays', () => {
      const result = contractLevels.listAllContracts(tempDir);

      expect(result).toHaveProperty('system');
      expect(result).toHaveProperty('project');
      expect(result).toHaveProperty('all');
      expect(Array.isArray(result.system)).toBe(true);
      expect(Array.isArray(result.project)).toBe(true);
      expect(Array.isArray(result.all)).toBe(true);
    });

    it('should include project contracts', () => {
      writeProjectContract('test.fc.md', '# FC: Test\n**ID:** FC-001 | **Status:** draft');

      const result = contractLevels.listAllContracts(tempDir);

      expect(result.project).toHaveLength(1);
      expect(result.all.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getMergedContext', () => {
    function writeProjectContract(name, content) {
      const contractsDir = path.join(tempDir, 'contracts');
      fs.mkdirSync(contractsDir, { recursive: true });
      fs.writeFileSync(path.join(contractsDir, name), content, 'utf8');
    }

    it('should return default context structure', () => {
      const context = contractLevels.getMergedContext(tempDir);

      expect(context).toHaveProperty('security');
      expect(context).toHaveProperty('quality');
      expect(context).toHaveProperty('testing');
      expect(context).toHaveProperty('directories');
      expect(context).toHaveProperty('dependencies');
      expect(context).toHaveProperty('rules');
    });

    it('should have default restricted directories', () => {
      const context = contractLevels.getMergedContext(tempDir);

      expect(context.directories.restricted).toContain('node_modules/');
      expect(context.directories.restricted).toContain('.env');
    });

    it('should extract directory rules from contracts', () => {
      writeProjectContract('test.fc.md', `# FC: Test
**ID:** FC-001 | **Status:** draft

## Directories
**Allowed:** \`src/, tests/\`
**Restricted:** \`backend/, secrets/\`

## Objective
Test.
`);

      const context = contractLevels.getMergedContext(tempDir);

      expect(context.directories.allowed).toContain('src/');
      expect(context.directories.allowed).toContain('tests/');
      expect(context.directories.restricted).toContain('backend/');
      expect(context.directories.restricted).toContain('secrets/');
    });

    it('should extract security rules from contracts', () => {
      writeProjectContract('test.fc.md', `# FC: Test
**ID:** FC-001 | **Status:** draft

## Security Considerations
- [ ] Validate all inputs
- [x] Encode outputs

## Objective
Test.
`);

      const context = contractLevels.getMergedContext(tempDir);

      expect(context.security.length).toBeGreaterThan(0);
      expect(context.security.some(s => s.rule.includes('Validate all inputs'))).toBe(true);
    });

    it('should extract testing rules from contracts', () => {
      writeProjectContract('test.fc.md', `# FC: Test
**ID:** FC-001 | **Status:** draft

## Testing
- Unit: \`tests/unit.test.ts\`
- Integration: \`tests/integration.test.ts\`

## Objective
Test.
`);

      const context = contractLevels.getMergedContext(tempDir);

      expect(context.testing.length).toBeGreaterThan(0);
    });

    it('should deduplicate directory entries', () => {
      writeProjectContract('a.fc.md', `# FC: A
**ID:** FC-001 | **Status:** draft

## Directories
**Allowed:** \`src/\`
**Restricted:** \`secrets/\`

## Objective
A.
`);
      writeProjectContract('b.fc.md', `# FC: B
**ID:** FC-002 | **Status:** draft

## Directories
**Allowed:** \`src/\`
**Restricted:** \`secrets/\`

## Objective
B.
`);

      const context = contractLevels.getMergedContext(tempDir);

      const srcCount = context.directories.allowed.filter(d => d === 'src/').length;
      expect(srcCount).toBe(1);
    });
  });

  describe('shouldAskLevel', () => {
    it('should not ask if explicit level marker exists', () => {
      const content = '**Status:** draft\n**Level:** system\n';
      const result = contractLevels.shouldAskLevel(content);

      expect(result.ask).toBe(false);
      expect(result.level).toBe('system');
    });

    it('should not ask if high confidence detection', () => {
      const content = 'This is a company-wide coding standard that applies to all projects.';
      const result = contractLevels.shouldAskLevel(content);

      expect(result.ask).toBe(false);
      expect(result.detected).toBe(true);
    });

    it('should ask for borderline cases', () => {
      const content = '# Simple Feature\n## Objective\nDo something.';
      const result = contractLevels.shouldAskLevel(content);

      expect(result.ask).toBe(true);
      expect(result.detection).toBeDefined();
    });
  });

  describe('formatContractsList', () => {
    it('should return message for empty contracts', () => {
      const contracts = { system: [], project: [], all: [] };
      const result = contractLevels.formatContractsList(contracts);

      expect(result).toBe('No contracts found.');
    });

    it('should format project contracts', () => {
      const contracts = {
        system: [],
        project: [
          { id: 'FC-001', title: 'Test Feature', status: 'approved', level: 'project' }
        ],
        all: [
          { id: 'FC-001', title: 'Test Feature', status: 'approved', level: 'project' }
        ]
      };

      const result = contractLevels.formatContractsList(contracts);

      expect(result).toContain('Project Contracts');
      expect(result).toContain('FC-001');
      expect(result).toContain('Test Feature');
    });

    it('should show approved status with checkmark', () => {
      const contracts = {
        system: [],
        project: [
          { id: 'FC-001', title: 'Approved Feature', status: 'approved', level: 'project' }
        ],
        all: [
          { id: 'FC-001', title: 'Approved Feature', status: 'approved', level: 'project' }
        ]
      };

      const result = contractLevels.formatContractsList(contracts);

      // Should contain green checkmark escape code
      expect(result).toContain('\x1b[32m✓\x1b[0m');
    });

    it('should show non-approved status with circle', () => {
      const contracts = {
        system: [],
        project: [
          { id: 'FC-001', title: 'Draft Feature', status: 'draft', level: 'project' }
        ],
        all: [
          { id: 'FC-001', title: 'Draft Feature', status: 'draft', level: 'project' }
        ]
      };

      const result = contractLevels.formatContractsList(contracts);

      // Should contain yellow circle escape code
      expect(result).toContain('\x1b[33m○\x1b[0m');
    });

    it('should support groupByLevel option', () => {
      const contracts = {
        system: [
          { id: 'SYS-001', title: 'System Contract', status: 'approved', level: 'system' }
        ],
        project: [
          { id: 'FC-001', title: 'Project Contract', status: 'draft', level: 'project' }
        ],
        all: [
          { id: 'SYS-001', title: 'System Contract', status: 'approved', level: 'system' },
          { id: 'FC-001', title: 'Project Contract', status: 'draft', level: 'project' }
        ]
      };

      const result = contractLevels.formatContractsList(contracts, { groupByLevel: true });

      expect(result).toContain('System Contracts');
      expect(result).toContain('Project Contracts');
    });

    it('should support flat list without grouping', () => {
      const contracts = {
        system: [
          { id: 'SYS-001', title: 'System Contract', status: 'approved', level: 'system' }
        ],
        project: [
          { id: 'FC-001', title: 'Project Contract', status: 'draft', level: 'project' }
        ],
        all: [
          { id: 'SYS-001', title: 'System Contract', status: 'approved', level: 'system' },
          { id: 'FC-001', title: 'Project Contract', status: 'draft', level: 'project' }
        ]
      };

      const result = contractLevels.formatContractsList(contracts, { groupByLevel: false, showLevel: true });

      expect(result).toContain('FC-001');
      expect(result).toContain('SYS-001');
    });
  });

  describe('CONTRACT_LEVELS constant', () => {
    it('should have SYSTEM and PROJECT values', () => {
      expect(contractLevels.CONTRACT_LEVELS.SYSTEM).toBe('system');
      expect(contractLevels.CONTRACT_LEVELS.PROJECT).toBe('project');
    });
  });

  describe('addToSystemLevel', () => {
    it('should throw error for non-existent file', () => {
      expect(() => contractLevels.addToSystemLevel('/nonexistent/file.fc.md'))
        .toThrow('Contract not found');
    });
  });

  describe('removeFromSystemLevel', () => {
    it('should throw error for non-existent contract', () => {
      expect(() => contractLevels.removeFromSystemLevel('nonexistent.fc.md'))
        .toThrow('System contract not found');
    });
  });
});
