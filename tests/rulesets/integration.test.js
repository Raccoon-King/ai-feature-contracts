const fs = require('fs');
const os = require('os');
const path = require('path');
const rulesets = require('../../lib/rulesets/index.cjs');

describe('rulesets module surface', () => {
  test('exports the reorganized rulesets entry points', () => {
    expect(typeof rulesets.sync.syncWithCentral).toBe('function');
    expect(typeof rulesets.cli.syncCommand).toBe('function');
    expect(typeof rulesets.contractIntegration.performSyncCheck).toBe('function');
    expect(typeof rulesets.authoring.generateSharedRules).toBe('function');
    expect(typeof rulesets.builder.discoverRulesetCandidates).toBe('function');
    expect(typeof rulesets.registry.fetchRuleset).toBe('function');
    expect(typeof rulesets.common.manifestParser.parseManifestFile).toBe('function');
    expect(typeof rulesets.common.syncLock.readLock).toBe('function');
  });

  test('exports the rulesets plugin manifest', () => {
    expect(rulesets.plugin).toEqual(expect.objectContaining({
      id: 'rulesets',
      name: 'Rulesets',
      version: '1.0.0',
      hooks: expect.objectContaining({
        onValidate: expect.any(Function),
        onPlan: expect.any(Function),
        onExecute: expect.any(Function),
        onContractCreate: expect.any(Function),
      }),
    }));
  });
});

