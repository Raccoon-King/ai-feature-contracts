const fs = require('fs');
const path = require('path');

function getConfigPath(cwd = process.cwd()) {
  return path.join(cwd, 'grabby.config.json');
}

function defaultConfig() {
  return {
    $schema: 'https://grabby.dev/schemas/config.json',
    version: '1.0',
    jira: {
      enabled: false,
      host: '',
      email: '',
      apiToken: '${JIRA_API_TOKEN}',
      project: 'PROJ',
      deploymentType: 'cloud',
      apiVersion: '3',
      defaults: {
        issueType: 'Story',
        labels: ['grabby', 'feature-contract'],
      },
      customFields: {
        contractId: '',
      },
      sync: {
        autoCreate: false,
        autoUpdate: false,
        bidirectional: false,
        statusMapping: {
          draft: 'To Do',
          approved: 'In Progress',
          executing: 'In Progress',
          completed: 'Done',
          archived: 'Done',
        },
      },
    },
    ai: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      apiKey: '${ANTHROPIC_API_KEY}',
      providers: {
        bedrock: { region: 'us-east-1', profile: 'default' },
      },
    },
    contracts: {
      directory: 'contracts',
      templates: '.grabby/templates',
      autoValidate: true,
      strictMode: false,
    },
  };
}

function initConfig(cwd = process.cwd(), { force = false } = {}) {
  const file = getConfigPath(cwd);
  if (fs.existsSync(file) && !force) return { created: false, file };
  fs.writeFileSync(file, JSON.stringify(defaultConfig(), null, 2) + '\n');
  return { created: true, file };
}

function loadConfig(cwd = process.cwd()) {
  const file = getConfigPath(cwd);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function saveConfig(config, cwd = process.cwd()) {
  const file = getConfigPath(cwd);
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
  return file;
}

function setConfigValue(config, dottedPath, rawValue) {
  const parts = dottedPath.split('.').filter(Boolean);
  if (parts.length === 0) throw new Error('Invalid config path');

  let value = rawValue;
  if (rawValue === 'true') value = true;
  else if (rawValue === 'false') value = false;
  else if (!Number.isNaN(Number(rawValue)) && rawValue.trim() !== '') value = Number(rawValue);
  else {
    try { value = JSON.parse(rawValue); } catch (_) {}
  }

  let cur = config;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
  return config;
}

function resolveEnv(value) {
  if (typeof value !== 'string') return value;
  const m = value.match(/^\$\{([A-Z0-9_]+)\}$/);
  if (!m) return value;
  return process.env[m[1]] || '';
}

function validateConfig(config) {
  const errors = [];
  const warnings = [];

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Config must be an object'], warnings };
  }

  if (config.jira?.enabled) {
    if (!config.jira.host) errors.push('jira.host is required when jira.enabled=true');
    if (!config.jira.email) errors.push('jira.email is required when jira.enabled=true');
    if (!config.jira.project) errors.push('jira.project is required when jira.enabled=true');

    if (typeof config.jira.apiToken === 'string' && !/^\$\{[A-Z0-9_]+\}$/.test(config.jira.apiToken)) {
      warnings.push('jira.apiToken should use an env reference like ${JIRA_API_TOKEN}');
    }

    const token = resolveEnv(config.jira.apiToken);
    if (!token) errors.push('jira.apiToken must resolve to a non-empty value');

    const v = String(config.jira.apiVersion || '3');
    if (!['2', '3'].includes(v)) errors.push('jira.apiVersion must be "2" or "3"');
  }

  if (config.ai?.provider === 'bedrock' && !config.ai.providers?.bedrock?.region) {
    errors.push('ai.providers.bedrock.region is required when ai.provider=bedrock');
  }

  if (!config.contracts?.directory) warnings.push('contracts.directory not set; defaulting to "contracts"');

  return { valid: errors.length === 0, errors, warnings };
}

module.exports = {
  getConfigPath,
  defaultConfig,
  initConfig,
  loadConfig,
  saveConfig,
  setConfigValue,
  resolveEnv,
  validateConfig,
};
