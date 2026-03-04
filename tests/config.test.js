const fs = require('fs');
const os = require('os');
const path = require('path');
const { initConfig, loadConfig, setConfigValue, validateConfig, resolveEnv, getTrackingMode, getContractsDirectory } = require('../lib/config.cjs');

describe('config', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('init and load config', () => {
    const result = initConfig(dir);
    expect(result.created).toBe(true);
    const cfg = loadConfig(dir);
    expect(cfg).toHaveProperty('jira');
    expect(cfg).toMatchObject({
      interactive: {
        enabled: false,
        defaultNextAction: null,
      },
      features: {
        menuMode: true,
        startupArt: true,
        rulesetWizard: true,
      },
    });
  });

  test('setConfigValue and validate', () => {
    initConfig(dir);
    const cfg = loadConfig(dir);
    setConfigValue(cfg, 'jira.enabled', 'true');
    setConfigValue(cfg, 'jira.host', 'https://x.atlassian.net');
    setConfigValue(cfg, 'jira.email', 'a@b.com');
    setConfigValue(cfg, 'jira.apiToken', '${JIRA_API_TOKEN}');
    process.env.JIRA_API_TOKEN = 'token';
    const result = validateConfig(cfg);
    expect(result.valid).toBe(true);
  });

  test('resolveEnv resolves variable', () => {
    process.env.TEST_ENV_VAR = 'abc';
    expect(resolveEnv('${TEST_ENV_VAR}')).toBe('abc');
  });

  test('defaults contract tracking mode to tracked', () => {
    initConfig(dir);
    const cfg = loadConfig(dir);
    expect(getTrackingMode(cfg, dir)).toBe('tracked');
    expect(getContractsDirectory(dir, cfg)).toBe(path.join(dir, 'contracts'));
  });

  test('resolves local-only tracking mode to .grabby/contracts', () => {
    initConfig(dir);
    const cfg = loadConfig(dir);
    setConfigValue(cfg, 'contracts.trackingMode', 'local-only');
    expect(getTrackingMode(cfg, dir)).toBe('local-only');
    expect(getContractsDirectory(dir, cfg)).toBe(path.join(dir, '.grabby', 'contracts'));
    expect(validateConfig(cfg).valid).toBe(true);
  });

  test('getConfigPath, saveConfig, and forced init overwrite as expected', () => {
    const first = initConfig(dir);
    const cfg = loadConfig(dir);
    cfg.jira.host = 'https://example.atlassian.net';
    const savedPath = require('../lib/config.cjs').saveConfig(cfg, dir);

    expect(savedPath).toBe(path.join(dir, 'grabby.config.json'));
    expect(require('../lib/config.cjs').getConfigPath(dir)).toBe(savedPath);

    const overwrite = initConfig(dir, { force: true });
    expect(overwrite.created).toBe(true);
    expect(loadConfig(dir).jira.host).toBe('');
    expect(first.file).toBe(savedPath);
  });

  test('loadConfig returns null when no config file exists', () => {
    expect(loadConfig(dir)).toBeNull();
  });

  test('setConfigValue coerces numbers, JSON, nested objects, and rejects invalid paths', () => {
    const cfg = {};
    setConfigValue(cfg, 'jira.sync.autoCreate', 'true');
    setConfigValue(cfg, 'jira.sync.retryCount', '5');
    setConfigValue(cfg, 'jira.defaults.labels', '["grabby","jira"]');
    setConfigValue(cfg, 'contracts.meta', '{"strict":true}');

    expect(cfg).toMatchObject({
      jira: {
        sync: {
          autoCreate: true,
          retryCount: 5,
        },
        defaults: {
          labels: ['grabby', 'jira'],
        },
      },
      contracts: {
        meta: { strict: true },
      },
    });
    expect(() => setConfigValue(cfg, '', 'x')).toThrow('Invalid config path');
  });

  test('getTrackingMode falls back to tracked for invalid values and load-on-demand mode', () => {
    initConfig(dir);
    const cfg = loadConfig(dir);
    setConfigValue(cfg, 'contracts.trackingMode', 'bogus');
    require('../lib/config.cjs').saveConfig(cfg, dir);

    expect(getTrackingMode(null, dir)).toBe('tracked');
    expect(getContractsDirectory(dir, null)).toBe(path.join(dir, 'contracts'));
  });

  test('validateConfig reports object, jira, bedrock, token, and tracking warnings/errors', () => {
    expect(validateConfig(null)).toEqual({
      valid: false,
      errors: ['Config must be an object'],
      warnings: [],
    });

    process.env.JIRA_API_TOKEN = '';
    const bad = {
      jira: {
        enabled: true,
        host: '',
        email: '',
        apiToken: 'plain-token',
        project: '',
        apiVersion: '9',
      },
      ai: {
        provider: 'bedrock',
        providers: { bedrock: {} },
      },
      contracts: {
        trackingMode: 'invalid-mode',
      },
    };

    const result = validateConfig(bad);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'jira.host is required when jira.enabled=true',
      'jira.email is required when jira.enabled=true',
      'jira.project is required when jira.enabled=true',
      'jira.apiVersion must be "2" or "3"',
      'ai.providers.bedrock.region is required when ai.provider=bedrock',
      'contracts.trackingMode must be "tracked" or "local-only"',
    ]));
    expect(result.warnings).toEqual(expect.arrayContaining([
      'jira.apiToken should use an env reference like ${JIRA_API_TOKEN}',
      'contracts.directory not set; defaulting to "contracts"',
    ]));

    const emptyToken = {
      jira: {
        enabled: true,
        host: 'https://example.atlassian.net',
        email: 'user@example.com',
        project: 'PROJ',
        apiToken: '${JIRA_API_TOKEN}',
      },
    };
    expect(validateConfig(emptyToken).errors).toContain('jira.apiToken must resolve to a non-empty value');
  });

  test('validateConfig accepts interactive mode defaults and rejects invalid interactive actions', () => {
    initConfig(dir);
    const cfg = loadConfig(dir);
    setConfigValue(cfg, 'interactive.enabled', 'true');
    setConfigValue(cfg, 'interactive.defaultNextAction', 'pause');

    expect(validateConfig(cfg).valid).toBe(true);

    cfg.interactive.enabled = 'sometimes';
    cfg.interactive.defaultNextAction = 'teleport';
    const result = validateConfig(cfg);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'interactive.enabled must be true or false',
      'interactive.defaultNextAction must be one of: continue, revise-contract, revise-plan, switch-role, pause, abort',
    ]));
  });

  test('validateConfig accepts feature toggles and rejects invalid feature values', () => {
    initConfig(dir);
    const cfg = loadConfig(dir);
    setConfigValue(cfg, 'features.menuMode', 'false');
    setConfigValue(cfg, 'features.startupArt', 'true');
    setConfigValue(cfg, 'features.rulesetWizard', 'true');

    expect(validateConfig(cfg).valid).toBe(true);

    cfg.features.menuMode = 'sometimes';
    const result = validateConfig(cfg);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('features.menuMode must be true or false');
  });
});
