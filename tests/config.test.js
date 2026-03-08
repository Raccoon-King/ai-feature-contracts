const fs = require('fs');
const os = require('os');
const path = require('path');
const { initConfig, loadConfig, setConfigValue, validateConfig, resolveEnv, getTrackingMode, getContractsDirectory, normalizeConfig, normalizePortablePath } = require('../lib/config.cjs');

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

  test('normalizePortablePath normalizes Windows and POSIX path variants', () => {
    expect(normalizePortablePath('apps\\web\\')).toBe('apps/web');
    expect(normalizePortablePath('./docs//rules/')).toBe('./docs/rules');
    expect(normalizePortablePath('C:\\repo\\')).toBe('C:/repo');
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

  test('validateConfig accepts db governance overrides and rejects invalid values', () => {
    initConfig(dir);
    const cfg = loadConfig(dir);
    setConfigValue(cfg, 'dbGovernance.strictArtifactLint', 'true');
    setConfigValue(cfg, 'dbGovernance.discovery.packageRoots', '["packages/api"]');
    setConfigValue(cfg, 'dbGovernance.constraints.ciDbAccess', 'read-only');

    expect(validateConfig(cfg).valid).toBe(true);

    cfg.dbGovernance.discovery.schemaRoots = 'db/schema';
    cfg.dbGovernance.constraints.airgapped = 'sometimes';
    cfg.dbGovernance.constraints.ciDbAccess = 'maybe';
    const result = validateConfig(cfg);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'dbGovernance.discovery.schemaRoots must be an array',
      'dbGovernance.constraints.airgapped must be true or false',
      'dbGovernance.constraints.ciDbAccess must be one of: unspecified, none, read-only, full',
    ]));
  });

  test('validateConfig accepts system governance profile settings and rejects invalid values', () => {
    initConfig(dir);
    const cfg = loadConfig(dir);
    setConfigValue(cfg, 'systemGovernance.profile', 'fullstack');
    setConfigValue(cfg, 'systemGovernance.roots.frontendRoots', '["apps/web"]');
    setConfigValue(cfg, 'systemGovernance.rulesetIngestion.apiCompat', 'true');
    setConfigValue(cfg, 'systemGovernance.constraints.noNetwork', 'true');

    expect(validateConfig(cfg).valid).toBe(true);

    cfg.systemGovernance.profile = 'desktop';
    cfg.systemGovernance.roots.apiSpecRoots = 'specs';
    cfg.systemGovernance.rulesetIngestion.feDeps = 'sometimes';
    cfg.systemGovernance.constraints.strictBackwardsCompat = 'strict';
    const result = validateConfig(cfg);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'systemGovernance.profile must be one of: auto, web-ui, api-service, fullstack',
      'systemGovernance.roots.apiSpecRoots must be an array',
      'systemGovernance.rulesetIngestion.feDeps must be true or false',
      'systemGovernance.constraints.strictBackwardsCompat must be true or false',
    ]));
  });

  test('validateConfig accepts environment topology settings and rejects invalid values', () => {
    initConfig(dir);
    const cfg = loadConfig(dir);
    setConfigValue(cfg, 'systemGovernance.topology.separatedDeployHost', 'true');
    setConfigValue(cfg, 'systemGovernance.topology.devHost', 'box-a');
    setConfigValue(cfg, 'systemGovernance.topology.deployHost', 'box-b');
    setConfigValue(cfg, 'systemGovernance.topology.clusterAccessFromDev', 'false');
    setConfigValue(cfg, 'systemGovernance.topology.helmAccessFromDev', 'false');
    setConfigValue(cfg, 'systemGovernance.topology.artifactGenerationOnly', 'true');

    expect(validateConfig(cfg).valid).toBe(true);

    cfg.systemGovernance.topology.separatedDeployHost = 'sometimes';
    cfg.systemGovernance.topology.devHost = 42;
    const result = validateConfig(cfg);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'systemGovernance.topology.separatedDeployHost must be true or false',
      'systemGovernance.topology.devHost must be a string',
    ]));
  });

  test('validateConfig accepts git governance settings and rejects invalid values', () => {
    initConfig(dir);
    const cfg = loadConfig(dir);
    setConfigValue(cfg, 'gitGovernance.hosting', 'both');
    setConfigValue(cfg, 'gitGovernance.updateStrategy', 'rebase');
    setConfigValue(cfg, 'gitGovernance.protectedBranches', '["main","release"]');
    setConfigValue(cfg, 'gitGovernance.allowDirectDefaultBranchCommits', 'false');
    setConfigValue(cfg, 'gitGovernance.allowForcePush', 'false');
    setConfigValue(cfg, 'gitGovernance.requiredChecks', '["lint","test","guard"]');
    setConfigValue(cfg, 'gitGovernance.freshnessThresholdBehind', '1');

    expect(validateConfig(cfg).valid).toBe(true);

    cfg.gitGovernance.hosting = 'bitbucket';
    cfg.gitGovernance.updateStrategy = 'cherry-pick';
    cfg.gitGovernance.collaborationModel = 'surprise';
    cfg.gitGovernance.protectedBranches = 'main';
    cfg.gitGovernance.allowDirectDefaultBranchCommits = 'sometimes';
    cfg.gitGovernance.allowRebaseAfterReviewOpen = 'sometimes';
    cfg.gitGovernance.requiredChecks = 'lint';
    cfg.gitGovernance.freshnessThresholdBehind = -1;
    const result = validateConfig(cfg);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'gitGovernance.hosting must be one of: gitlab, github, both',
      'gitGovernance.updateStrategy must be one of: repo-default, rebase, merge, squash',
      'gitGovernance.collaborationModel must be one of: repo-default, forks, shared-branches',
      'gitGovernance.protectedBranches must be an array',
      'gitGovernance.allowDirectDefaultBranchCommits must be true or false',
      'gitGovernance.allowRebaseAfterReviewOpen must be true or false',
      'gitGovernance.requiredChecks must be an array',
      'gitGovernance.freshnessThresholdBehind must be a non-negative integer',
    ]));
  });

  test('validateConfig accepts plugin settings and rejects invalid plugin values', () => {
    initConfig(dir);
    const cfg = loadConfig(dir);
    setConfigValue(cfg, 'plugins.autoSuggestOnInit', 'true');
    setConfigValue(cfg, 'plugins.items.kubernetes', '{"enabled":true,"mode":"active","roots":["deploy/k8s"],"detected":true,"source":"builtin"}');

    expect(validateConfig(cfg).valid).toBe(true);

    cfg.plugins.autoSuggestOnInit = 'sometimes';
    cfg.plugins.items.helm = 'invalid';
    cfg.plugins.items.kubernetes.mode = 'dangerous';
    const result = validateConfig(cfg);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'plugins.autoSuggestOnInit must be true or false',
      'plugins.items.helm must be an object',
      'plugins.items.kubernetes.mode must be one of: off, read-only, active',
    ]));
  });

  test('validateConfig accepts plugin environment constraints and rejects invalid values', () => {
    initConfig(dir);
    const cfg = loadConfig(dir);
    setConfigValue(cfg, 'plugins.items.helm', '{"enabled":true,"mode":"active","detected":true,"source":"builtin","constraints":{"offlineOnly":true,"noRemoteAccess":true,"noClusterAccess":true,"generateArtifactsOnly":true}}');

    expect(validateConfig(cfg).valid).toBe(true);

    cfg.plugins.items.helm.constraints = 'invalid';
    cfg.plugins.items.kubernetes = { enabled: true, mode: 'active', constraints: { offlineOnly: 'sometimes' } };
    const result = validateConfig(cfg);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'plugins.items.helm.constraints must be an object',
      'plugins.items.kubernetes.constraints.offlineOnly must be true or false',
    ]));
  });

  test('loadConfig and saveConfig normalize platform-sensitive path arrays', () => {
    initConfig(dir);
    const cfg = loadConfig(dir);
    cfg.contracts.directory = 'contracts\\active\\';
    cfg.contracts.templates = '.grabby\\templates\\';
    cfg.dbGovernance.discovery.packageRoots = ['packages\\api\\'];
    cfg.systemGovernance.roots.frontendRoots = ['apps\\web\\'];

    require('../lib/config.cjs').saveConfig(cfg, dir);

    const loaded = loadConfig(dir);
    expect(loaded.contracts.directory).toBe('contracts/active');
    expect(loaded.contracts.templates).toBe('.grabby/templates');
    expect(loaded.dbGovernance.discovery.packageRoots).toEqual(['packages/api']);
    expect(loaded.systemGovernance.roots.frontendRoots).toEqual(['apps/web']);
  });

  test('normalizeConfig leaves non-path settings intact while normalizing path fields', () => {
    const normalized = normalizeConfig({
      contracts: { directory: 'contracts\\', templates: '.grabby\\templates\\' },
      dbGovernance: { discovery: { packageRoots: ['packages\\api\\'] } },
      systemGovernance: { profile: 'fullstack', roots: { backendRoots: ['services\\api\\'] } },
      gitGovernance: { defaultBranch: 'main', freshnessThresholdBehind: 1 },
    });

    expect(normalized.contracts.directory).toBe('contracts');
    expect(normalized.contracts.templates).toBe('.grabby/templates');
    expect(normalized.dbGovernance.discovery.packageRoots).toEqual(['packages/api']);
    expect(normalized.systemGovernance.roots.backendRoots).toEqual(['services/api']);
    expect(normalized.gitGovernance.defaultBranch).toBe('main');
    expect(normalized.gitGovernance.freshnessThresholdBehind).toBe(1);
  });
});
