/**
 * Plugin system for Grabby
 * Allows custom agents, workflows, and hooks via configuration
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

const BUILTIN_PLUGIN_CATALOG = [
  {
    key: 'helm',
    name: 'Helm Charts',
    description: 'Understand and govern Helm chart structure and release inputs.',
    source: 'builtin',
    detection: {
      packageNames: [],
      fileNames: ['Chart.yaml'],
      pathSegments: ['helm', 'charts'],
    },
  },
  {
    key: 'argocd',
    name: 'Argo CD',
    description: 'Govern Argo CD application manifests and deployment rules.',
    source: 'builtin',
    detection: {
      packageNames: [],
      fileNames: ['argocd-cm.yaml', 'application.yaml'],
      pathSegments: ['argocd'],
    },
  },
  {
    key: 'harbor',
    name: 'Harbor',
    description: 'Track Harbor-specific registry and image governance signals.',
    source: 'builtin',
    detection: {
      packageNames: [],
      fileNames: ['harbor.yml'],
      pathSegments: ['harbor'],
    },
  },
  {
    key: 'artifactory',
    name: 'Artifactory / JFrog',
    description: 'Govern JFrog Artifactory repository and promotion workflows.',
    source: 'builtin',
    detection: {
      packageNames: [],
      fileNames: ['jfrog.yaml'],
      pathSegments: ['artifactory', 'jfrog'],
    },
  },
  {
    key: 'rancher',
    name: 'Rancher',
    description: 'Track Rancher-managed cluster and fleet configuration.',
    source: 'builtin',
    detection: {
      packageNames: [],
      fileNames: ['rancher-compose.yml'],
      pathSegments: ['rancher'],
    },
  },
  {
    key: 'kubernetes',
    name: 'Kubernetes',
    description: 'Understand Kubernetes manifests, overlays, and cluster objects.',
    source: 'builtin',
    detection: {
      packageNames: [],
      fileNames: ['kustomization.yaml'],
      pathSegments: ['k8s', 'kubernetes', 'manifests'],
    },
  },
  {
    key: 'openshift',
    name: 'OpenShift',
    description: 'Track OpenShift templates, routes, and cluster-specific policy.',
    source: 'builtin',
    detection: {
      packageNames: [],
      fileNames: [],
      pathSegments: ['openshift'],
    },
  },
  {
    key: 'keycloak',
    name: 'Keycloak',
    description: 'Govern Keycloak realms, clients, and identity-related config.',
    source: 'builtin',
    detection: {
      packageNames: ['keycloak-js', 'keycloak-admin'],
      fileNames: ['realm-export.json'],
      pathSegments: ['keycloak'],
    },
  },
];

/**
 * Plugin manifest schema
 */
const PLUGIN_SCHEMA = {
  name: 'string',
  version: 'string',
  description: 'string',
  agents: 'array',
  workflows: 'array',
  hooks: 'object',
  commands: 'array',
};

function loadBuiltinPluginRuntime(key) {
  if (key === 'argocd') {
    return require('./plugins/argocd.cjs');
  }
  if (key === 'harbor') {
    return require('./plugins/harbor.cjs');
  }
  if (key === 'artifactory') {
    return require('./plugins/artifactory.cjs');
  }
  if (key === 'helm') {
    return require('./plugins/helm.cjs');
  }
  if (key === 'keycloak') {
    return require('./plugins/keycloak.cjs');
  }
  if (key === 'rancher') {
    return require('./plugins/rancher.cjs');
  }
  if (key === 'kubernetes') {
    return require('./plugins/kubernetes.cjs');
  }
  if (key === 'openshift') {
    return require('./plugins/openshift.cjs');
  }
  return null;
}

function getBuiltinPlugins() {
  return BUILTIN_PLUGIN_CATALOG.map((plugin) => ({ ...plugin }));
}