describe('rulesets plugin hooks', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-rulesets-plugin-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('onContractCreate returns cancel:false when no contractPath', async () => {
    const result = await rulesets.plugin.hooks.onContractCreate({});
    expect(result).toEqual({ cancel: false });
  });

  test('onContractCreate handles missing contract gracefully', async () => {
    const result = await rulesets.plugin.hooks.onContractCreate({
      contractPath: path.join(dir, 'missing.fc.md'),
      cwd: dir,
    });
    expect(result).toEqual({ cancel: false });
  });

  test('onValidate returns cancel:false when rulesets not configured', async () => {
    const logs = [];
    const logger = { log: (msg) => logs.push(msg), warn: (msg) => logs.push(msg) };
    const result = await rulesets.plugin.hooks.onValidate({ cwd: dir, logger });
    expect(result.cancel).toBe(false);
  });

  test('onPlan returns cancel:false when rulesets not configured', async () => {
    const logs = [];
    const logger = { log: (msg) => logs.push(msg), warn: (msg) => logs.push(msg) };
    const result = await rulesets.plugin.hooks.onPlan({ cwd: dir, logger });
    expect(result.cancel).toBe(false);
  });

  test('onExecute returns cancel:false when rulesets not configured', async () => {
    const logs = [];
    const logger = { log: (msg) => logs.push(msg), warn: (msg) => logs.push(msg) };
    const result = await rulesets.plugin.hooks.onExecute({ cwd: dir, logger });
    expect(result.cancel).toBe(false);
  });

  test('onValidate returns result from performSyncCheck', async () => {
    fs.writeFileSync(path.join(dir, 'grabby.config.json'), JSON.stringify({
      rulesets: {
        source: { repo: '' },
        sync: { checkOnCommands: ['validate'] },
      },
    }), 'utf8');

    const logs = [];
    const logger = { log: (msg) => logs.push(msg), warn: (msg) => logs.push(msg) };
    const result = await rulesets.plugin.hooks.onValidate({ cwd: dir, logger });

    expect(result.cancel).toBe(false);
    expect(result.result).toBeDefined();
    expect(result.result.skipped).toBe(true);
  });

  test('onValidate with blocking disabled logs warning and continues', async () => {
    const YAML = require('yaml');
    const cacheDir = path.join(dir, '.grabby', 'rulesets', 'cache', 'central-repo');
    const lockDir = path.join(dir, '.grabby', 'rulesets');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.mkdirSync(lockDir, { recursive: true });

    fs.writeFileSync(path.join(dir, 'grabby.config.json'), JSON.stringify({
      rulesets: {
        source: { repo: 'https://github.com/test/rules.git', branch: 'main' },
        active: ['languages/javascript'],
        sync: {
          mode: 'warn',
          checkOnCommands: ['validate'],
          blocking: false,
        },
        cacheDir: '.grabby/rulesets/cache',
        lockPath: '.grabby/rulesets/sync.lock.yaml',
      },
    }), 'utf8');

    fs.writeFileSync(path.join(cacheDir, 'manifest.yaml'), YAML.stringify({
      version: '2.0.0',
      lastUpdated: new Date().toISOString(),
      categories: {
        languages: {
          description: 'Language rulesets',
          rulesets: [{ name: 'javascript', version: '2.0.0' }],
        },
      },
    }), 'utf8');

    const lockContent = {
      version: 1,
      lastSync: new Date().toISOString(),
      source: { repo: 'https://github.com/test/rules.git', branch: 'main', version: '1.0.0' },
      active: [{
        category: 'languages/javascript',
        version: '1.0.0',
        hash: 'sha256:abc123def456789',
        fetchedAt: new Date().toISOString(),
      }],
    };
    fs.writeFileSync(path.join(lockDir, 'sync.lock.yaml'), YAML.stringify(lockContent), 'utf8');

    const logs = [];
    const logger = { log: (msg) => logs.push(msg), warn: (msg) => logs.push(msg) };
    const result = await rulesets.plugin.hooks.onValidate({ cwd: dir, logger });

    expect(result.cancel).toBe(false);
  });

  test('runSyncCheck updates contract metadata when contractPath provided', async () => {
    const YAML = require('yaml');
    const cacheDir = path.join(dir, '.grabby', 'rulesets', 'cache', 'central-repo');
    const lockDir = path.join(dir, '.grabby', 'rulesets');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.mkdirSync(lockDir, { recursive: true });

    fs.writeFileSync(path.join(dir, 'grabby.config.json'), JSON.stringify({
      rulesets: {
        source: { repo: 'https://github.com/test/rules.git', branch: 'main' },
        active: ['languages/javascript'],
        sync: {
          mode: 'warn',
          checkOnCommands: ['validate'],
          blocking: false,
        },
        metadata: { enabled: true, location: 'frontmatter' },
        cacheDir: '.grabby/rulesets/cache',
        lockPath: '.grabby/rulesets/sync.lock.yaml',
      },
    }), 'utf8');

    fs.writeFileSync(path.join(cacheDir, 'manifest.yaml'), YAML.stringify({
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      categories: {
        languages: {
          description: 'Language rulesets',
          rulesets: [{ name: 'javascript', version: '1.0.0' }],
        },
      },
    }), 'utf8');

    const lockContent = {
      version: 1,
      lastSync: new Date().toISOString(),
      source: { repo: 'https://github.com/test/rules.git', branch: 'main', version: '1.0.0' },
      active: [{
        category: 'languages/javascript',
        version: '1.0.0',
        hash: 'sha256:abc123def456789',
        fetchedAt: new Date().toISOString(),
      }],
    };
    fs.writeFileSync(path.join(lockDir, 'sync.lock.yaml'), YAML.stringify(lockContent), 'utf8');

    const contractPath = path.join(dir, 'test.fc.md');
    fs.writeFileSync(contractPath, '# Test Contract\n', 'utf8');

    const logs = [];
    const logger = { log: (msg) => logs.push(msg), warn: (msg) => logs.push(msg) };
    const result = await rulesets.plugin.hooks.onValidate({
      cwd: dir,
      logger,
      contractPath,
    });

    expect(result.cancel).toBe(false);
    const contractContent = fs.readFileSync(contractPath, 'utf8');
    expect(contractContent).toContain('rulesets:');
  });

  test('onValidate returns cancel:true when blocking enabled and drift detected', async () => {
    const YAML = require('yaml');
    const cacheDir = path.join(dir, '.grabby', 'rulesets', 'cache', 'central-repo');
    const lockDir = path.join(dir, '.grabby', 'rulesets');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.mkdirSync(lockDir, { recursive: true });

    fs.writeFileSync(path.join(dir, 'grabby.config.json'), JSON.stringify({
      rulesets: {
        source: { repo: 'https://github.com/test/rules.git', branch: 'main' },
        active: ['languages/javascript'],
        sync: {
          mode: 'strict',
          checkOnCommands: ['validate'],
          blocking: true,
        },
        cacheDir: '.grabby/rulesets/cache',
        lockPath: '.grabby/rulesets/sync.lock.yaml',
      },
    }), 'utf8');

    fs.writeFileSync(path.join(cacheDir, 'manifest.yaml'), YAML.stringify({
      version: '2.0.0',
      lastUpdated: new Date().toISOString(),
      categories: {
        languages: {
          description: 'Language rulesets',
          rulesets: [{ name: 'javascript', version: '2.0.0' }],
        },
      },
    }), 'utf8');

    const lockContent = {
      version: 1,
      lastSync: new Date().toISOString(),
      source: { repo: 'https://github.com/test/rules.git', branch: 'main', version: '1.0.0' },
      active: [{
        category: 'languages/javascript',
        version: '1.0.0',
        hash: 'sha256:abc123def456789',
        fetchedAt: new Date().toISOString(),
      }],
    };
    fs.writeFileSync(path.join(lockDir, 'sync.lock.yaml'), YAML.stringify(lockContent), 'utf8');

    const logs = [];
    const logger = {
      log: (msg) => logs.push(msg),
      warn: (msg) => logs.push(msg),
      error: (msg) => logs.push(msg),
    };
    const result = await rulesets.plugin.hooks.onValidate({ cwd: dir, logger });

    expect(result.cancel).toBe(true);
    expect(result.reason).toContain('blocked');
  });

  test('onValidate logs warning when drift detected but blocking is disabled', async () => {
    const YAML = require('yaml');
    const cacheDir = path.join(dir, '.grabby', 'rulesets', 'cache', 'central-repo');
    const lockDir = path.join(dir, '.grabby', 'rulesets');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.mkdirSync(lockDir, { recursive: true });

    fs.writeFileSync(path.join(dir, 'grabby.config.json'), JSON.stringify({
      rulesets: {
        source: { repo: 'https://github.com/test/rules.git', branch: 'main' },
        active: ['languages/javascript'],
        sync: {
          mode: 'warn',
          checkOnCommands: ['validate'],
          blocking: false,
        },
        cacheDir: '.grabby/rulesets/cache',
        lockPath: '.grabby/rulesets/sync.lock.yaml',
      },
    }), 'utf8');

    fs.writeFileSync(path.join(cacheDir, 'manifest.yaml'), YAML.stringify({
      version: '2.0.0',
      lastUpdated: new Date().toISOString(),
      categories: {
        languages: {
          description: 'Language rulesets',
          rulesets: [{ name: 'javascript', version: '2.0.0' }],
        },
      },
    }), 'utf8');

    const lockContent = {
      version: 1,
      lastSync: new Date().toISOString(),
      source: { repo: 'https://github.com/test/rules.git', branch: 'main', version: '1.0.0' },
      active: [{
        category: 'languages/javascript',
        version: '1.0.0',
        hash: 'sha256:abc123def456789',
        fetchedAt: new Date().toISOString(),
      }],
    };
    fs.writeFileSync(path.join(lockDir, 'sync.lock.yaml'), YAML.stringify(lockContent), 'utf8');

    const logs = [];
    const logger = {
      log: (msg) => logs.push(msg),
      warn: (msg) => logs.push(msg),
      error: (msg) => logs.push(msg),
    };
    const result = await rulesets.plugin.hooks.onValidate({ cwd: dir, logger });

    expect(result.cancel).toBe(false);
  });
});

