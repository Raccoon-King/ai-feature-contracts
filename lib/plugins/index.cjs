const fs = require('fs');
const path = require('path');
const { HookDispatcher } = require('./hooks.cjs');
const { normalizePluginDefinition } = require('./types.cjs');

class PluginManager {
  constructor(options = {}) {
    this.cwd = options.cwd || process.cwd();
    this.pluginsDir = options.pluginsDir || path.join(this.cwd, 'lib', 'plugins');
    this.plugins = new Map();
    this.hooks = new HookDispatcher();
  }

  register(plugin) {
    const normalized = normalizePluginDefinition(plugin);
    this.plugins.set(normalized.id, normalized);
    this.hooks.unregisterPlugin(normalized.id);
    this.hooks.registerPlugin(normalized);
    return normalized;
  }

  unregister(pluginId) {
    const removed = this.plugins.delete(pluginId);
    this.hooks.unregisterPlugin(pluginId);
    return removed;
  }

  getPlugin(pluginId) {
    return this.plugins.get(pluginId) || null;
  }

  listPlugins() {
    return Array.from(this.plugins.values());
  }

  discoverBuiltinPlugins() {
    const builtins = [
      path.join(this.cwd, 'lib', 'rulesets', 'plugin.cjs'),
    ];

    const discovered = [];
    builtins.forEach((pluginPath) => {
      if (!fs.existsSync(pluginPath)) {
        return;
      }
      const plugin = require(pluginPath);
      discovered.push(this.register(plugin));
    });

    return discovered;
  }

  discover() {
    const discovered = [...this.discoverBuiltinPlugins()];
    if (!fs.existsSync(this.pluginsDir)) {
      return discovered;
    }

    fs.readdirSync(this.pluginsDir)
      .filter((entry) => entry.endsWith('.plugin.cjs'))
      .forEach((entry) => {
        const pluginPath = path.join(this.pluginsDir, entry);
        const plugin = require(pluginPath);
        discovered.push(this.register(plugin));
      });

    return discovered;
  }

  async dispatchHook(hookName, context = {}) {
    return this.hooks.dispatch(hookName, context);
  }
}

function createPluginManager(options = {}) {
  const manager = new PluginManager(options);
  if (options.autoDiscover !== false) {
    manager.discover();
  }
  return manager;
}

module.exports = {
  PluginManager,
  createPluginManager,
};