function normalizePluginState(key, config = {}) {
  const pluginConfig = config?.plugins?.items?.[key] || {};
  const enabled = pluginConfig.enabled === true;
  const mode = enabled
    ? String(pluginConfig.mode || 'active')
    : 'off';
  return {
    enabled,
    mode,
    roots: Array.isArray(pluginConfig.roots) ? pluginConfig.roots : [],
    detected: pluginConfig.detected === true,
    source: pluginConfig.source || 'builtin',
    notes: pluginConfig.notes || '',
    constraints: pluginConfig.constraints && typeof pluginConfig.constraints === 'object'
      ? pluginConfig.constraints
      : {},
  };
}

function updatePluginConfig(config, key, updates = {}) {
  const next = config || {};
  next.plugins = next.plugins || { autoSuggestOnInit: true, items: {} };
  next.plugins.items = next.plugins.items || {};
  const current = next.plugins.items[key] || {};
  next.plugins.items[key] = {
    ...current,
    ...updates,
  };
  if (next.plugins.items[key].enabled !== true) {
    next.plugins.items[key].mode = 'off';
  }
  return next;
}

function buildPluginCatalog(config = {}, options = {}) {
  const customPlugins = Array.isArray(options.customPlugins) ? options.customPlugins : [];
  const detectedKeys = Array.isArray(options.detectedKeys) ? new Set(options.detectedKeys) : new Set();
  const builtins = getBuiltinPlugins().map((plugin) => {
    const state = normalizePluginState(plugin.key, config);
    return {
      ...plugin,
      ...state,
      available: true,
      installed: false,
      detected: state.detected || detectedKeys.has(plugin.key),
      runtime: loadBuiltinPluginRuntime(plugin.key),
    };
  });

  const custom = customPlugins.map((plugin) => {
    const state = normalizePluginState(plugin.name, config);
    return {
      key: plugin.name,
      name: plugin.name,
      description: plugin.description || '',
      source: 'custom',
      available: true,
      installed: true,
      detected: state.detected,
      ...state,
      runtime: plugin,
    };
  });

  return [...builtins, ...custom].sort((a, b) => a.name.localeCompare(b.name));
}

function suggestPluginsForAssessment(assessment = {}) {
  const names = new Set([
    ...(assessment.dependencies || []),
    ...(assessment.devDependencies || []),
  ]);
  const entries = new Set((assessment.rootEntries || []).map((entry) => entry.name.toLowerCase()));
  const dirs = new Set((assessment.projectDirs || []).map((dir) => dir.toLowerCase()));

  return getBuiltinPlugins()
    .filter((plugin) => {
      const detection = plugin.detection || {};
      const packageMatch = (detection.packageNames || []).some((name) => names.has(name));
      const fileMatch = (detection.fileNames || []).some((name) => entries.has(String(name).toLowerCase()));
      const pathMatch = (detection.pathSegments || []).some((segment) => {
        const lowered = String(segment).toLowerCase();
        return dirs.has(lowered) || Array.from(entries).some((entry) => entry.includes(lowered));
      });
      return packageMatch || fileMatch || pathMatch;
    })
    .map((plugin) => plugin.key)
    .sort();
}

/**
 * Load a plugin from a directory
 */
function loadPlugin(pluginDir) {
  const manifestPath = path.join(pluginDir, 'plugin.yaml');
  const jsPath = path.join(pluginDir, 'index.js');

  if (!fs.existsSync(manifestPath) && !fs.existsSync(jsPath)) {
    throw new Error(`Invalid plugin: no plugin.yaml or index.js found in ${pluginDir}`);
  }

  let manifest = {};
  let jsModule = {};

  // Load YAML manifest
  if (fs.existsSync(manifestPath)) {
    manifest = yaml.parse(fs.readFileSync(manifestPath, 'utf8'));
  }

  // Load JS module (if exists)
  if (fs.existsSync(jsPath)) {
    try {
      jsModule = require(jsPath);
    } catch (err) {
      throw new Error(`Failed to load plugin JS: ${err.message}`);
    }
  }

  // Merge manifest and JS module
  const plugin = {
    name: manifest.name || jsModule.name || path.basename(pluginDir),
    version: manifest.version || jsModule.version || '1.0.0',
    description: manifest.description || jsModule.description || '',
    path: pluginDir,
    agents: [...(manifest.agents || []), ...(jsModule.agents || [])],
    workflows: [...(manifest.workflows || []), ...(jsModule.workflows || [])],
    hooks: { ...(manifest.hooks || {}), ...(jsModule.hooks || {}) },
    commands: [...(manifest.commands || []), ...(jsModule.commands || [])],
  };

  return plugin;
}