describe('registry frontmatter integration', () => {
  const { parseRuleset, parseRulesetWithFrontmatter, DEFAULT_METADATA } = require('../../lib/rulesets/registry.cjs');

  test('parseRuleset extracts metadata from frontmatter', () => {
    const content = `---
id: languages/dotnet
scope: global
kind: language
priority: 100
extends:
  - policies/security
---

# RULESET: .NET

## Purpose
- Standards for C# and .NET projects

## Standards
- Use SDK-style projects`;

    const result = parseRuleset(content, 'test-source');

    expect(result.name).toBe('.NET');
    expect(result.source).toBe('test-source');
    expect(result.metadata.id).toBe('languages/dotnet');
    expect(result.metadata.scope).toBe('global');
    expect(result.metadata.kind).toBe('language');
    expect(result.metadata.priority).toBe(100);
    expect(result.extends).toContain('policies/security');
    expect(result.frontmatterValid).toBe(true);
  });

  test('parseRuleset handles legacy rulesets without frontmatter', () => {
    const content = `# RULESET: Legacy Rules

extends: base-rules

## Purpose
- Legacy format support

## Standards
- Follow existing patterns`;

    const result = parseRuleset(content, 'legacy-source');

    expect(result.name).toBe('Legacy Rules');
    expect(result.metadata).toEqual(DEFAULT_METADATA);
    expect(result.extends).toContain('base-rules');
    expect(result.frontmatterValid).toBe(true);
  });

  test('parseRuleset reports frontmatter validation errors', () => {
    const content = `---
scope: invalid-scope
kind: not-a-kind
---

# RULESET: Invalid`;

    const result = parseRuleset(content, 'invalid-source');

    expect(result.frontmatterValid).toBe(false);
    expect(result.frontmatterErrors.length).toBeGreaterThan(0);
  });

  test('parseRuleset uses frontmatter extends over content extends', () => {
    const content = `---
extends:
  - frontmatter/base
---

# RULESET: Priority Test

extends: content-base

## Purpose
- Test priority`;

    const result = parseRuleset(content, 'priority-test');

    expect(result.extends).toContain('frontmatter/base');
    expect(result.extends).not.toContain('content-base');
  });

  test('parseRulesetWithFrontmatter is re-exported', () => {
    expect(typeof parseRulesetWithFrontmatter).toBe('function');
    expect(typeof DEFAULT_METADATA).toBe('object');
  });
});
