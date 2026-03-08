const fs = require('fs');
const path = require('path');
const { readJsonSafe, writeJsonAtomic, ensureDir } = require('./fs-utils.cjs');

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
      trackingMode: 'tracked',
      templates: '.grabby/templates',
      autoValidate: true,
      strictMode: false,
    },
    interactive: {
      enabled: false,
      defaultNextAction: null,
    },
    features: {
      menuMode: true,
      startupArt: true,
      rulesetWizard: true,
    },
    bmadFeatures: {
      adaptiveHelp: false,
      quickFlowGuardrails: false,
      riskTieredVerification: false,
    },
    llmContext: {
      mode: 'standard',
      planTokenBudget: 1200,
      executeTokenBudget: 1800,
      explicitOnly: false,
      maxSections: 3,
      useDefaults: true,
    },
    plugins: {
      autoSuggestOnInit: true,
      items: {},
    },
    dbGovernance: {
      strictArtifactLint: false,
      discovery: {
        packageRoots: [],
        schemaRoots: [],
        migrationRoots: [],
      },
      constraints: {
        ciDbAccess: 'unspecified',
        airgapped: false,
        destructiveMigrationsRequireReview: true,
        offlineOnlyParsing: true,
      },
    },
    systemGovernance: {
      profile: 'auto',
      roots: {
        frontendRoots: [],
        backendRoots: [],
        apiSpecRoots: [],
        dbSchemaRoots: [],
        migrationRoots: [],
      },
      rulesetIngestion: {
        dbSafety: true,
        apiCompat: true,
        feDeps: true,
      },
      constraints: {
        airgapped: false,
        noDbInCi: false,
        noNetwork: false,
        noNewDependencies: false,
        strictBackwardsCompat: false,
      },
      topology: {
        separatedDeployHost: false,
        devHost: '',
        deployHost: '',
        clusterAccessFromDev: true,
        helmAccessFromDev: true,
        artifactGenerationOnly: false,
      },
    },
    gitGovernance: {
      hosting: 'both',
      defaultBranch: 'main',
      updateStrategy: 'repo-default',
      protectedBranches: ['main', 'master'],
      allowForcePush: false,
      allowRebaseAfterReviewOpen: false,
      collaborationModel: 'repo-default',
      requiredChecks: ['lint', 'test', 'guard'],
      requirePreflightBeforeExecute: false,
      freshnessThresholdBehind: 0,
    },
  };
}

function normalizePortablePath(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  const normalized = trimmed.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  if (/^[A-Za-z]:\/$/.test(normalized) || normalized === '/') {
    return normalized;
  }
  return normalized.replace(/\/$/, '');
}

function normalizePathArray(value) {
  if (!Array.isArray(value)) return value;
  return value.map((entry) => normalizePortablePath(entry));
}

function normalizeConfig(config) {
  if (!config || typeof config !== 'object') {
    return config;
  }

  const normalized = JSON.parse(JSON.stringify(config));

  if (normalized.contracts) {
    if (typeof normalized.contracts.directory === 'string') {
      normalized.contracts.directory = normalizePortablePath(normalized.contracts.directory);
    }
    if (typeof normalized.contracts.templates === 'string') {
      normalized.contracts.templates = normalizePortablePath(normalized.contracts.templates);
    }
  }

  if (normalized.dbGovernance?.discovery) {
    ['packageRoots', 'schemaRoots', 'migrationRoots'].forEach((key) => {
      normalized.dbGovernance.discovery[key] = normalizePathArray(normalized.dbGovernance.discovery[key]);
    });
  }

  if (normalized.systemGovernance?.roots) {
    ['frontendRoots', 'backendRoots', 'apiSpecRoots', 'dbSchemaRoots', 'migrationRoots'].forEach((key) => {
      normalized.systemGovernance.roots[key] = normalizePathArray(normalized.systemGovernance.roots[key]);
    });
  }

  if (normalized.plugins?.items && typeof normalized.plugins.items === 'object') {
    Object.values(normalized.plugins.items).forEach((pluginConfig) => {
      if (pluginConfig && typeof pluginConfig === 'object' && Array.isArray(pluginConfig.roots)) {
        pluginConfig.roots = normalizePathArray(pluginConfig.roots);
      }
    });
  }

  return normalized;
}