/**
 * Discover plugins in a directory
 */
function discoverPlugins(pluginsDir) {
  if (!fs.existsSync(pluginsDir)) {
    return [];
  }

  const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
  const plugins = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const pluginDir = path.join(pluginsDir, entry.name);
      try {
        const plugin = loadPlugin(pluginDir);
        plugins.push(plugin);
      } catch (err) {
        console.warn(`Warning: Failed to load plugin ${entry.name}: ${err.message}`);
      }
    }
  }

  return plugins;
}

/**
 * Plugin registry - manages loaded plugins
 */
function createPluginRegistry(grabbyDir) {
  const pluginsDir = path.join(grabbyDir, 'plugins');
  const plugins = new Map();
  const hooks = new Map();
  let catalog = [];

  const registry = {
    /**
     * Load all plugins from the plugins directory
     */
    loadAll: (options = {}) => {
      const discovered = discoverPlugins(pluginsDir);
      for (const plugin of discovered) {
        plugins.set(plugin.name, plugin);
        registry.registerHooks(plugin);
      }
      catalog = buildPluginCatalog(options.config || {}, {
        customPlugins: discovered,
        detectedKeys: options.detectedKeys || [],
      });
      return discovered.length;
    },

    /**
     * Register a plugin's hooks
     */
    registerHooks: (plugin) => {
      for (const [hookName, handler] of Object.entries(plugin.hooks || {})) {
        if (!hooks.has(hookName)) {
          hooks.set(hookName, []);
        }
        hooks.get(hookName).push({
          plugin: plugin.name,
          handler: typeof handler === 'function' ? handler : () => handler,
        });
      }
    },

    /**
     * Get a loaded plugin by name
     */
    get: (name) => plugins.get(name),

    /**
     * List all loaded plugins
     */
    list: () => Array.from(plugins.values()),

    listAvailable: () => catalog.length > 0
      ? catalog.map((plugin) => ({ ...plugin }))
      : buildPluginCatalog(),

    listEnabled: () => registry.listAvailable().filter((plugin) => plugin.enabled),

    /**
     * Get all agents from all plugins
     */
    getAgents: () => {
      const agents = [];
      for (const plugin of plugins.values()) {
        for (const agent of plugin.agents || []) {
          agents.push({
            ...agent,
            plugin: plugin.name,
          });
        }
      }
      return agents;
    },

    /**
     * Get all workflows from all plugins
     */
    getWorkflows: () => {
      const workflows = [];
      for (const plugin of plugins.values()) {
        for (const workflow of plugin.workflows || []) {
          workflows.push({
            ...workflow,
            plugin: plugin.name,
          });
        }
      }
      return workflows;
    },

    /**
     * Get all custom commands from all plugins
     */
    getCommands: () => {
      const commands = [];
      for (const plugin of plugins.values()) {
        for (const command of plugin.commands || []) {
          commands.push({
            ...command,
            plugin: plugin.name,
          });
        }
      }
      return commands;
    },

    /**
     * Execute hooks for a given event
     */
    executeHook: async (hookName, context = {}) => {
      const handlers = hooks.get(hookName) || [];
      const results = [];

      for (const { plugin, handler } of handlers) {
        try {
          const result = await handler(context);
          results.push({ plugin, success: true, result });
        } catch (err) {
          results.push({ plugin, success: false, error: err.message });
        }
      }

      return results;
    },

    /**
     * Check if a hook has handlers
     */
    hasHook: (hookName) => hooks.has(hookName) && hooks.get(hookName).length > 0,

    /**
     * Get plugin directory path
     */
    getPluginsDir: () => pluginsDir,

    getPluginState: (name, config = {}) => normalizePluginState(name, config),

    getRuntime: (name) => {
      const custom = plugins.get(name);
      if (custom) {
        return custom;
      }
      const builtin = registry.listAvailable().find((plugin) => plugin.key === name);
      return builtin?.runtime || null;
    },
  };

  return registry;
}

