const {
  isGitAvailable,
  compareVersions,
  detectDrift,
  applySyncMode,
  parseDuration
} = require('../lib/rules-sync.cjs');

// Mock child_process for git commands
jest.mock('child_process');
const { execSync } = require('child_process');

describe('rules-sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isGitAvailable', () => {
    test('returns true when git is available', () => {
      execSync.mockReturnValue('git version 2.30.0');
      expect(isGitAvailable()).toBe(true);
    });

    test('returns false when git is not available', () => {
      execSync.mockImplementation(() => {
        throw new Error('git not found');
      });
      expect(isGitAvailable()).toBe(false);
    });
  });

  describe('compareVersions', () => {
    test('detects major version change', () => {
      const result = compareVersions('1.0.0', '2.0.0');
      expect(result.type).toBe('major');
      expect(result.breaking).toBe(true);
    });

    test('detects minor version change', () => {
      const result = compareVersions('1.0.0', '1.1.0');
      expect(result.type).toBe('minor');
      expect(result.breaking).toBe(false);
    });

    test('detects patch version change', () => {
      const result = compareVersions('1.0.0', '1.0.1');
      expect(result.type).toBe('patch');
      expect(result.breaking).toBe(false);
    });

    test('returns none for same version', () => {
      const result = compareVersions('1.0.0', '1.0.0');
      expect(result.type).toBe('none');
      expect(result.breaking).toBe(false);
    });
  });

  describe('detectDrift', () => {
    const createManifest = (rulesets) => ({
      version: '1.0.0',
      lastUpdated: '2026-03-20T10:30:00Z',
      categories: {
        languages: {
          description: 'Languages',
          rulesets: rulesets.map(r => ({
            ...r,
            category: 'languages',
            ref: `languages/${r.name}`
          }))
        }
      }
    });

    test('detects no drift when versions match', () => {
      const lock = {
        version: 1,
        lastSync: '2026-03-20T10:30:00Z',
        source: {},
        active: [
          {
            category: 'languages/typescript',
            version: '1.0.0',
            hash: 'sha256:abc123',
            fetchedAt: '2026-03-20T10:30:00Z'
          }
        ]
      };

      const manifest = createManifest([
        { name: 'typescript', version: '1.0.0' }
      ]);

      const drift = detectDrift(lock, manifest);
      expect(drift.detected).toBe(false);
      expect(drift.changes).toEqual([]);
      expect(drift.breaking).toBe(false);
    });

    test('detects version change drift', () => {
      const lock = {
        version: 1,
        lastSync: '2026-03-20T10:30:00Z',
        source: {},
        active: [
          {
            category: 'languages/typescript',
            version: '1.0.0',
            hash: 'sha256:abc123',
            fetchedAt: '2026-03-20T10:30:00Z'
          }
        ]
      };

      const manifest = createManifest([
        { name: 'typescript', version: '1.1.0' }
      ]);

      const drift = detectDrift(lock, manifest);
      expect(drift.detected).toBe(true);
      expect(drift.changes).toHaveLength(1);
      expect(drift.changes[0].type).toBe('version_change');
      expect(drift.changes[0].from).toBe('1.0.0');
      expect(drift.changes[0].to).toBe('1.1.0');
    });

    test('detects removed ruleset as breaking', () => {
      const lock = {
        version: 1,
        lastSync: '2026-03-20T10:30:00Z',
        source: {},
        active: [
          {
            category: 'languages/typescript',
            version: '1.0.0',
            hash: 'sha256:abc123',
            fetchedAt: '2026-03-20T10:30:00Z'
          }
        ]
      };

      const manifest = createManifest([]);

      const drift = detectDrift(lock, manifest);
      expect(drift.detected).toBe(true);
      expect(drift.breaking).toBe(true);
      expect(drift.changes[0].type).toBe('removed');
    });

    test('detects added ruleset (non-breaking)', () => {
      const lock = {
        version: 1,
        lastSync: '2026-03-20T10:30:00Z',
        source: {},
        active: []
      };

      const manifest = createManifest([
        { name: 'typescript', version: '1.0.0' }
      ]);

      const drift = detectDrift(lock, manifest);
      expect(drift.detected).toBe(true);
      expect(drift.breaking).toBe(false);
      expect(drift.changes[0].type).toBe('added');
    });

    test('detects major version as breaking', () => {
      const lock = {
        version: 1,
        lastSync: '2026-03-20T10:30:00Z',
        source: {},
        active: [
          {
            category: 'languages/typescript',
            version: '1.0.0',
            hash: 'sha256:abc123',
            fetchedAt: '2026-03-20T10:30:00Z'
          }
        ]
      };

      const manifest = createManifest([
        { name: 'typescript', version: '2.0.0' }
      ]);

      const drift = detectDrift(lock, manifest);
      expect(drift.detected).toBe(true);
      expect(drift.breaking).toBe(true);
      expect(drift.changes[0].changeType).toBe('major');
    });
  });

  describe('applySyncMode', () => {
    const mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    beforeEach(() => {
      mockLogger.log.mockClear();
      mockLogger.warn.mockClear();
      mockLogger.error.mockClear();
    });

    test('auto mode syncs on drift', async () => {
      const drift = {
        detected: true,
        changes: [
          {
            category: 'languages/typescript',
            type: 'version_change',
            from: '1.0.0',
            to: '1.1.0'
          }
        ],
        breaking: false
      };

      const result = await applySyncMode(drift, 'auto', { logger: mockLogger });
      expect(result.action).toBe('sync');
      expect(result.proceed).toBe(true);
      expect(mockLogger.log).toHaveBeenCalled();
    });

    test('strict mode blocks on drift', async () => {
      const drift = {
        detected: true,
        changes: [
          {
            category: 'languages/typescript',
            type: 'version_change',
            from: '1.0.0',
            to: '1.1.0'
          }
        ],
        breaking: false
      };

      const result = await applySyncMode(drift, 'strict', { logger: mockLogger });
      expect(result.action).toBe('block');
      expect(result.proceed).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('warn mode allows proceed with warning', async () => {
      const drift = {
        detected: true,
        changes: [
          {
            category: 'languages/typescript',
            type: 'version_change',
            from: '1.0.0',
            to: '1.1.0'
          }
        ],
        breaking: false
      };

      const result = await applySyncMode(drift, 'warn', { logger: mockLogger });
      expect(result.action).toBe('warn');
      expect(result.proceed).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    test('manual mode does nothing', async () => {
      const drift = {
        detected: true,
        changes: [],
        breaking: false
      };

      const result = await applySyncMode(drift, 'manual', { logger: mockLogger });
      expect(result.action).toBe('none');
      expect(result.proceed).toBe(true);
    });

    test('no drift returns none action', async () => {
      const drift = {
        detected: false,
        changes: [],
        breaking: false
      };

      const result = await applySyncMode(drift, 'auto', { logger: mockLogger });
      expect(result.action).toBe('none');
      expect(result.proceed).toBe(true);
    });

    test('throws on unknown mode', async () => {
      const drift = { detected: true, changes: [], breaking: false };
      await expect(applySyncMode(drift, 'invalid', { logger: mockLogger }))
        .rejects.toThrow('Unknown sync mode');
    });
  });

  describe('parseDuration', () => {
    test('parses hours', () => {
      expect(parseDuration('24h')).toBe(24 * 60 * 60 * 1000);
      expect(parseDuration('1h')).toBe(60 * 60 * 1000);
    });

    test('parses days', () => {
      expect(parseDuration('1d')).toBe(24 * 60 * 60 * 1000);
      expect(parseDuration('7d')).toBe(7 * 24 * 60 * 60 * 1000);
    });

    test('parses minutes', () => {
      expect(parseDuration('30m')).toBe(30 * 60 * 1000);
      expect(parseDuration('1m')).toBe(60 * 1000);
    });

    test('throws on invalid format', () => {
      expect(() => parseDuration('24')).toThrow('Invalid duration format');
      expect(() => parseDuration('24hours')).toThrow('Invalid duration format');
      expect(() => parseDuration('invalid')).toThrow('Invalid duration format');
    });
  });
});