function getTrackingMode(config = null, cwd = process.cwd()) {
  const resolvedConfig = config || loadConfig(cwd) || defaultConfig();
  const mode = String(resolvedConfig?.contracts?.trackingMode || 'tracked').trim().toLowerCase();
  return mode === 'local-only' ? 'local-only' : 'tracked';
}

function getContractsDirectory(cwd = process.cwd(), config = null) {
  const mode = getTrackingMode(config, cwd);
  return mode === 'local-only'
    ? path.join(cwd, '.grabby', 'contracts')
    : path.join(cwd, 'contracts');
}

function initConfig(cwd = process.cwd(), { force = false } = {}) {
  const file = getConfigPath(cwd);
  if (fs.existsSync(file) && !force) return { created: false, file };
  fs.writeFileSync(file, JSON.stringify(normalizeConfig(defaultConfig()), null, 2) + '\n');
  return { created: true, file };
}

function loadConfig(cwd = process.cwd()) {
  const file = getConfigPath(cwd);
  if (!fs.existsSync(file)) return null;
  return normalizeConfig(JSON.parse(fs.readFileSync(file, 'utf8')));
}

function saveConfig(config, cwd = process.cwd()) {
  const file = getConfigPath(cwd);
  fs.writeFileSync(file, JSON.stringify(normalizeConfig(config), null, 2) + '\n');
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
  if (config.contracts?.trackingMode && !['tracked', 'local-only'].includes(String(config.contracts.trackingMode))) {
    errors.push('contracts.trackingMode must be "tracked" or "local-only"');
  }
  if (config.interactive && typeof config.interactive.enabled !== 'boolean') {
    errors.push('interactive.enabled must be true or false');
  }
  if (config.interactive?.defaultNextAction != null) {
    const action = String(config.interactive.defaultNextAction).trim().toLowerCase();
    const allowed = ['continue', 'revise-contract', 'revise-plan', 'switch-role', 'pause', 'abort'];
    if (!allowed.includes(action)) {
      errors.push(`interactive.defaultNextAction must be one of: ${allowed.join(', ')}`);
    }
  }
  if (config.features) {
    ['menuMode', 'startupArt', 'rulesetWizard'].forEach((key) => {
      if (key in config.features && typeof config.features[key] !== 'boolean') {
        errors.push(`features.${key} must be true or false`);
      }
    });
  }
  if (config.bmadFeatures) {
    ['adaptiveHelp', 'quickFlowGuardrails', 'riskTieredVerification'].forEach((key) => {
      if (key in config.bmadFeatures && typeof config.bmadFeatures[key] !== 'boolean') {
        errors.push(`bmadFeatures.${key} must be true or false`);
      }
    });
  }
  if (config.llmContext) {
    if ('mode' in config.llmContext) {
      const mode = String(config.llmContext.mode);
      if (!['standard', 'lean'].includes(mode)) {
        errors.push('llmContext.mode must be "standard" or "lean"');
      }
    }
    ['planTokenBudget', 'executeTokenBudget', 'maxSections'].forEach((key) => {
      if (key in config.llmContext) {
        const value = config.llmContext[key];
        if (!Number.isInteger(value) || value <= 0) {
          errors.push(`llmContext.${key} must be a positive integer`);
        }
      }
    });
    ['explicitOnly', 'useDefaults'].forEach((key) => {
      if (key in config.llmContext && typeof config.llmContext[key] !== 'boolean') {
        errors.push(`llmContext.${key} must be true or false`);
      }
    });
  }
  if (config.plugins) {
    if ('autoSuggestOnInit' in config.plugins && typeof config.plugins.autoSuggestOnInit !== 'boolean') {
      errors.push('plugins.autoSuggestOnInit must be true or false');
    }
    if ('items' in config.plugins) {
      if (!config.plugins.items || typeof config.plugins.items !== 'object' || Array.isArray(config.plugins.items)) {
        errors.push('plugins.items must be an object');
      } else {
        Object.entries(config.plugins.items).forEach(([pluginKey, pluginConfig]) => {
          if (!pluginConfig || typeof pluginConfig !== 'object' || Array.isArray(pluginConfig)) {
            errors.push(`plugins.items.${pluginKey} must be an object`);
            return;
          }
          if ('enabled' in pluginConfig && typeof pluginConfig.enabled !== 'boolean') {
            errors.push(`plugins.items.${pluginKey}.enabled must be true or false`);
          }
          if ('mode' in pluginConfig) {
            const allowedModes = ['off', 'read-only', 'active'];
            if (!allowedModes.includes(String(pluginConfig.mode))) {
              errors.push(`plugins.items.${pluginKey}.mode must be one of: ${allowedModes.join(', ')}`);
            }
          }
          if ('roots' in pluginConfig && !Array.isArray(pluginConfig.roots)) {
            errors.push(`plugins.items.${pluginKey}.roots must be an array`);
          }
          if ('detected' in pluginConfig && typeof pluginConfig.detected !== 'boolean') {
            errors.push(`plugins.items.${pluginKey}.detected must be true or false`);
          }
          if ('source' in pluginConfig && !['builtin', 'custom'].includes(String(pluginConfig.source))) {
            errors.push(`plugins.items.${pluginKey}.source must be "builtin" or "custom"`);
          }
          if ('constraints' in pluginConfig) {
            if (!pluginConfig.constraints || typeof pluginConfig.constraints !== 'object' || Array.isArray(pluginConfig.constraints)) {
              errors.push(`plugins.items.${pluginKey}.constraints must be an object`);
            } else {
              ['offlineOnly', 'noRemoteAccess', 'noClusterAccess', 'generateArtifactsOnly'].forEach((key) => {
                if (key in pluginConfig.constraints && typeof pluginConfig.constraints[key] !== 'boolean') {
                  errors.push(`plugins.items.${pluginKey}.constraints.${key} must be true or false`);
                }
              });
            }
          }
        });
      }
    }
  }
  if (config.dbGovernance) {
    if ('strictArtifactLint' in config.dbGovernance && typeof config.dbGovernance.strictArtifactLint !== 'boolean') {
      errors.push('dbGovernance.strictArtifactLint must be true or false');
    }
    if (config.dbGovernance.discovery) {
      ['packageRoots', 'schemaRoots', 'migrationRoots'].forEach((key) => {
        if (key in config.dbGovernance.discovery && !Array.isArray(config.dbGovernance.discovery[key])) {
          errors.push(`dbGovernance.discovery.${key} must be an array`);
        }
      });
    }
    if (config.dbGovernance.constraints) {
      ['airgapped', 'destructiveMigrationsRequireReview', 'offlineOnlyParsing'].forEach((key) => {
        if (key in config.dbGovernance.constraints && typeof config.dbGovernance.constraints[key] !== 'boolean') {
          errors.push(`dbGovernance.constraints.${key} must be true or false`);
        }
      });
      if ('ciDbAccess' in config.dbGovernance.constraints) {
        const allowed = ['unspecified', 'none', 'read-only', 'full'];
        if (!allowed.includes(String(config.dbGovernance.constraints.ciDbAccess))) {
          errors.push(`dbGovernance.constraints.ciDbAccess must be one of: ${allowed.join(', ')}`);
        }
      }
    }
  }
  if (config.systemGovernance) {
    if ('profile' in config.systemGovernance) {
      const allowedProfiles = ['auto', 'web-ui', 'api-service', 'fullstack'];
      if (!allowedProfiles.includes(String(config.systemGovernance.profile))) {
        errors.push(`systemGovernance.profile must be one of: ${allowedProfiles.join(', ')}`);
      }
    }
    if (config.systemGovernance.roots) {
      ['frontendRoots', 'backendRoots', 'apiSpecRoots', 'dbSchemaRoots', 'migrationRoots'].forEach((key) => {
        if (key in config.systemGovernance.roots && !Array.isArray(config.systemGovernance.roots[key])) {
          errors.push(`systemGovernance.roots.${key} must be an array`);
        }
      });
    }
    if (config.systemGovernance.rulesetIngestion) {
      ['dbSafety', 'apiCompat', 'feDeps'].forEach((key) => {
        if (key in config.systemGovernance.rulesetIngestion && typeof config.systemGovernance.rulesetIngestion[key] !== 'boolean') {
          errors.push(`systemGovernance.rulesetIngestion.${key} must be true or false`);
        }
      });
    }
    if (config.systemGovernance.constraints) {
      ['airgapped', 'noDbInCi', 'noNetwork', 'noNewDependencies', 'strictBackwardsCompat'].forEach((key) => {
        if (key in config.systemGovernance.constraints && typeof config.systemGovernance.constraints[key] !== 'boolean') {
          errors.push(`systemGovernance.constraints.${key} must be true or false`);
        }
      });
    }
    if (config.systemGovernance.topology) {
      ['separatedDeployHost', 'clusterAccessFromDev', 'helmAccessFromDev', 'artifactGenerationOnly'].forEach((key) => {
        if (key in config.systemGovernance.topology && typeof config.systemGovernance.topology[key] !== 'boolean') {
          errors.push(`systemGovernance.topology.${key} must be true or false`);
        }
      });
      ['devHost', 'deployHost'].forEach((key) => {
        if (key in config.systemGovernance.topology && typeof config.systemGovernance.topology[key] !== 'string') {
          errors.push(`systemGovernance.topology.${key} must be a string`);
        }
      });
    }
  }
  if (config.gitGovernance) {
    if ('hosting' in config.gitGovernance) {
      const allowed = ['gitlab', 'github', 'both'];
      if (!allowed.includes(String(config.gitGovernance.hosting))) {
        errors.push(`gitGovernance.hosting must be one of: ${allowed.join(', ')}`);
      }
    }
    if ('updateStrategy' in config.gitGovernance) {
      const allowed = ['repo-default', 'rebase', 'merge', 'squash'];
      if (!allowed.includes(String(config.gitGovernance.updateStrategy))) {
        errors.push(`gitGovernance.updateStrategy must be one of: ${allowed.join(', ')}`);
      }
    }
    if ('collaborationModel' in config.gitGovernance) {
      const allowed = ['repo-default', 'forks', 'shared-branches'];
      if (!allowed.includes(String(config.gitGovernance.collaborationModel))) {
        errors.push(`gitGovernance.collaborationModel must be one of: ${allowed.join(', ')}`);
      }
    }
    if ('protectedBranches' in config.gitGovernance && !Array.isArray(config.gitGovernance.protectedBranches)) {
      errors.push('gitGovernance.protectedBranches must be an array');
    }
    ['allowForcePush', 'allowRebaseAfterReviewOpen', 'requirePreflightBeforeExecute'].forEach((key) => {
      if (key in config.gitGovernance && typeof config.gitGovernance[key] !== 'boolean') {
        errors.push(`gitGovernance.${key} must be true or false`);
      }
    });
    if ('requiredChecks' in config.gitGovernance && !Array.isArray(config.gitGovernance.requiredChecks)) {
      errors.push('gitGovernance.requiredChecks must be an array');
    }
    if ('freshnessThresholdBehind' in config.gitGovernance) {
      if (!Number.isInteger(config.gitGovernance.freshnessThresholdBehind) || config.gitGovernance.freshnessThresholdBehind < 0) {
        errors.push('gitGovernance.freshnessThresholdBehind must be a non-negative integer');
      }
    }
  }

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
  getTrackingMode,
  getContractsDirectory,
  validateConfig,
  normalizeConfig,
  normalizePortablePath,
};
