const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  collectFiles,
  detectSignals,
  proposeRulesets,
  formatProposals,
  getDetectionResults,
} = require('../../lib/rulesets/detector.cjs');
const {
  TECHNOLOGY_SIGNALS,
  matchGlob,
  checkSignal,
  calculateConfidence,
  hasPackageDep,
} = require('../../lib/rulesets/signals.cjs');

describe('signals', () => {
  describe('matchGlob', () => {
    it('matches exact file names', () => {
      expect(matchGlob('package.json', 'package.json')).toBe(true);
      expect(matchGlob('other.json', 'package.json')).toBe(false);
    });

    it('matches single wildcard', () => {
      expect(matchGlob('foo.ts', '*.ts')).toBe(true);
      expect(matchGlob('foo.js', '*.ts')).toBe(false);
    });

    it('matches double wildcard (globstar)', () => {
      expect(matchGlob('src/foo.ts', '**/*.ts')).toBe(true);
      expect(matchGlob('src/deep/nested/bar.ts', '**/*.ts')).toBe(true);
      expect(matchGlob('root.ts', '**/*.ts')).toBe(true);
    });

    it('matches directory patterns', () => {
      expect(matchGlob('src/components/Button.tsx', 'src/**/*.tsx')).toBe(true);
      expect(matchGlob('lib/components/Button.tsx', 'src/**/*.tsx')).toBe(false);
    });

    it('escapes regex metacharacters in literal path segments', () => {
      expect(matchGlob('src/file[1].ts', 'src/file[1].ts')).toBe(true);
      expect(matchGlob('src/file1.ts', 'src/file[1].ts')).toBe(false);
      expect(matchGlob('src\\nested\\file(1).ts', 'src\\**\\file(1).ts')).toBe(true);
    });
  });

  describe('checkSignal', () => {
    let testDir;

    beforeEach(() => {
      testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-signal-'));
    });

    afterEach(() => {
      fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('checks file existence', () => {
      fs.writeFileSync(path.join(testDir, 'package.json'), '{}');
      const files = ['package.json'];
      const result = checkSignal({ file: 'package.json' }, testDir, files);

      expect(result.matched).toBe(true);
      expect(result.matches).toContain('package.json');
    });

    it('checks file content', () => {
      fs.writeFileSync(path.join(testDir, 'test.csproj'), '<Project Sdk="Microsoft.AspNetCore.Sdk">');
      const files = ['test.csproj'];
      const result = checkSignal({ file: 'test.csproj', content: 'Microsoft.AspNetCore' }, testDir, files);

      expect(result.matched).toBe(true);
    });

    it('returns false when content does not match', () => {
      fs.writeFileSync(path.join(testDir, 'test.csproj'), '<Project Sdk="Something.Else">');
      const files = ['test.csproj'];
      const result = checkSignal({ file: 'test.csproj', content: 'Microsoft.AspNetCore' }, testDir, files);

      expect(result.matched).toBe(false);
    });

    it('checks glob patterns', () => {
      fs.writeFileSync(path.join(testDir, 'foo.sln'), '');
      const files = ['foo.sln', 'bar/baz.cs'];
      const result = checkSignal({ glob: '**/*.sln' }, testDir, files);

      expect(result.matched).toBe(true);
      expect(result.matches).toContain('foo.sln');
    });
  });

  describe('calculateConfidence', () => {
    it('returns 0 for no matches', () => {
      const signals = [{ weight: 1.0 }, { weight: 0.8 }];
      const confidence = calculateConfidence(signals, new Map());
      expect(confidence).toBe(0);
    });

    it('calculates weighted confidence', () => {
      const signals = [{ weight: 1.0 }, { weight: 0.5 }];
      const matched = new Map([[0, ['file1']]]);
      const confidence = calculateConfidence(signals, matched);

      expect(confidence).toBeGreaterThan(0.6);
      expect(confidence).toBeLessThanOrEqual(1);
    });

    it('adds bonus for multiple matches', () => {
      const signals = [{ weight: 1.0 }, { weight: 0.8 }];
      const singleMatch = new Map([[0, ['file1']]]);
      const multiMatch = new Map([[0, ['file1']], [1, ['file2']]]);

      const singleConf = calculateConfidence(signals, singleMatch);
      const multiConf = calculateConfidence(signals, multiMatch);

      expect(multiConf).toBeGreaterThan(singleConf);
    });
  });

  describe('hasPackageDep', () => {
    let testDir;

    beforeEach(() => {
      testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-pkg-'));
    });

    afterEach(() => {
      fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('returns true when dependency exists', () => {
      fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({
        dependencies: { react: '^18.0.0' },
      }));

      expect(hasPackageDep(testDir, 'react')).toBe(true);
    });

    it('checks devDependencies', () => {
      fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({
        devDependencies: { jest: '^29.0.0' },
      }));

      expect(hasPackageDep(testDir, 'jest')).toBe(true);
    });

    it('returns false when dependency does not exist', () => {
      fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({
        dependencies: { express: '^4.0.0' },
      }));

      expect(hasPackageDep(testDir, 'react')).toBe(false);
    });

    it('returns false when package.json does not exist', () => {
      expect(hasPackageDep(testDir, 'react')).toBe(false);
    });
  });

  describe('TECHNOLOGY_SIGNALS', () => {
    it('has signals for common technologies', () => {
      expect(TECHNOLOGY_SIGNALS.dotnet).toBeDefined();
      expect(TECHNOLOGY_SIGNALS.nodejs).toBeDefined();
      expect(TECHNOLOGY_SIGNALS.typescript).toBeDefined();
      expect(TECHNOLOGY_SIGNALS.python).toBeDefined();
      expect(TECHNOLOGY_SIGNALS.react).toBeDefined();
    });

    it('each technology has id, name, and signals', () => {
      for (const [key, tech] of Object.entries(TECHNOLOGY_SIGNALS)) {
        expect(tech.id).toBeDefined();
        expect(tech.name).toBeDefined();
        expect(Array.isArray(tech.signals)).toBe(true);
        expect(tech.signals.length).toBeGreaterThan(0);
      }
    });
  });
});

describe('detector', () => {
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-detector-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('collectFiles', () => {
    it('collects files recursively', () => {
      fs.mkdirSync(path.join(testDir, 'src'));
      fs.writeFileSync(path.join(testDir, 'package.json'), '{}');
      fs.writeFileSync(path.join(testDir, 'src', 'index.ts'), '');

      const files = collectFiles(testDir, testDir);

      expect(files).toContain('package.json');
      expect(files).toContain('src/index.ts');
    });

    it('excludes node_modules by default', () => {
      fs.mkdirSync(path.join(testDir, 'node_modules', 'lodash'), { recursive: true });
      fs.writeFileSync(path.join(testDir, 'node_modules', 'lodash', 'index.js'), '');
      fs.writeFileSync(path.join(testDir, 'index.js'), '');

      const files = collectFiles(testDir, testDir);

      expect(files).toContain('index.js');
      expect(files.some(f => f.includes('node_modules'))).toBe(false);
    });

    it('respects max depth', () => {
      fs.mkdirSync(path.join(testDir, 'a', 'b', 'c', 'd', 'e', 'f'), { recursive: true });
      fs.writeFileSync(path.join(testDir, 'a', 'b', 'c', 'd', 'e', 'f', 'deep.txt'), '');

      const shallow = collectFiles(testDir, testDir, [], 2);
      const deep = collectFiles(testDir, testDir, [], 10);

      expect(shallow.some(f => f.includes('deep.txt'))).toBe(false);
      expect(deep.some(f => f.includes('deep.txt'))).toBe(true);
    });
  });

  describe('detectSignals', () => {
    it('detects .NET project', () => {
      fs.writeFileSync(path.join(testDir, 'MyApp.sln'), '');
      fs.writeFileSync(path.join(testDir, 'MyApp.csproj'), '');

      const detections = detectSignals(testDir);
      const dotnet = detections.find(d => d.key === 'dotnet');

      expect(dotnet).toBeDefined();
      expect(dotnet.confidence).toBeGreaterThan(0.4);
    });

    it('detects Node.js project', () => {
      fs.writeFileSync(path.join(testDir, 'package.json'), '{}');
      fs.writeFileSync(path.join(testDir, 'package-lock.json'), '{}');

      const detections = detectSignals(testDir);
      const nodejs = detections.find(d => d.key === 'nodejs');

      expect(nodejs).toBeDefined();
      expect(nodejs.confidence).toBeGreaterThan(0.4);
    });

    it('detects TypeScript project', () => {
      fs.writeFileSync(path.join(testDir, 'tsconfig.json'), '{}');

      const detections = detectSignals(testDir);
      const typescript = detections.find(d => d.key === 'typescript');

      expect(typescript).toBeDefined();
    });

    it('detects React from package.json', () => {
      fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify({
        dependencies: { react: '^18.0.0' },
      }));

      const detections = detectSignals(testDir);
      const react = detections.find(d => d.key === 'react');

      expect(react).toBeDefined();
    });

    it('returns empty array for empty repo', () => {
      const detections = detectSignals(testDir);
      expect(detections).toEqual([]);
    });

    it('sorts by confidence descending', () => {
      fs.writeFileSync(path.join(testDir, 'MyApp.sln'), '');
      fs.writeFileSync(path.join(testDir, 'MyApp.csproj'), '');
      fs.writeFileSync(path.join(testDir, 'package.json'), '{}');

      const detections = detectSignals(testDir);

      for (let i = 1; i < detections.length; i++) {
        expect(detections[i - 1].confidence).toBeGreaterThanOrEqual(detections[i].confidence);
      }
    });
  });

  describe('proposeRulesets', () => {
    it('proposes rulesets above confidence threshold', () => {
      fs.writeFileSync(path.join(testDir, 'MyApp.sln'), '');
      fs.writeFileSync(path.join(testDir, 'MyApp.csproj'), '');

      const proposals = proposeRulesets(testDir, { minConfidence: 0.3 });

      expect(proposals.length).toBeGreaterThan(0);
      expect(proposals[0].rulesetId).toBe('languages/dotnet');
    });

    it('filters by minimum confidence', () => {
      fs.writeFileSync(path.join(testDir, 'random.txt'), '');

      const lowThreshold = proposeRulesets(testDir, { minConfidence: 0.1 });
      const highThreshold = proposeRulesets(testDir, { minConfidence: 0.9 });

      expect(highThreshold.length).toBeLessThanOrEqual(lowThreshold.length);
    });

    it('includes confidence percentage', () => {
      fs.writeFileSync(path.join(testDir, 'MyApp.sln'), '');
      fs.writeFileSync(path.join(testDir, 'MyApp.csproj'), '');

      const proposals = proposeRulesets(testDir, { minConfidence: 0.3 });

      expect(proposals.length).toBeGreaterThan(0);
      expect(proposals[0].confidence).toBeGreaterThanOrEqual(0);
      expect(proposals[0].confidence).toBeLessThanOrEqual(100);
    });

    it('includes reason with matches', () => {
      fs.writeFileSync(path.join(testDir, 'package.json'), '{}');
      fs.writeFileSync(path.join(testDir, 'package-lock.json'), '{}');

      const proposals = proposeRulesets(testDir, { minConfidence: 0.3 });
      const nodejs = proposals.find(p => p.rulesetId === 'languages/javascript');

      expect(nodejs).toBeDefined();
      expect(nodejs.reason).toContain('package.json');
    });
  });

  describe('formatProposals', () => {
    it('formats empty proposals', () => {
      const output = formatProposals([]);
      expect(output).toContain('No technologies detected');
    });

    it('formats proposals with confidence indicators', () => {
      const proposals = [
        { rulesetId: 'languages/dotnet', name: '.NET', confidence: 95, reason: 'Found MyApp.sln' },
        { rulesetId: 'languages/typescript', name: 'TypeScript', confidence: 70, reason: 'Found tsconfig.json' },
      ];

      const output = formatProposals(proposals);

      expect(output).toContain('.NET');
      expect(output).toContain('95%');
      expect(output).toContain('languages/dotnet');
    });
  });

  describe('getDetectionResults', () => {
    it('returns structured results', () => {
      fs.writeFileSync(path.join(testDir, 'package.json'), '{}');

      const results = getDetectionResults(testDir);

      expect(results.signals).toBeDefined();
      expect(results.proposals).toBeDefined();
      expect(results.scannedAt).toBeDefined();
    });
  });
});
