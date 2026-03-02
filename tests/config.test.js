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
});
