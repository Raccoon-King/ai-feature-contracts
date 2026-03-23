const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  hashContent,
  validateLock,
  createEmptyLock,
  readLock,
  writeLock,
  updateLock,
  updateActiveRuleset,
  removeActiveRuleset,
  findActiveRuleset,
  isLockStale,
  getLockAge,
  verifyLockIntegrity,
  updateLockChecksums,
  initLock,
  clearLock
} = require('../lib/sync-lock.cjs');

describe('sync-lock', () => {
  let tempDir;

  beforeEach(() => {
    // Create temporary directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-lock-test-'));
  });

  afterEach(() => {
    // Cleanup temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('hashContent', () => {
    test('generates consistent SHA-256 hash', () => {
      const content = 'test content';
      const hash1 = hashContent(content);
      const hash2 = hashContent(content);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    test('generates different hashes for different content', () => {
      const hash1 = hashContent('content1');
      const hash2 = hashContent('content2');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('validateLock', () => {
    test('accepts valid lock', () => {
      const lock = {
        version: 1,
        lastSync: '2026-03-20T10:30:00Z',
        source: {
          repo: 'https://github.com/test/repo.git',
          branch: 'main',
          commit: 'abc123',
          version: '1.0.0'
        },
        active: [
          {
            category: 'languages/typescript',
            version: '1.0.0',
            hash: 'sha256:abc123def456',
            fetchedAt: '2026-03-20T10:30:00Z'
          }
        ],
        checksums: {
          manifest: 'abc123'
        }
      };
      expect(validateLock(lock)).toBe(true);
    });

    test('rejects lock without version', () => {
      const lock = {
        lastSync: '2026-03-20T10:30:00Z',
        source: {},
        active: []
      };
      expect(() => validateLock(lock)).toThrow('Unsupported lock version');
    });

    test('rejects lock with invalid version', () => {
      const lock = {
        version: 2,
        lastSync: '2026-03-20T10:30:00Z',
        source: {},
        active: []
      };
      expect(() => validateLock(lock)).toThrow('Unsupported lock version: 2');
    });

    test('rejects lock without lastSync', () => {
      const lock = {
        version: 1,
        source: {},
        active: []
      };
      expect(() => validateLock(lock)).toThrow('missing required field: lastSync');
    });

    test('rejects lock with invalid lastSync date', () => {
      const lock = {
        version: 1,
        lastSync: 'invalid-date',
        source: {},
        active: []
      };
      expect(() => validateLock(lock)).toThrow('Invalid lastSync date');
    });

    test('rejects lock without source', () => {
      const lock = {
        version: 1,
        lastSync: '2026-03-20T10:30:00Z',
        active: []
      };
      expect(() => validateLock(lock)).toThrow('missing required field: source');
    });

    test('rejects lock without active array', () => {
      const lock = {
        version: 1,
        lastSync: '2026-03-20T10:30:00Z',
        source: { repo: 'test' }
      };
      expect(() => validateLock(lock)).toThrow('missing required field: active');
    });

    test('rejects active ruleset without hash prefix', () => {
      const lock = {
        version: 1,
        lastSync: '2026-03-20T10:30:00Z',
        source: { repo: 'test' },
        active: [
          {
            category: 'languages/typescript',
            version: '1.0.0',
            hash: 'abc123',
            fetchedAt: '2026-03-20T10:30:00Z'
          }
        ]
      };
      expect(() => validateLock(lock)).toThrow('hash must start with "sha256:"');
    });

    test('accepts legacy active rulesets with split category and name', () => {
      const lock = {
        version: 1,
        lastSync: '2026-03-20T10:30:00Z',
        source: {
          repo: 'https://github.com/test/repo.git',
          branch: 'main',
          commit: 'abc123',
          version: '1.0.0'
        },
        active: [
          {
            category: 'languages',
            name: 'typescript',
            version: '1.0.0',
            hash: 'sha256:abc123def456',
            fetchedAt: '2026-03-20T10:30:00Z'
          }
        ],
        checksums: {
          manifest: 'abc123'
        }
      };

      expect(validateLock(lock)).toBe(true);
    });
  });

  describe('createEmptyLock', () => {
    test('creates valid empty lock', () => {
      const lock = createEmptyLock('https://github.com/test/repo.git', 'main');
      expect(lock.version).toBe(1);
      expect(lock.source.repo).toBe('https://github.com/test/repo.git');
      expect(lock.source.branch).toBe('main');
      expect(lock.active).toEqual([]);
      expect(validateLock(lock)).toBe(true);
    });

    test('uses default branch if not specified', () => {
      const lock = createEmptyLock('https://github.com/test/repo.git');
      expect(lock.source.branch).toBe('main');
    });
  });

  describe('readLock and writeLock', () => {
    test('writes and reads lock file', () => {
      const lock = createEmptyLock('https://github.com/test/repo.git');
      const lockPath = '.grabby/rulesets/sync.lock.yaml';

      writeLock(lock, lockPath, tempDir);

      const readBackLock = readLock(lockPath, tempDir);
      expect(readBackLock.version).toBe(lock.version);
      expect(readBackLock.source.repo).toBe(lock.source.repo);
    });

    test('returns null if lock file does not exist', () => {
      const lock = readLock('.grabby/rulesets/sync.lock.yaml', tempDir);
      expect(lock).toBeNull();
    });

    test('creates directory if it does not exist', () => {
      const lock = createEmptyLock('https://github.com/test/repo.git');
      const lockPath = '.grabby/rulesets/sync.lock.yaml';

      writeLock(lock, lockPath, tempDir);

      const dir = path.join(tempDir, '.grabby/rulesets');
      expect(fs.existsSync(dir)).toBe(true);
    });
  });

  describe('updateLock', () => {
    test('updates lastSync', () => {
      const lock = createEmptyLock('https://github.com/test/repo.git');
      const newDate = '2026-03-21T10:30:00Z';

      const updated = updateLock(lock, { lastSync: newDate });
      expect(updated.lastSync).toBe(newDate);
      expect(lock.lastSync).not.toBe(newDate); // Original unchanged
    });

    test('updates source info', () => {
      const lock = createEmptyLock('https://github.com/test/repo.git');

      const updated = updateLock(lock, {
        source: { commit: 'abc123', version: '1.0.0' }
      });

      expect(updated.source.commit).toBe('abc123');
      expect(updated.source.version).toBe('1.0.0');
      expect(updated.source.repo).toBe(lock.source.repo); // Preserved
    });

    test('updates active rulesets', () => {
      const lock = createEmptyLock('https://github.com/test/repo.git');
      const active = [
        {
          category: 'languages/typescript',
          version: '1.0.0',
          hash: 'sha256:abc123',
          fetchedAt: '2026-03-20T10:30:00Z'
        }
      ];

      const updated = updateLock(lock, { active });
      expect(updated.active).toHaveLength(1);
      expect(updated.active[0].category).toBe('languages/typescript');
    });
  });

  describe('updateActiveRuleset', () => {
    test('adds new active ruleset', () => {
      const lock = createEmptyLock('https://github.com/test/repo.git');
      const ruleset = {
        category: 'languages/typescript',
        version: '1.0.0',
        hash: 'abc123',
        fetchedAt: '2026-03-20T10:30:00Z'
      };

      const updated = updateActiveRuleset(lock, ruleset);
      expect(updated.active).toHaveLength(1);
      expect(updated.active[0].category).toBe('languages/typescript');
      expect(updated.active[0].hash).toBe('sha256:abc123');
    });

    test('updates existing active ruleset', () => {
      const lock = createEmptyLock('https://github.com/test/repo.git');
      lock.active = [
        {
          category: 'languages/typescript',
          version: '1.0.0',
          hash: 'sha256:old',
          fetchedAt: '2026-03-20T10:30:00Z'
        }
      ];

      const ruleset = {
        category: 'languages/typescript',
        version: '1.1.0',
        hash: 'sha256:new'
      };

      const updated = updateActiveRuleset(lock, ruleset);
      expect(updated.active).toHaveLength(1);
      expect(updated.active[0].version).toBe('1.1.0');
      expect(updated.active[0].hash).toBe('sha256:new');
    });

    test('automatically adds sha256 prefix if missing', () => {
      const lock = createEmptyLock('https://github.com/test/repo.git');
      const ruleset = {
        category: 'languages/typescript',
        version: '1.0.0',
        hash: 'abc123'
      };

      const updated = updateActiveRuleset(lock, ruleset);
      expect(updated.active[0].hash).toBe('sha256:abc123');
    });

    test('replaces legacy split-category entries using normalized ref matching', () => {
      const lock = createEmptyLock('https://github.com/test/repo.git');
      lock.active = [
        {
          category: 'languages',
          name: 'typescript',
          version: '1.0.0',
          hash: 'sha256:old',
          fetchedAt: '2026-03-20T10:30:00Z'
        }
      ];

      const updated = updateActiveRuleset(lock, {
        category: 'languages/typescript',
        version: '1.1.0',
        hash: 'sha256:new'
      });

      expect(updated.active).toHaveLength(1);
      expect(updated.active[0].category).toBe('languages/typescript');
      expect(updated.active[0].name).toBe('typescript');
      expect(updated.active[0].version).toBe('1.1.0');
    });
  });

  describe('removeActiveRuleset', () => {
    test('removes active ruleset', () => {
      const lock = createEmptyLock('https://github.com/test/repo.git');
      lock.active = [
        {
          category: 'languages/typescript',
          version: '1.0.0',
          hash: 'sha256:abc',
          fetchedAt: '2026-03-20T10:30:00Z'
        },
        {
          category: 'languages/javascript',
          version: '1.0.0',
          hash: 'sha256:def',
          fetchedAt: '2026-03-20T10:30:00Z'
        }
      ];

      const updated = removeActiveRuleset(lock, 'languages/typescript');
      expect(updated.active).toHaveLength(1);
      expect(updated.active[0].category).toBe('languages/javascript');
    });

    test('removes legacy split-category active ruleset by normalized ref', () => {
      const lock = createEmptyLock('https://github.com/test/repo.git');
      lock.active = [
        {
          category: 'languages',
          name: 'typescript',
          version: '1.0.0',
          hash: 'sha256:abc',
          fetchedAt: '2026-03-20T10:30:00Z'
        }
      ];

      const updated = removeActiveRuleset(lock, 'languages/typescript');
      expect(updated.active).toHaveLength(0);
    });
  });

  describe('findActiveRuleset', () => {
    const lock = createEmptyLock('https://github.com/test/repo.git');
    lock.active = [
      {
        category: 'languages/typescript',
        version: '1.0.0',
        hash: 'sha256:abc',
        fetchedAt: '2026-03-20T10:30:00Z'
      }
    ];

    test('finds existing ruleset', () => {
      const ruleset = findActiveRuleset(lock, 'languages/typescript');
      expect(ruleset).toBeDefined();
      expect(ruleset.version).toBe('1.0.0');
    });

    test('returns null for non-existent ruleset', () => {
      const ruleset = findActiveRuleset(lock, 'languages/python');
      expect(ruleset).toBeNull();
    });

    test('finds legacy split-category ruleset by normalized ref', () => {
      const legacyLock = createEmptyLock('https://github.com/test/repo.git');
      legacyLock.active = [
        {
          category: 'languages',
          name: 'typescript',
          version: '1.0.0',
          hash: 'sha256:abc',
          fetchedAt: '2026-03-20T10:30:00Z'
        }
      ];

      const ruleset = findActiveRuleset(legacyLock, 'languages/typescript');
      expect(ruleset).toBeDefined();
      expect(ruleset.name).toBe('typescript');
    });
  });

  describe('isLockStale', () => {
    test('returns false for fresh lock', () => {
      const lock = createEmptyLock('https://github.com/test/repo.git');
      expect(isLockStale(lock, 24 * 60 * 60 * 1000)).toBe(false);
    });

    test('returns true for stale lock', () => {
      const lock = createEmptyLock('https://github.com/test/repo.git');
      lock.lastSync = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      expect(isLockStale(lock, 24 * 60 * 60 * 1000)).toBe(true);
    });
  });

  describe('getLockAge', () => {
    test('returns age in milliseconds', () => {
      const lock = createEmptyLock('https://github.com/test/repo.git');
      const age = getLockAge(lock);
      expect(age).toBeGreaterThanOrEqual(0);
      expect(age).toBeLessThan(1000); // Less than 1 second old
    });
  });

  describe('verifyLockIntegrity', () => {
    test('returns valid for matching checksums', () => {
      const manifestContent = 'test manifest';
      const lock = createEmptyLock('https://github.com/test/repo.git');
      lock.checksums = {
        manifest: hashContent(manifestContent)
      };

      const result = verifyLockIntegrity(lock, manifestContent);
      expect(result.valid).toBe(true);
      expect(result.reason).toBe('checksum_match');
    });

    test('returns invalid for mismatched checksums', () => {
      const lock = createEmptyLock('https://github.com/test/repo.git');
      lock.checksums = {
        manifest: 'wrong-hash'
      };

      const result = verifyLockIntegrity(lock, 'test manifest');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('checksum_mismatch');
    });

    test('returns valid if no checksum present', () => {
      const lock = createEmptyLock('https://github.com/test/repo.git');
      lock.checksums = {};

      const result = verifyLockIntegrity(lock, 'test manifest');
      expect(result.valid).toBe(true);
      expect(result.reason).toBe('no_checksum');
    });
  });

  describe('updateLockChecksums', () => {
    test('updates manifest checksum', () => {
      const lock = createEmptyLock('https://github.com/test/repo.git');
      const manifestContent = 'test manifest';

      const updated = updateLockChecksums(lock, manifestContent);
      expect(updated.checksums.manifest).toBe(hashContent(manifestContent));
    });
  });

  describe('initLock', () => {
    test('creates new lock if none exists', () => {
      const lockPath = '.grabby/rulesets/sync.lock.yaml';
      const lock = initLock('https://github.com/test/repo.git', 'main', lockPath, tempDir);

      expect(lock).toBeDefined();
      expect(lock.source.repo).toBe('https://github.com/test/repo.git');

      const filePath = path.join(tempDir, lockPath);
      expect(fs.existsSync(filePath)).toBe(true);
    });

    test('returns existing lock if it exists', () => {
      const lockPath = '.grabby/rulesets/sync.lock.yaml';
      const lock1 = initLock('https://github.com/test/repo.git', 'main', lockPath, tempDir);
      const lock2 = initLock('https://github.com/other/repo.git', 'main', lockPath, tempDir);

      expect(lock2.source.repo).toBe(lock1.source.repo); // Unchanged
    });
  });

  describe('clearLock', () => {
    test('deletes lock file if it exists', () => {
      const lockPath = '.grabby/rulesets/sync.lock.yaml';
      initLock('https://github.com/test/repo.git', 'main', lockPath, tempDir);

      const result = clearLock(lockPath, tempDir);
      expect(result).toBe(true);

      const filePath = path.join(tempDir, lockPath);
      expect(fs.existsSync(filePath)).toBe(false);
    });

    test('returns false if lock file does not exist', () => {
      const result = clearLock('.grabby/rulesets/sync.lock.yaml', tempDir);
      expect(result).toBe(false);
    });
  });
});
