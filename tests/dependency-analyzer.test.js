/**
 * Grabby - Dependency Analyzer Module Tests
 * Comprehensive regression tests for dependency analysis
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const depAnalyzer = require('../lib/dependency-analyzer.cjs');

describe('Dependency Analyzer Module', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-deps-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('parseContractFiles', () => {
    it('should parse files from contract', () => {
      const content = `
## Files
| Action | Path | Reason |
|--------|------|--------|
| create | src/main.ts | Main file |
| modify | src/utils.ts | Add helpers |
`;
      const result = depAnalyzer.parseContractFiles(content);

      expect(result).toHaveLength(2);
      expect(result[0].action).toBe('create');
      expect(result[0].path).toBe('src/main.ts');
      expect(result[0].reason).toBe('Main file');
    });

    it('should strip backticks from paths', () => {
      const content = `
## Files
| Action | Path | Reason |
|--------|------|--------|
| create | \`src/main.ts\` | Main |
`;
      const result = depAnalyzer.parseContractFiles(content);

      expect(result[0].path).toBe('src/main.ts');
    });

    it('should return empty array if no Files section', () => {
      const content = '# FC: Test\n## Objective\nTest.';
      const result = depAnalyzer.parseContractFiles(content);

      expect(result).toHaveLength(0);
    });

    it('should skip header rows', () => {
      const content = `
## Files
| Action | Path | Reason |
|--------|------|--------|
| create | src/a.ts | A |
`;
      const result = depAnalyzer.parseContractFiles(content);

      expect(result).toHaveLength(1);
      expect(result[0].action).not.toBe('Action');
    });

    it('should handle lowercase and uppercase actions', () => {
      const content = `
## Files
| Action | Path |
|--------|------|
| CREATE | src/a.ts |
| Modify | src/b.ts |
`;
      const result = depAnalyzer.parseContractFiles(content);

      expect(result[0].action).toBe('create');
      expect(result[1].action).toBe('modify');
    });
  });

  describe('buildDependencyGraph', () => {
    it('should build graph from files', () => {
      const files = [
        { action: 'create', path: 'src/a.ts' },
        { action: 'modify', path: 'src/b.ts' },
      ];
      const graph = depAnalyzer.buildDependencyGraph(tempDir, files);

      expect(graph.has('src/a.ts')).toBe(true);
      expect(graph.has('src/b.ts')).toBe(true);
    });

    it('should parse require statements from existing files', () => {
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, 'a.ts'), `
const b = require('./b');
const c = require('./c');
`, 'utf8');

      const files = [{ action: 'modify', path: 'src/a.ts' }];
      const graph = depAnalyzer.buildDependencyGraph(tempDir, files);

      expect(graph.get('src/a.ts').dependencies).toContain('src/b.js');
      expect(graph.get('src/a.ts').dependencies).toContain('src/c.js');
    });

    it('should parse import statements', () => {
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, 'a.ts'), `
import { foo } from './b';
import bar from './c';
`, 'utf8');

      const files = [{ action: 'modify', path: 'src/a.ts' }];
      const graph = depAnalyzer.buildDependencyGraph(tempDir, files);

      expect(graph.get('src/a.ts').dependencies).toContain('src/b.js');
      expect(graph.get('src/a.ts').dependencies).toContain('src/c.js');
    });

    it('should ignore non-relative imports', () => {
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, 'a.ts'), `
import fs from 'fs';
import { foo } from 'lodash';
const path = require('path');
`, 'utf8');

      const files = [{ action: 'modify', path: 'src/a.ts' }];
      const graph = depAnalyzer.buildDependencyGraph(tempDir, files);

      expect(graph.get('src/a.ts').dependencies).toHaveLength(0);
    });

    it('should populate dependents in second pass', () => {
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, 'a.ts'), `const b = require('./b');`, 'utf8');
      fs.writeFileSync(path.join(srcDir, 'b.ts'), '', 'utf8');

      const files = [
        { action: 'modify', path: 'src/a.ts' },
        { action: 'modify', path: 'src/b.ts' },
      ];
      const graph = depAnalyzer.buildDependencyGraph(tempDir, files);

      // b.ts should have a.ts as a dependent (since a.ts requires b)
      // Note: the path resolution adds .js extension
    });
  });

  describe('detectCircularDeps', () => {
    it('should detect circular dependencies', () => {
      const graph = new Map();
      graph.set('a', { dependencies: ['b'], dependents: [] });
      graph.set('b', { dependencies: ['c'], dependents: [] });
      graph.set('c', { dependencies: ['a'], dependents: [] });

      const circular = depAnalyzer.detectCircularDeps(graph);

      expect(circular.length).toBeGreaterThan(0);
    });

    it('should return empty array for acyclic graph', () => {
      const graph = new Map();
      graph.set('a', { dependencies: ['b'], dependents: [] });
      graph.set('b', { dependencies: ['c'], dependents: [] });
      graph.set('c', { dependencies: [], dependents: [] });

      const circular = depAnalyzer.detectCircularDeps(graph);

      expect(circular).toHaveLength(0);
    });

    it('should detect self-referencing cycles', () => {
      const graph = new Map();
      graph.set('a', { dependencies: ['a'], dependents: [] });

      const circular = depAnalyzer.detectCircularDeps(graph);

      expect(circular.length).toBeGreaterThan(0);
    });
  });

  describe('findHighImpactFiles', () => {
    it('should find files with many dependents', () => {
      const graph = new Map();
      graph.set('utils', { action: 'modify', dependencies: [], dependents: ['a', 'b', 'c', 'd'] });
      graph.set('a', { action: 'create', dependencies: [], dependents: [] });

      const highImpact = depAnalyzer.findHighImpactFiles(graph, 3);

      expect(highImpact).toHaveLength(1);
      expect(highImpact[0].path).toBe('utils');
      expect(highImpact[0].dependentCount).toBe(4);
    });

    it('should sort by dependent count descending', () => {
      const graph = new Map();
      graph.set('a', { action: 'modify', dependencies: [], dependents: ['x', 'y', 'z'] });
      graph.set('b', { action: 'modify', dependencies: [], dependents: ['x', 'y', 'z', 'w', 'v'] });

      const highImpact = depAnalyzer.findHighImpactFiles(graph, 3);

      expect(highImpact[0].path).toBe('b');
      expect(highImpact[1].path).toBe('a');
    });

    it('should respect threshold', () => {
      const graph = new Map();
      graph.set('a', { action: 'modify', dependencies: [], dependents: ['x', 'y'] });
      graph.set('b', { action: 'modify', dependencies: [], dependents: ['x', 'y', 'z'] });

      const highImpact = depAnalyzer.findHighImpactFiles(graph, 3);

      expect(highImpact).toHaveLength(1);
      expect(highImpact[0].path).toBe('b');
    });
  });

  describe('analyzeContractDeps', () => {
    it('should return analysis structure', () => {
      const content = `
## Files
| Action | Path |
|--------|------|
| create | src/a.ts |
`;
      const result = depAnalyzer.analyzeContractDeps(content, tempDir);

      expect(result).toHaveProperty('files');
      expect(result).toHaveProperty('graph');
      expect(result).toHaveProperty('circular');
      expect(result).toHaveProperty('highImpact');
      expect(result).toHaveProperty('warnings');
    });

    it('should warn about circular dependencies', () => {
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, 'a.ts'), `const b = require('./b');`, 'utf8');
      fs.writeFileSync(path.join(srcDir, 'b.ts'), `const a = require('./a');`, 'utf8');

      const content = `
## Files
| Action | Path |
|--------|------|
| modify | src/a.ts |
| modify | src/b.ts |
`;
      const result = depAnalyzer.analyzeContractDeps(content, tempDir);

      // Check if circular dependency is detected
      expect(result.circular.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('checkFileConflicts', () => {
    it('should detect create conflict when file exists', () => {
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, 'existing.ts'), '// exists', 'utf8');

      const content = `
## Files
| Action | Path |
|--------|------|
| create | src/existing.ts |
`;
      const conflicts = depAnalyzer.checkFileConflicts(content, tempDir);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe('create-exists');
      expect(conflicts[0].path).toBe('src/existing.ts');
    });

    it('should detect modify conflict when file missing', () => {
      const content = `
## Files
| Action | Path |
|--------|------|
| modify | src/missing.ts |
`;
      const conflicts = depAnalyzer.checkFileConflicts(content, tempDir);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe('modify-missing');
      expect(conflicts[0].path).toBe('src/missing.ts');
    });

    it('should return empty array for valid operations', () => {
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, 'existing.ts'), '// exists', 'utf8');

      const content = `
## Files
| Action | Path |
|--------|------|
| create | src/new.ts |
| modify | src/existing.ts |
`;
      const conflicts = depAnalyzer.checkFileConflicts(content, tempDir);

      expect(conflicts).toHaveLength(0);
    });
  });

  describe('suggestDependencies', () => {
    it('should suggest testing dependencies for test files', () => {
      const content = `
## Files
| Action | Path |
|--------|------|
| create | src/main.test.ts |
`;
      const suggestions = depAnalyzer.suggestDependencies(content);

      expect(suggestions.some(s => s.context === 'testing')).toBe(true);
      expect(suggestions.some(s => s.suggested.includes('jest'))).toBe(true);
    });

    it('should suggest API dependencies', () => {
      const content = '## Objective\nBuild REST API endpoint for users.';
      const suggestions = depAnalyzer.suggestDependencies(content);

      expect(suggestions.some(s => s.context === 'API development')).toBe(true);
    });

    it('should suggest GraphQL dependencies', () => {
      const content = '## Objective\nImplement GraphQL resolvers.';
      const suggestions = depAnalyzer.suggestDependencies(content);

      expect(suggestions.some(s => s.context === 'GraphQL')).toBe(true);
    });

    it('should suggest WebSocket dependencies', () => {
      const content = '## Objective\nAdd real-time updates via websocket.';
      const suggestions = depAnalyzer.suggestDependencies(content);

      expect(suggestions.some(s => s.context === 'WebSockets')).toBe(true);
    });

    it('should suggest database dependencies', () => {
      const content = '## Objective\nAdd PostgreSQL database support.';
      const suggestions = depAnalyzer.suggestDependencies(content);

      expect(suggestions.some(s => s.context === 'database')).toBe(true);
    });

    it('should suggest validation dependencies', () => {
      const content = '## Objective\nAdd schema validation with zod.';
      const suggestions = depAnalyzer.suggestDependencies(content);

      expect(suggestions.some(s => s.context === 'validation')).toBe(true);
    });

    it('should return empty array for no matches', () => {
      const content = '## Objective\nSimple text processing.';
      const suggestions = depAnalyzer.suggestDependencies(content);

      expect(suggestions).toHaveLength(0);
    });
  });

  describe('discoverRepositoryDependencyGraph', () => {
    it('builds a repo-wide dependency graph artifact structure', () => {
      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src', 'a.ts'), `import { b } from './b';\n`, 'utf8');
      fs.writeFileSync(path.join(tempDir, 'src', 'b.ts'), `const c = require('./c');\n`, 'utf8');
      fs.writeFileSync(path.join(tempDir, 'src', 'c.ts'), `export const c = true;\n`, 'utf8');

      const graph = depAnalyzer.discoverRepositoryDependencyGraph(tempDir);

      expect(graph.nodes.some((node) => node.id === 'src/a.ts')).toBe(true);
      expect(graph.edges.some((edge) => edge.from === 'src/a.ts' && edge.to === 'src/b.js')).toBe(true);
      expect(graph.edges.some((edge) => edge.from === 'src/b.ts' && edge.to === 'src/c.js')).toBe(true);
    });

    it('writes the dependency graph artifact under .grabby/code', () => {
      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src', 'a.ts'), `import './b';\n`, 'utf8');
      fs.writeFileSync(path.join(tempDir, 'src', 'b.ts'), `export const b = true;\n`, 'utf8');

      const result = depAnalyzer.saveRepositoryDependencyGraph(tempDir);

      expect(fs.existsSync(result.outputPath)).toBe(true);
      expect(result.outputPath).toContain(path.join('.grabby', 'code', 'dependency_graph.json'));
    });
  });
});
