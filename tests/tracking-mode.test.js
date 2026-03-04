const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  getTrackingMode,
  getContractsDirectory,
  loadConfig,
  saveConfig,
  defaultConfig,
  validateConfig,
} = require('../lib/config.cjs');
const {
  refreshFeatureIndex,
  listContractFeatures,
  getCandidateContractsDirs,
} = require('../lib/features.cjs');

describe('Contract Tracking Mode', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-tracking-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('getTrackingMode', () => {
    it('defaults to tracked when no config exists', () => {
      expect(getTrackingMode(null, tempDir)).toBe('tracked');
    });

    it('returns tracked when explicitly set', () => {
      const config = defaultConfig();
      config.contracts.trackingMode = 'tracked';
      saveConfig(config, tempDir);
      expect(getTrackingMode(null, tempDir)).toBe('tracked');
    });

    it('returns local-only when explicitly set', () => {
      const config = defaultConfig();
      config.contracts.trackingMode = 'local-only';
      saveConfig(config, tempDir);
      expect(getTrackingMode(null, tempDir)).toBe('local-only');
    });

    it('normalizes invalid values to tracked', () => {
      const config = defaultConfig();
      config.contracts.trackingMode = 'invalid';
      saveConfig(config, tempDir);
      expect(getTrackingMode(null, tempDir)).toBe('tracked');
    });
  });

  describe('getContractsDirectory', () => {
    it('returns contracts/ for tracked mode', () => {
      const config = defaultConfig();
      config.contracts.trackingMode = 'tracked';
      saveConfig(config, tempDir);
      expect(getContractsDirectory(tempDir)).toBe(path.join(tempDir, 'contracts'));
    });

    it('returns .grabby/contracts/ for local-only mode', () => {
      const config = defaultConfig();
      config.contracts.trackingMode = 'local-only';
      saveConfig(config, tempDir);
      expect(getContractsDirectory(tempDir)).toBe(path.join(tempDir, '.grabby', 'contracts'));
    });
  });

  describe('validateConfig', () => {
    it('accepts valid trackingMode values', () => {
      const config = defaultConfig();
      config.contracts.trackingMode = 'tracked';
      expect(validateConfig(config).valid).toBe(true);

      config.contracts.trackingMode = 'local-only';
      expect(validateConfig(config).valid).toBe(true);
    });

    it('rejects invalid trackingMode values', () => {
      const config = defaultConfig();
      config.contracts.trackingMode = 'invalid';
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('contracts.trackingMode must be "tracked" or "local-only"');
    });
  });

  describe('Feature indexing with tracking mode', () => {
    it('includes contracts in feature index when tracked', () => {
      const config = defaultConfig();
      config.contracts.trackingMode = 'tracked';
      saveConfig(config, tempDir);

      const contractsDir = path.join(tempDir, 'contracts');
      fs.mkdirSync(contractsDir, { recursive: true });
      fs.writeFileSync(
        path.join(contractsDir, 'TEST-001.fc.md'),
        `# FC: Test Feature
**ID:** TEST-001 | **Status:** draft

## Objective
Test feature for tracking mode.

## Scope
- Test item

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | test.js | Test file |

## Done When
- [ ] Test passes
`,
        'utf8'
      );

      const result = refreshFeatureIndex(tempDir);
      expect(result.features.length).toBe(1);
      expect(result.features[0].id).toBe('TEST-001');
      expect(result.trackingMode).toBe('tracked');
    });

    it('excludes contracts from feature index when local-only', () => {
      const config = defaultConfig();
      config.contracts.trackingMode = 'local-only';
      saveConfig(config, tempDir);

      const localContractsDir = path.join(tempDir, '.grabby', 'contracts');
      fs.mkdirSync(localContractsDir, { recursive: true });
      fs.writeFileSync(
        path.join(localContractsDir, 'LOCAL-001.fc.md'),
        `# FC: Local Feature
**ID:** LOCAL-001 | **Status:** draft

## Objective
Local feature for testing.

## Scope
- Local item

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | local.js | Local file |

## Done When
- [ ] Local test passes
`,
        'utf8'
      );

      const result = refreshFeatureIndex(tempDir);
      expect(result.features.length).toBe(0);
      expect(result.trackingMode).toBe('local-only');
    });

    it('uses only the local contracts directory when tracking mode is local-only', () => {
      const config = defaultConfig();
      config.contracts.trackingMode = 'local-only';
      saveConfig(config, tempDir);

      const rootContractsDir = path.join(tempDir, 'contracts');
      const localContractsDir = path.join(tempDir, '.grabby', 'contracts');
      fs.mkdirSync(rootContractsDir, { recursive: true });
      fs.mkdirSync(localContractsDir, { recursive: true });
      fs.writeFileSync(path.join(rootContractsDir, 'ROOT-001.fc.md'), `# FC: Root Feature
**ID:** ROOT-001 | **Status:** draft
`, 'utf8');
      fs.writeFileSync(path.join(localContractsDir, 'LOCAL-002.fc.md'), `# FC: Local Feature
**ID:** LOCAL-002 | **Status:** approved
`, 'utf8');

      expect(getCandidateContractsDirs(tempDir)).toEqual([localContractsDir]);
      expect(listContractFeatures(tempDir)).toMatchObject([
        {
          id: 'LOCAL-002',
          contractPath: '.grabby/contracts/LOCAL-002.fc.md',
        },
      ]);
    });
  });
});
