/**
 * Plugin system for Grabby
 * Allows custom agents, workflows, and hooks via configuration
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

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

  const registry = {
    /**
     * Load all plugins from the plugins directory
     */
    loadAll: () => {
      const discovered = discoverPlugins(pluginsDir);
      for (const plugin of discovered) {
        plugins.set(plugin.name, plugin);
        registry.registerHooks(plugin);
      }
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
  loadPlugin,
  discoverPlugins,
  createPluginRegistry,
  scaffoldPlugin,
  validatePlugin,
  PLUGIN_SCHEMA,
};