/**
 * Create a new plugin scaffold
 */
function scaffoldPlugin(pluginsDir, name, options = {}) {
  const pluginDir = path.join(pluginsDir, name);

  if (fs.existsSync(pluginDir)) {
    throw new Error(`Plugin already exists: ${name}`);
  }

  fs.mkdirSync(pluginDir, { recursive: true });

  // Create plugin.yaml
  const manifest = {
    name,
    version: '1.0.0',
    description: options.description || `Custom plugin: ${name}`,
    agents: options.includeAgent ? [{
      name: `${name}-agent`,
      title: `${name} Agent`,
      prompt: 'Define your agent prompt here',
    }] : [],
    workflows: options.includeWorkflow ? [{
      name: `${name}-workflow`,
      steps: ['step1', 'step2'],
    }] : [],
    hooks: {},
    commands: options.includeCommand ? [{
      name,
      description: `Run ${name} command`,
      handler: 'runCommand',
    }] : [],
  };

  fs.writeFileSync(
    path.join(pluginDir, 'plugin.yaml'),
    yaml.stringify(manifest)
  );

  // Create index.js if including commands
  if (options.includeCommand) {
    const jsContent = `/**
 * ${name} plugin
 */

module.exports = {
  hooks: {
    // beforeValidate: (context) => { ... },
    // afterValidate: (context) => { ... },
  },

  runCommand: async (args, context) => {
    console.log('Running ${name} command with args:', args);
    return { success: true };
  },
};
`;
    fs.writeFileSync(path.join(pluginDir, 'index.js'), jsContent);
  }

  // Create README
  const readme = `# ${name}

${options.description || `Custom Grabby plugin: ${name}`}

## Installation

This plugin is automatically loaded from \`.grabby/plugins/${name}/\`.

## Configuration

Edit \`plugin.yaml\` to configure agents, workflows, and hooks.

## Hooks

Available hooks:
- \`beforeValidate\` - Called before contract validation
- \`afterValidate\` - Called after contract validation
- \`beforePlan\` - Called before plan generation
- \`afterPlan\` - Called after plan generation
- \`beforeExecute\` - Called before execution
- \`afterExecute\` - Called after execution
`;
  fs.writeFileSync(path.join(pluginDir, 'README.md'), readme);

  return pluginDir;
}

/**
 * Validate a plugin structure
 */
function validatePlugin(pluginDir) {
  const errors = [];
  const warnings = [];

  const manifestPath = path.join(pluginDir, 'plugin.yaml');
  const jsPath = path.join(pluginDir, 'index.js');

  if (!fs.existsSync(manifestPath) && !fs.existsSync(jsPath)) {
    errors.push('Missing plugin.yaml or index.js');
    return { valid: false, errors, warnings };
  }

  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = yaml.parse(fs.readFileSync(manifestPath, 'utf8'));

      if (!manifest.name) {
        errors.push('Missing required field: name');
      }
      if (!manifest.version) {
        warnings.push('Missing version field');
      }
    } catch (err) {
      errors.push(`Invalid YAML: ${err.message}`);
    }
  }

  if (fs.existsSync(jsPath)) {
    try {
      require(jsPath);
    } catch (err) {
      errors.push(`JS module error: ${err.message}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

module.exports = {
  getBuiltinPlugins,
  loadBuiltinPluginRuntime,
  normalizePluginState,
  updatePluginConfig,
  buildPluginCatalog,
  suggestPluginsForAssessment,
  loadPlugin,
  discoverPlugins,
  createPluginRegistry,
  scaffoldPlugin,
  validatePlugin,
  PLUGIN_SCHEMA,
};
