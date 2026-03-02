/**
 * Grabby - Multi-repo Module Tests
 * Comprehensive regression tests for monorepo/workspace support
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const multiRepo = require('../lib/multi-repo.cjs');

describe('Multi-repo Module', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-multirepo-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('detectWorkspaceType', () => {
    it('should return null for non-workspace directory', () => {
      const result = multiRepo.detectWorkspaceType(tempDir);

      expect(result).toBeNull();
    });

    it('should detect lerna monorepo', () => {
      fs.writeFileSync(
        path.join(tempDir, 'lerna.json'),
        JSON.stringify({ version: '1.0.0' }),
        'utf8'
      );

      const result = multiRepo.detectWorkspaceType(tempDir);

      expect(result).not.toBeNull();
      expect(result.type).toBe('lerna');
      expect(result.indicator).toBe('lerna.json');
    });

    it('should detect nx monorepo', () => {
      fs.writeFileSync(
        path.join(tempDir, 'nx.json'),
        JSON.stringify({}),
        'utf8'
      );

      const result = multiRepo.detectWorkspaceType(tempDir);

      expect(result).not.toBeNull();
      expect(result.type).toBe('nx');
    });

    it('should detect turborepo', () => {
      fs.writeFileSync(
        path.join(tempDir, 'turbo.json'),
        JSON.stringify({}),
        'utf8'
      );

      const result = multiRepo.detectWorkspaceType(tempDir);

      expect(result).not.toBeNull();
      expect(result.type).toBe('turbo');
    });

    it('should detect pnpm workspaces', () => {
      fs.writeFileSync(
        path.join(tempDir, 'pnpm-workspace.yaml'),
        'packages:\n  - packages/*',
        'utf8'
      );

      const result = multiRepo.detectWorkspaceType(tempDir);

      expect(result).not.toBeNull();
      expect(result.type).toBe('pnpm');
    });

    it('should detect rush monorepo', () => {
      fs.writeFileSync(
        path.join(tempDir, 'rush.json'),
        JSON.stringify({}),
        'utf8'
      );

      const result = multiRepo.detectWorkspaceType(tempDir);

      expect(result).not.toBeNull();
      expect(result.type).toBe('rush');
    });

    it('should detect npm workspaces in package.json', () => {
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          name: 'root',
          workspaces: ['packages/*']
        }),
        'utf8'
      );

      const result = multiRepo.detectWorkspaceType(tempDir);

      expect(result).not.toBeNull();
      expect(result.type).toBe('npm');
      expect(result.indicator).toBe('package.json workspaces');
    });

    it('should handle invalid package.json gracefully', () => {
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        'invalid json',
        'utf8'
      );

      const result = multiRepo.detectWorkspaceType(tempDir);

      expect(result).toBeNull();
    });
  });

  describe('findWorkspacePackages', () => {
    it('should return empty array for non-workspace', () => {
      const result = multiRepo.findWorkspacePackages(tempDir);

      expect(result).toEqual([]);
    });

    it('should find packages in npm workspace', () => {
      // Setup npm workspace
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          name: 'root',
          workspaces: ['packages/*']
        }),
        'utf8'
      );

      // Create a package
      const pkgDir = path.join(tempDir, 'packages', 'my-pkg');
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(pkgDir, 'package.json'),
        JSON.stringify({
          name: '@scope/my-pkg',
          version: '1.0.0'
        }),
        'utf8'
      );

      const result = multiRepo.findWorkspacePackages(tempDir);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('@scope/my-pkg');
      expect(result[0].version).toBe('1.0.0');
    });

    it('should return package paths', () => {
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          name: 'root',
          workspaces: ['packages/*']
        }),
        'utf8'
      );

      const pkgDir = path.join(tempDir, 'packages', 'pkg-a');
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(pkgDir, 'package.json'),
        JSON.stringify({ name: 'pkg-a', version: '1.0.0' }),
        'utf8'
      );

      const result = multiRepo.findWorkspacePackages(tempDir);

      expect(result[0].path).toContain('pkg-a');
      expect(result[0].relativePath).toBe(path.join('packages', 'pkg-a'));
    });

    it('should detect private packages', () => {
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          name: 'root',
          workspaces: ['packages/*']
        }),
        'utf8'
      );

      const pkgDir = path.join(tempDir, 'packages', 'private-pkg');
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(pkgDir, 'package.json'),
        JSON.stringify({ name: 'private-pkg', version: '1.0.0', private: true }),
        'utf8'
      );

      const result = multiRepo.findWorkspacePackages(tempDir);

      expect(result[0].private).toBe(true);
    });

    it('should handle missing packages directory', () => {
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          name: 'root',
          workspaces: ['nonexistent/*']
        }),
        'utf8'
      );

      const result = multiRepo.findWorkspacePackages(tempDir);

      expect(result).toEqual([]);
    });

    it('should skip directories without package.json', () => {
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          name: 'root',
          workspaces: ['packages/*']
        }),
        'utf8'
      );

      const pkgDir = path.join(tempDir, 'packages', 'no-pkg-json');
      fs.mkdirSync(pkgDir, { recursive: true });

      const result = multiRepo.findWorkspacePackages(tempDir);

      expect(result).toEqual([]);
    });
  });

  describe('getWorkspaceContext', () => {
    it('should return workspace info', () => {
      const result = multiRepo.getWorkspaceContext(tempDir);

      expect(result).toHaveProperty('isMonorepo');
      expect(result).toHaveProperty('root');
      expect(result).toHaveProperty('packages');
    });

    it('should detect non-workspace correctly', () => {
      const result = multiRepo.getWorkspaceContext(tempDir);

      expect(result.isMonorepo).toBe(false);
      expect(result.packages).toEqual([]);
    });

    it('should detect workspace correctly', () => {
      fs.writeFileSync(
        path.join(tempDir, 'lerna.json'),
        JSON.stringify({ version: '1.0.0', packages: ['packages/*'] }),
        'utf8'
      );

      const result = multiRepo.getWorkspaceContext(tempDir);

      expect(result.isMonorepo).toBe(true);
      expect(result.type).toBe('lerna');
    });
  });

  describe('findAllContracts', () => {
    it('should find contracts in root directory', () => {
      const contractsDir = path.join(tempDir, 'contracts');
      fs.mkdirSync(contractsDir, { recursive: true });
      fs.writeFileSync(
        path.join(contractsDir, 'test.fc.md'),
        '# FC: Test',
        'utf8'
      );

      const result = multiRepo.findAllContracts(tempDir);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].file).toBe('test.fc.md');
    });

    it('should find contracts in workspace packages', () => {
      // Setup workspace
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          name: 'root',
          workspaces: ['packages/*']
        }),
        'utf8'
      );

      // Create package with contract
      const pkgDir = path.join(tempDir, 'packages', 'my-pkg');
      const pkgContracts = path.join(pkgDir, 'contracts');
      fs.mkdirSync(pkgContracts, { recursive: true });
      fs.writeFileSync(
        path.join(pkgDir, 'package.json'),
        JSON.stringify({ name: 'my-pkg', version: '1.0.0' }),
        'utf8'
      );
      fs.writeFileSync(
        path.join(pkgContracts, 'pkg-feature.fc.md'),
        '# FC: Pkg Feature',
        'utf8'
      );

      const result = multiRepo.findAllContracts(tempDir);

      expect(result.some(c => c.file === 'pkg-feature.fc.md')).toBe(true);
    });

    it('should include package info for workspace contracts', () => {
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({
          name: 'root',
          workspaces: ['packages/*']
        }),
        'utf8'
      );

      const pkgDir = path.join(tempDir, 'packages', 'my-pkg');
      const pkgContracts = path.join(pkgDir, 'contracts');
      fs.mkdirSync(pkgContracts, { recursive: true });
      fs.writeFileSync(
        path.join(pkgDir, 'package.json'),
        JSON.stringify({ name: '@scope/my-pkg', version: '1.0.0' }),
        'utf8'
      );
      fs.writeFileSync(
        path.join(pkgContracts, 'feature.fc.md'),
        '# FC: Feature',
        'utf8'
      );

      const result = multiRepo.findAllContracts(tempDir);
      const pkgContract = result.find(c => c.file === 'feature.fc.md');

      expect(pkgContract).toBeDefined();
      expect(pkgContract.package).toBe('@scope/my-pkg');
    });
  });

  describe('formatWorkspaceInfo', () => {
    it('should format non-workspace info', () => {
      const context = {
        isMonorepo: false,
        root: tempDir,
        packages: []
      };

      const result = multiRepo.formatWorkspaceInfo(context);

      expect(result).toContain('not a monorepo');
    });

    it('should format workspace info with packages', () => {
      const context = {
        isMonorepo: true,
        type: 'npm',
        root: tempDir,
        packages: [
          { name: 'pkg-a', relativePath: 'packages/pkg-a', version: '1.0.0' },
          { name: 'pkg-b', relativePath: 'packages/pkg-b', version: '2.0.0' }
        ]
      };

      const result = multiRepo.formatWorkspaceInfo(context);

      expect(result).toContain('Monorepo');
      expect(result).toContain('pkg-a');
      expect(result).toContain('pkg-b');
    });
  });

  describe('WORKSPACE_TYPES constant', () => {
    it('should have expected workspace types', () => {
      expect(multiRepo.WORKSPACE_TYPES).toHaveProperty('npm');
      expect(multiRepo.WORKSPACE_TYPES).toHaveProperty('yarn');
      expect(multiRepo.WORKSPACE_TYPES).toHaveProperty('pnpm');
      expect(multiRepo.WORKSPACE_TYPES).toHaveProperty('lerna');
      expect(multiRepo.WORKSPACE_TYPES).toHaveProperty('nx');
      expect(multiRepo.WORKSPACE_TYPES).toHaveProperty('turbo');
      expect(multiRepo.WORKSPACE_TYPES).toHaveProperty('rush');
    });
  });
});
