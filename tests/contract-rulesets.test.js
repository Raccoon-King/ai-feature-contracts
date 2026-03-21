const fs = require('fs');
const path = require('path');
const {
  isRulesetsConfigured,
  performSyncCheck,
  createRulesetSnapshot,
  recordDriftCheck,
  parseContractMetadata,
  writeContractMetadata,
  addRulesetSnapshotToContract,
  updateContractDriftCheck,
  formatSyncCheckSummary
} = require('../lib/contract-rulesets.cjs');

// Mock dependencies
jest.mock('fs');
jest.mock('../lib/config.cjs');
jest.mock('../lib/sync-lock.cjs');
jest.mock('../lib/rules-sync.cjs');
jest.mock('../lib/manifest-parser.cjs');

const { loadConfig } = require('../lib/config.cjs');
const { readLock, writeLock, isLockStale, getLockAge } = require('../lib/sync-lock.cjs');
const { detectDrift, applySyncMode, parseDuration } = require('../lib/rules-sync.cjs');
const { parseManifestFile } = require('../lib/manifest-parser.cjs');

describe('contract-rulesets', () => {
  let mockConfig;
  let mockLock;
  let mockManifest;
  let consoleSpy;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock config
    mockConfig = {
      rulesets: {
        source: {
          repo: 'https://github.com/test/rules.git',
          branch: 'main'
        },
        active: ['languages/typescript', 'policies/security'],
        sync: {
          mode: 'warn',
          interval: '24h',
          checkOnCommands: ['task', 'validate', 'plan', 'execute'],
          recordSnapshot: true
        },
        lockPath: '.grabby/rulesets/sync.lock.yaml',
        cacheDir: '.grabby/rulesets/cache'
      }
    };

    // Mock lock
    mockLock = {
      version: 1,
      lastSync: new Date().toISOString(),
      source: {
        repo: 'https://github.com/test/rules.git',
        branch: 'main',
        version: '1.0.0'
      },
      active: [
        {
          category: 'languages/typescript',
          version: '1.0.0',
          hash: 'sha256:abc123'
        },
        {
          category: 'policies/security',
          version: '1.0.0',
          hash: 'sha256:def456'
        }
      ]
    };

    // Mock manifest
    mockManifest = {
      version: '1.0.0',
      categories: {
        languages: {
          description: 'Languages',
          rulesets: [
            { name: 'typescript', version: '1.0.0', tags: [] }
          ]
        },
        policies: {
          description: 'Policies',
          rulesets: [
            { name: 'security', version: '1.0.0', tags: [] }
          ]
        }
      }
    };

    loadConfig.mockReturnValue(mockConfig);
    readLock.mockReturnValue(mockLock);
    parseManifestFile.mockReturnValue(mockManifest);
    fs.existsSync.mockReturnValue(true);

    // Mock sync-lock functions
    isLockStale.mockReturnValue(false);
    getLockAge.mockReturnValue(0);

    // Mock rules-sync functions
    parseDuration.mockReturnValue(24 * 60 * 60 * 1000); // 24 hours in ms

    consoleSpy = {
      log: jest.fn(),
      warn: jest.fn()
    };
  });

  describe('isRulesetsConfigured', () => {
    it('returns true when rulesets are configured', () => {
      expect(isRulesetsConfigured(mockConfig)).toBe(true);
    });

    it('returns false when rulesets not configured', () => {
      expect(isRulesetsConfigured({})).toBe(false);
    });

    it('returns false when source not configured', () => {
      const config = { rulesets: {} };
      expect(isRulesetsConfigured(config)).toBe(false);
    });

    it('returns false when repo is empty', () => {
      const config = {
        rulesets: {
          source: { repo: '' }
        }
      };
      expect(isRulesetsConfigured(config)).toBe(false);
    });
  });

  describe('performSyncCheck', () => {
    it('skips check when rulesets not configured', async () => {
      loadConfig.mockReturnValue({});

      const result = await performSyncCheck('task', { logger: consoleSpy });

      expect(result).toEqual({
        skipped: true,
        reason: 'not_configured'
      });
    });

    it('skips check when command not monitored', async () => {
      mockConfig.rulesets.sync.checkOnCommands = ['validate'];

      const result = await performSyncCheck('task', { logger: consoleSpy });

      expect(result).toEqual({
        skipped: true,
        reason: 'command_not_monitored'
      });
    });

    it('returns needsSync when no lock file exists', async () => {
      readLock.mockReturnValue(null);

      const result = await performSyncCheck('task', { logger: consoleSpy });

      expect(result).toEqual({
        needsSync: true,
        reason: 'no_lock',
        drift: null
      });
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        expect.stringContaining('No sync lock found')
      );
    });

    it('returns needsSync when manifest does not exist', async () => {
      fs.existsSync.mockReturnValue(false);

      const result = await performSyncCheck('task', { logger: consoleSpy });

      expect(result).toEqual({
        needsSync: true,
        reason: 'no_manifest',
        drift: null
      });
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        expect.stringContaining('No cached manifest')
      );
    });

    it('returns success when no drift detected', async () => {
      detectDrift.mockReturnValue({ detected: false });

      const result = await performSyncCheck('task', { logger: consoleSpy });

      expect(result).toEqual({
        needsSync: false,
        drift: null,
        lock: mockLock,
        manifest: mockManifest
      });
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('All rulesets up to date')
      );
    });

    it('blocks execution when drift detected in strict mode', async () => {
      mockConfig.rulesets.sync.mode = 'strict';
      const drift = {
        detected: true,
        changes: [
          {
            category: 'languages/typescript',
            from: '1.0.0',
            to: '1.1.0',
            breaking: false
          }
        ],
        breaking: false
      };
      detectDrift.mockReturnValue(drift);
      applySyncMode.mockResolvedValue({
        proceed: false,
        action: 'blocked'
      });

      const result = await performSyncCheck('task', { logger: consoleSpy });

      expect(result).toEqual({
        blocked: true,
        reason: 'drift_in_strict_mode',
        drift,
        lock: mockLock,
        manifest: mockManifest
      });
    });

    it('warns about drift in warn mode and continues', async () => {
      const drift = {
        detected: true,
        changes: [
          {
            category: 'languages/typescript',
            from: '1.0.0',
            to: '1.1.0',
            breaking: false
          }
        ],
        breaking: false
      };
      detectDrift.mockReturnValue(drift);
      applySyncMode.mockResolvedValue({
        proceed: true,
        action: 'warned'
      });

      const result = await performSyncCheck('task', { logger: consoleSpy });

      expect(result).toEqual({
        needsSync: false,
        drift,
        driftAction: 'warned',
        lock: mockLock,
        manifest: mockManifest
      });
    });

    it('warns about stale lock file', async () => {
      const staleDate = new Date();
      staleDate.setDate(staleDate.getDate() - 2);
      const staleLock = {
        ...mockLock,
        lastSync: staleDate.toISOString()
      };
      readLock.mockReturnValue(staleLock);
      detectDrift.mockReturnValue({ detected: false });

      // Mock stale check
      isLockStale.mockReturnValue(true);
      getLockAge.mockReturnValue(48 * 60 * 60 * 1000); // 48 hours in ms

      await performSyncCheck('task', { logger: consoleSpy });

      expect(consoleSpy.warn).toHaveBeenCalledWith(
        expect.stringContaining('Sync is stale')
      );
    });
  });

  describe('createRulesetSnapshot', () => {
    it('creates snapshot from lock and manifest', () => {
      const snapshot = createRulesetSnapshot(mockLock, mockManifest);

      expect(snapshot).toEqual({
        version: '1.0.0',
        syncedAt: mockLock.lastSync,
        snapshot: [
          {
            category: 'languages/typescript',
            version: '1.0.0',
            hash: 'sha256:abc123'
          },
          {
            category: 'policies/security',
            version: '1.0.0',
            hash: 'sha256:def456'
          }
        ],
        driftChecks: []
      });
    });

    it('returns null when no lock provided', () => {
      expect(createRulesetSnapshot(null, mockManifest)).toBeNull();
    });

    it('returns null when lock has no active rulesets', () => {
      const emptyLock = { ...mockLock, active: [] };
      expect(createRulesetSnapshot(emptyLock, mockManifest)).toBeNull();
    });

    it('uses manifest version when lock version missing', () => {
      const lockNoVersion = {
        ...mockLock,
        source: { ...mockLock.source, version: undefined }
      };

      const snapshot = createRulesetSnapshot(lockNoVersion, mockManifest);

      expect(snapshot.version).toBe('1.0.0');
    });
  });

  describe('recordDriftCheck', () => {
    it('adds drift check to existing metadata', () => {
      const metadata = {
        rulesets: {
          version: '1.0.0',
          syncedAt: new Date().toISOString(),
          snapshot: [],
          driftChecks: []
        }
      };

      const checkResult = {
        drift: null
      };

      const updated = recordDriftCheck(metadata, checkResult, 'task');

      expect(updated.rulesets.driftChecks).toHaveLength(1);
      expect(updated.rulesets.driftChecks[0]).toMatchObject({
        command: 'task',
        status: 'clean'
      });
    });

    it('creates rulesets metadata if missing', () => {
      const metadata = {};
      const checkResult = { drift: null };

      const updated = recordDriftCheck(metadata, checkResult, 'task');

      expect(updated.rulesets).toBeDefined();
      expect(updated.rulesets.driftChecks).toHaveLength(1);
    });

    it('records drift when detected', () => {
      const metadata = { rulesets: { driftChecks: [] } };
      const checkResult = {
        drift: {
          changes: [
            {
              category: 'languages/typescript',
              from: '1.0.0',
              to: '1.1.0',
              breaking: false
            }
          ]
        },
        driftAction: 'warned'
      };

      const updated = recordDriftCheck(metadata, checkResult, 'validate');

      const check = updated.rulesets.driftChecks[0];
      expect(check.status).toBe('drift_detected');
      expect(check.action).toBe('warned');
      expect(check.changes).toHaveLength(1);
      expect(check.changes[0]).toMatchObject({
        ruleset: 'languages/typescript',
        from: '1.0.0',
        to: '1.1.0',
        breaking: false
      });
    });
  });

  describe('parseContractMetadata', () => {
    it('parses YAML frontmatter from contract', () => {
      const content = `---
contract_id: FC-001
rulesets:
  version: "1.0.0"
  syncedAt: "2026-03-20T10:00:00Z"
---

# Feature Contract
Content here`;

      fs.readFileSync.mockReturnValue(content);
      fs.existsSync.mockReturnValue(true);

      const metadata = parseContractMetadata('/path/to/contract.md');

      expect(metadata).toMatchObject({
        contract_id: 'FC-001',
        rulesets: {
          version: '1.0.0',
          syncedAt: '2026-03-20T10:00:00Z'
        }
      });
    });

    it('returns empty object when no frontmatter', () => {
      fs.readFileSync.mockReturnValue('# Contract\nNo frontmatter');
      fs.existsSync.mockReturnValue(true);

      const metadata = parseContractMetadata('/path/to/contract.md');

      expect(metadata).toEqual({});
    });

    it('returns null when file does not exist', () => {
      fs.existsSync.mockReturnValue(false);

      const metadata = parseContractMetadata('/nonexistent.md');

      expect(metadata).toBeNull();
    });

    it('returns empty object when YAML parsing fails', () => {
      const content = `---
invalid: yaml: content:
---`;

      fs.readFileSync.mockReturnValue(content);
      fs.existsSync.mockReturnValue(true);

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const metadata = parseContractMetadata('/path/to/contract.md');

      expect(metadata).toEqual({});
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  describe('writeContractMetadata', () => {
    it('writes metadata to contract frontmatter', () => {
      const content = '# Contract\nExisting content';
      const metadata = {
        contract_id: 'FC-001',
        rulesets: { version: '1.0.0' }
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(content);

      writeContractMetadata('/path/to/contract.md', metadata);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/path/to/contract.md.bak',
        content,
        'utf8'
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/path/to/contract.md',
        expect.stringContaining('---\n'),
        'utf8'
      );
      expect(fs.unlinkSync).toHaveBeenCalledWith('/path/to/contract.md.bak');
    });

    it('replaces existing frontmatter', () => {
      const content = `---
old: metadata
---
# Contract
Content`;

      const metadata = {
        new: 'metadata'
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(content);

      writeContractMetadata('/path/to/contract.md', metadata);

      const writtenContent = fs.writeFileSync.mock.calls.find(
        call => call[0] === '/path/to/contract.md'
      )[1];

      expect(writtenContent).toContain('new: metadata');
      expect(writtenContent).not.toContain('old: metadata');
      expect(writtenContent).toContain('# Contract');
    });

    it('throws error when file does not exist', () => {
      fs.existsSync.mockReturnValue(false);

      expect(() => {
        writeContractMetadata('/nonexistent.md', {});
      }).toThrow('Contract file not found');
    });

    it('restores from backup on write error', () => {
      const content = 'Original content';
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation((path) => {
        if (path.endsWith('.bak')) {
          return content;
        }
        return content;
      });

      // Track if backup was created
      let backupCreated = false;
      fs.writeFileSync.mockImplementation((path, content, encoding) => {
        if (path.endsWith('.bak')) {
          backupCreated = true;
        } else if (backupCreated) {
          throw new Error('Write failed');
        }
      });

      expect(() => {
        writeContractMetadata('/path/to/contract.md', {});
      }).toThrow('Write failed');

      // Should have attempted to create backup
      const calls = fs.writeFileSync.mock.calls;
      expect(calls.some(call => call[0] === '/path/to/contract.md.bak')).toBe(true);

      // Reset mock for other tests
      fs.writeFileSync.mockReset();
    });
  });

  describe('addRulesetSnapshotToContract', () => {
    beforeEach(() => {
      // Reset writeFileSync to default behavior
      fs.writeFileSync.mockReset();
      fs.writeFileSync.mockImplementation(() => {});
    });

    it('adds snapshot to contract when configured', async () => {
      const contractContent = `---
contract_id: FC-001
---
# Contract
Content`;
      fs.readFileSync.mockReturnValue(contractContent);
      fs.existsSync.mockReturnValue(true);

      const result = await addRulesetSnapshotToContract(
        '/path/to/contract.md',
        '/test/cwd'
      );

      expect(result).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('skips when rulesets not configured', async () => {
      loadConfig.mockReturnValue({});

      const result = await addRulesetSnapshotToContract(
        '/path/to/contract.md'
      );

      expect(result).toBe(false);
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('skips when recordSnapshot is false', async () => {
      mockConfig.rulesets.sync.recordSnapshot = false;

      const result = await addRulesetSnapshotToContract(
        '/path/to/contract.md'
      );

      expect(result).toBe(false);
    });

    it('skips when no lock file exists', async () => {
      readLock.mockReturnValue(null);

      const result = await addRulesetSnapshotToContract(
        '/path/to/contract.md'
      );

      expect(result).toBe(false);
    });

    it('skips when manifest does not exist', async () => {
      fs.existsSync.mockImplementation(path => {
        return !path.includes('manifest.yaml');
      });

      const result = await addRulesetSnapshotToContract(
        '/path/to/contract.md'
      );

      expect(result).toBe(false);
    });
  });

  describe('updateContractDriftCheck', () => {
    beforeEach(() => {
      // Reset writeFileSync to default behavior
      fs.writeFileSync.mockReset();
      fs.writeFileSync.mockImplementation(() => {});
    });

    it('updates contract with drift check', async () => {
      const contractContent = `---
contract_id: FC-001
---
# Contract
Content`;
      fs.readFileSync.mockReturnValue(contractContent);
      fs.existsSync.mockReturnValue(true);

      const checkResult = {
        drift: null
      };

      const result = await updateContractDriftCheck(
        '/path/to/contract.md',
        checkResult,
        'validate'
      );

      expect(result).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('skips when rulesets not configured', async () => {
      loadConfig.mockReturnValue({});

      const result = await updateContractDriftCheck(
        '/path/to/contract.md',
        {},
        'validate'
      );

      expect(result).toBe(false);
    });

    it('skips when contract does not exist', async () => {
      fs.existsSync.mockReturnValue(false);

      const result = await updateContractDriftCheck(
        '/nonexistent.md',
        {},
        'validate'
      );

      expect(result).toBe(false);
    });
  });

  describe('formatSyncCheckSummary', () => {
    it('formats skipped check', () => {
      const result = formatSyncCheckSummary({
        skipped: true,
        reason: 'not_configured'
      });

      expect(result).toEqual({
        message: 'Sync check skipped',
        details: 'Reason: not_configured'
      });
    });

    it('formats blocked check', () => {
      const result = formatSyncCheckSummary({
        blocked: true,
        reason: 'drift_in_strict_mode'
      });

      expect(result).toEqual({
        message: '❌ Execution blocked by sync check',
        details: 'Run: grabby rules sync'
      });
    });

    it('formats needsSync check', () => {
      const result = formatSyncCheckSummary({
        needsSync: true,
        reason: 'no_lock'
      });

      expect(result).toEqual({
        message: '⚠️  Sync needed',
        details: 'Run: grabby rules sync'
      });
    });

    it('formats drift detected', () => {
      const result = formatSyncCheckSummary({
        drift: {
          changes: [
            { category: 'languages/typescript' },
            { category: 'policies/security' }
          ]
        },
        driftAction: 'warned'
      });

      expect(result).toEqual({
        message: '⚠️  Drift detected (2 changes)',
        details: 'Action: warned'
      });
    });

    it('formats clean check', () => {
      const result = formatSyncCheckSummary({
        needsSync: false,
        drift: null
      });

      expect(result).toEqual({
        message: '✅ Rulesets up to date',
        details: null
      });
    });
  });
});
