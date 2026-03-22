const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  syncCommand,
  listCommand,
  searchCommand,
  showCommand,
  addCommand,
  removeCommand,
  statusCommand,
  presetCommand
} = require('../lib/rules-cli.cjs');

// Mock dependencies
jest.mock('fs');
jest.mock('../lib/config.cjs');
jest.mock('../lib/manifest-parser.cjs');
jest.mock('../lib/sync-lock.cjs');
jest.mock('../lib/rules-sync.cjs');

const { loadConfig, saveConfig } = require('../lib/config.cjs');
const { parseManifestFile, getAllRulesets, findRuleset, resolvePreset, listCategories } = require('../lib/manifest-parser.cjs');
const { readLock, writeLock, initLock, updateActiveRuleset, removeActiveRuleset, findActiveRuleset, getLockAge } = require('../lib/sync-lock.cjs');
const { syncWithCentral, detectDrift, isGitAvailable } = require('../lib/rules-sync.cjs');

// Suppress console output during tests
global.console = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
};

describe('rules-cli', () => {
  let tempDir;

  beforeEach(() => {
    jest.clearAllMocks();
    tempDir = '/tmp/test';
  });

  describe('syncCommand', () => {
    test('fails without central repository config', async () => {
      loadConfig.mockReturnValue({});

      const exitCode = await syncCommand({}, tempDir);
      expect(exitCode).toBe(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('No central repository configured'));
    });

    test('fails when git is not available', async () => {
      loadConfig.mockReturnValue({
        rulesets: {
          source: { repo: 'https://github.com/test/repo.git' }
        }
      });
      isGitAvailable.mockReturnValue(false);

      const exitCode = await syncCommand({}, tempDir);
      expect(exitCode).toBe(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Git is not available'));
    });

    test('syncs successfully and updates lock', async () => {
      loadConfig.mockReturnValue({
        rulesets: {
          source: { repo: 'https://github.com/test/repo.git', branch: 'main' },
          lockPath: '.grabby/rulesets/sync.lock.yaml',
          active: ['languages/typescript']
        }
      });
      isGitAvailable.mockReturnValue(true);
      syncWithCentral.mockResolvedValue({
        success: true,
        manifest: {
          version: '1.0.0',
          categories: {}
        },
        manifestPath: '/tmp/test/.grabby/rulesets/cache/central-repo/manifest.yaml',
        source: {
          repo: 'https://github.com/test/repo.git',
          branch: 'main',
          commit: 'abc123',
          version: '1.0.0'
        }
      });
      readLock.mockReturnValue(null);
      initLock.mockReturnValue({
        version: 1,
        lastSync: '2026-03-20T10:30:00Z',
        source: {},
        active: []
      });
      getAllRulesets.mockReturnValue([
        { ref: 'languages/typescript', name: 'typescript', version: '1.0.0' }
      ]);
      fs.existsSync.mockReturnValue(false);

      const exitCode = await syncCommand({}, tempDir);
      expect(exitCode).toBe(0);
      expect(syncWithCentral).toHaveBeenCalled();
      expect(writeLock).toHaveBeenCalled();
      expect(writeLock.mock.calls[0][0].active).toEqual([
        expect.objectContaining({
          category: 'languages/typescript',
          name: 'typescript',
          version: '1.0.0'
        })
      ]);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Sync successful'));
    });

    test('handles sync errors gracefully', async () => {
      loadConfig.mockReturnValue({
        rulesets: {
          source: { repo: 'https://github.com/test/repo.git' }
        }
      });
      isGitAvailable.mockReturnValue(true);
      syncWithCentral.mockRejectedValue(new Error('Network error'));

      const exitCode = await syncCommand({}, tempDir);
      expect(exitCode).toBe(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Sync error'));
    });
  });

  describe('listCommand', () => {
    test('fails without central repository config', async () => {
      loadConfig.mockReturnValue({});

      const exitCode = await listCommand({}, tempDir);
      expect(exitCode).toBe(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('No central repository configured'));
    });

    test('warns when manifest not cached', async () => {
      loadConfig.mockReturnValue({
        rulesets: {
          source: { repo: 'https://github.com/test/repo.git' },
          cacheDir: '.grabby/rulesets/cache'
        }
      });
      fs.existsSync.mockReturnValue(false);

      const exitCode = await listCommand({}, tempDir);
      expect(exitCode).toBe(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('No cached manifest found'));
    });

    test('lists all rulesets', async () => {
      loadConfig.mockReturnValue({
        rulesets: {
          source: { repo: 'https://github.com/test/repo.git' },
          cacheDir: '.grabby/rulesets/cache',
          lockPath: '.grabby/rulesets/sync.lock.yaml'
        }
      });
      fs.existsSync.mockReturnValue(true);
      parseManifestFile.mockReturnValue({
        categories: {
          languages: {
            description: 'Languages',
            rulesets: [
              { name: 'typescript', version: '1.0.0', tags: ['frontend'] }
            ]
          }
        }
      });
      listCategories.mockReturnValue([
        { name: 'languages', description: 'Languages', rulesetCount: 1 }
      ]);
      readLock.mockReturnValue({
        active: [{ category: 'languages/typescript', version: '1.0.0' }]
      });

      const exitCode = await listCommand({}, tempDir);
      expect(exitCode).toBe(0);
      expect(console.log).toHaveBeenCalled();
    });

    test('filters by category', async () => {
      loadConfig.mockReturnValue({
        rulesets: {
          source: { repo: 'https://github.com/test/repo.git' },
          cacheDir: '.grabby/rulesets/cache',
          lockPath: '.grabby/rulesets/sync.lock.yaml'
        }
      });
      fs.existsSync.mockReturnValue(true);
      parseManifestFile.mockReturnValue({
        categories: {
          languages: {
            description: 'Languages',
            rulesets: [
              { name: 'typescript', version: '1.0.0' }
            ]
          }
        }
      });
      listCategories.mockReturnValue([
        { name: 'languages', description: 'Languages', rulesetCount: 1 },
        { name: 'frameworks', description: 'Frameworks', rulesetCount: 1 }
      ]);
      readLock.mockReturnValue({ active: [] });

      const exitCode = await listCommand({ category: 'languages' }, tempDir);
      expect(exitCode).toBe(0);
    });
  });

  describe('searchCommand', () => {
    test('requires search query', async () => {
      const exitCode = await searchCommand(null, {}, tempDir);
      expect(exitCode).toBe(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Search query required'));
    });

    test('searches rulesets by name', async () => {
      loadConfig.mockReturnValue({
        rulesets: { cacheDir: '.grabby/rulesets/cache' }
      });
      fs.existsSync.mockReturnValue(true);
      parseManifestFile.mockReturnValue({ categories: {} });
      getAllRulesets.mockReturnValue([
        {
          name: 'typescript',
          category: 'languages',
          version: '1.0.0',
          ref: 'languages/typescript',
          tags: ['frontend']
        },
        {
          name: 'javascript',
          category: 'languages',
          version: '1.0.0',
          ref: 'languages/javascript',
          tags: ['frontend']
        }
      ]);

      const exitCode = await searchCommand('typescript', {}, tempDir);
      expect(exitCode).toBe(0);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Found 1 ruleset'));
    });

    test('shows no results message when nothing found', async () => {
      loadConfig.mockReturnValue({
        rulesets: { cacheDir: '.grabby/rulesets/cache' }
      });
      fs.existsSync.mockReturnValue(true);
      parseManifestFile.mockReturnValue({ categories: {} });
      getAllRulesets.mockReturnValue([]);

      const exitCode = await searchCommand('python', {}, tempDir);
      expect(exitCode).toBe(0);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No rulesets found'));
    });
  });

  describe('showCommand', () => {
    test('requires ruleset reference', async () => {
      const exitCode = await showCommand(null, {}, tempDir);
      expect(exitCode).toBe(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Ruleset reference required'));
    });

    test('validates reference format', async () => {
      const exitCode = await showCommand('invalid-format', {}, tempDir);
      expect(exitCode).toBe(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Invalid format'));
    });

    test('shows ruleset details', async () => {
      loadConfig.mockReturnValue({
        rulesets: {
          cacheDir: '.grabby/rulesets/cache',
          lockPath: '.grabby/rulesets/sync.lock.yaml'
        }
      });
      fs.existsSync.mockReturnValue(true);
      parseManifestFile.mockReturnValue({
        categories: {
          languages: {
            description: 'Programming languages'
          }
        }
      });
      findRuleset.mockReturnValue({
        name: 'typescript',
        version: '1.0.0',
        tags: ['frontend'],
        extends: [],
        compatibleWith: ['frameworks/react']
      });
      readLock.mockReturnValue({ active: [] });
      findActiveRuleset.mockReturnValue(null);

      const exitCode = await showCommand('languages/typescript', {}, tempDir);
      expect(exitCode).toBe(0);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Ruleset:'));
    });

    test('returns error for non-existent ruleset', async () => {
      loadConfig.mockReturnValue({
        rulesets: { cacheDir: '.grabby/rulesets/cache' }
      });
      fs.existsSync.mockReturnValue(true);
      parseManifestFile.mockReturnValue({ categories: {} });
      findRuleset.mockReturnValue(null);

      const exitCode = await showCommand('languages/python', {}, tempDir);
      expect(exitCode).toBe(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Ruleset not found'));
    });
  });

  describe('addCommand', () => {
    test('requires ruleset reference', async () => {
      const exitCode = await addCommand(null, {}, tempDir);
      expect(exitCode).toBe(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Ruleset reference required'));
    });

    test('validates reference format', async () => {
      const exitCode = await addCommand('invalid', {}, tempDir);
      expect(exitCode).toBe(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Invalid format'));
    });

    test('adds ruleset to config', async () => {
      loadConfig.mockReturnValue({
        rulesets: {
          cacheDir: '.grabby/rulesets/cache',
          active: []
        }
      });
      fs.existsSync.mockReturnValue(true);
      parseManifestFile.mockReturnValue({ categories: {} });
      findRuleset.mockReturnValue({
        name: 'typescript',
        version: '1.0.0'
      });

      const exitCode = await addCommand('languages/typescript', {}, tempDir);
      expect(exitCode).toBe(0);
      expect(saveConfig).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Added languages/typescript'));
    });

    test('handles already active ruleset', async () => {
      loadConfig.mockReturnValue({
        rulesets: {
          cacheDir: '.grabby/rulesets/cache',
          active: ['languages/typescript']
        }
      });
      fs.existsSync.mockReturnValue(true);
      parseManifestFile.mockReturnValue({ categories: {} });
      findRuleset.mockReturnValue({
        name: 'typescript',
        version: '1.0.0'
      });

      const exitCode = await addCommand('languages/typescript', {}, tempDir);
      expect(exitCode).toBe(0);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('already active'));
    });
  });

  describe('removeCommand', () => {
    test('removes ruleset from config', async () => {
      loadConfig.mockReturnValue({
        rulesets: {
          lockPath: '.grabby/rulesets/sync.lock.yaml',
          active: ['languages/typescript', 'frameworks/react']
        }
      });
      readLock.mockReturnValue({ active: [] });
      removeActiveRuleset.mockReturnValue({ active: [] });

      const exitCode = await removeCommand('languages/typescript', {}, tempDir);
      expect(exitCode).toBe(0);
      expect(saveConfig).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Removed languages/typescript'));
    });

    test('handles non-active ruleset', async () => {
      loadConfig.mockReturnValue({
        rulesets: {
          active: ['frameworks/react']
        }
      });

      const exitCode = await removeCommand('languages/typescript', {}, tempDir);
      expect(exitCode).toBe(0);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('not active'));
    });
  });

  describe('statusCommand', () => {
    test('warns when not configured', async () => {
      loadConfig.mockReturnValue({});

      const exitCode = await statusCommand({}, tempDir);
      expect(exitCode).toBe(1);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No central repository configured'));
    });

    test('warns when not synced', async () => {
      loadConfig.mockReturnValue({
        rulesets: {
          source: { repo: 'https://github.com/test/repo.git' },
          lockPath: '.grabby/rulesets/sync.lock.yaml'
        }
      });
      readLock.mockReturnValue(null);

      const exitCode = await statusCommand({}, tempDir);
      expect(exitCode).toBe(1);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Not synced yet'));
    });

    test('shows status with drift detection', async () => {
      loadConfig.mockReturnValue({
        rulesets: {
          source: { repo: 'https://github.com/test/repo.git' },
          lockPath: '.grabby/rulesets/sync.lock.yaml',
          cacheDir: '.grabby/rulesets/cache'
        }
      });
      readLock.mockReturnValue({
        version: 1,
        lastSync: '2026-03-20T10:30:00Z',
        source: {
          repo: 'https://github.com/test/repo.git',
          branch: 'main',
          commit: 'abc123def',
          version: '1.0.0'
        },
        active: [
          { category: 'languages/typescript', version: '1.0.0' }
        ]
      });
      getLockAge.mockReturnValue(2 * 60 * 60 * 1000); // 2 hours
      fs.existsSync.mockReturnValue(true);
      parseManifestFile.mockReturnValue({ categories: {} });
      detectDrift.mockReturnValue({
        detected: false,
        changes: []
      });

      const exitCode = await statusCommand({}, tempDir);
      expect(exitCode).toBe(0);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Sync Status'));
    });
  });

  describe('presetCommand', () => {
    test('requires preset name', async () => {
      const exitCode = await presetCommand(null, {}, tempDir);
      expect(exitCode).toBe(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Preset name required'));
    });

    test('applies preset bundle', async () => {
      loadConfig.mockReturnValue({
        rulesets: {
          cacheDir: '.grabby/rulesets/cache',
          active: []
        }
      });
      fs.existsSync.mockReturnValue(true);
      parseManifestFile.mockReturnValue({ categories: {} });
      resolvePreset.mockReturnValue({
        name: 'fullstack-typescript',
        description: 'Full-stack TypeScript',
        includes: ['languages/typescript', 'frameworks/react']
      });
      findRuleset.mockReturnValue({ version: '1.0.0' });

      const exitCode = await presetCommand('fullstack-typescript', {}, tempDir);
      expect(exitCode).toBe(0);
      expect(saveConfig).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Added 2 rulesets'));
    });

    test('handles non-existent preset', async () => {
      loadConfig.mockReturnValue({
        rulesets: { cacheDir: '.grabby/rulesets/cache' }
      });
      fs.existsSync.mockReturnValue(true);
      parseManifestFile.mockReturnValue({ categories: {} });
      resolvePreset.mockImplementation(() => {
        throw new Error('Preset not found: invalid');
      });

      const exitCode = await presetCommand('invalid', {}, tempDir);
      expect(exitCode).toBe(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Preset not found'));
    });
  });
});
