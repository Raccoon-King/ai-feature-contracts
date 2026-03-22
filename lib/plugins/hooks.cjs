const { HOOK_TYPES } = require('./types.cjs');

class HookDispatcher {
  constructor() {
    this.handlers = new Map();
  }

  register(hookName, handler, options = {}) {
    if (!HOOK_TYPES.includes(hookName)) {
      throw new Error(`Unknown hook: ${hookName}`);
    }
    if (typeof handler !== 'function') {
      throw new Error(`Hook handler for ${hookName} must be a function`);
    }

    const entry = {
      pluginId: String(options.pluginId || 'anonymous'),
      priority: Number.isFinite(options.priority) ? Number(options.priority) : 0,
      handler,
    };

    if (!this.handlers.has(hookName)) {
      this.handlers.set(hookName, []);
    }
    this.handlers.get(hookName).push(entry);
    return entry;
  }

  registerPlugin(plugin) {
    const hooks = plugin?.hooks || {};
    Object.entries(hooks).forEach(([hookName, definition]) => {
      const registrations = Array.isArray(definition) ? definition : [definition];
      registrations.forEach((entry) => {
        if (typeof entry === 'function') {
          this.register(hookName, entry, { pluginId: plugin.id });
          return;
        }

        if (entry && typeof entry === 'object' && typeof entry.handler === 'function') {
          this.register(hookName, entry.handler, {
            pluginId: plugin.id,
            priority: entry.priority,
          });
        }
      });
    });
  }

  unregisterPlugin(pluginId) {
    this.handlers.forEach((entries, hookName) => {
      const filtered = entries.filter((entry) => entry.pluginId !== pluginId);
      if (filtered.length > 0) {
        this.handlers.set(hookName, filtered);
        return;
      }
      this.handlers.delete(hookName);
    });
  }

  hasHandlers(hookName) {
    return this.handlers.has(hookName) && this.handlers.get(hookName).length > 0;
  }

  async dispatch(hookName, context = {}) {
    const entries = (this.handlers.get(hookName) || [])
      .slice()
      .sort((left, right) => right.priority - left.priority);

    const results = [];

    for (const entry of entries) {
      const result = await Promise.resolve(entry.handler(context));
      results.push({
        plugin: entry.pluginId,
        hook: hookName,
        result,
      });

      if (result && (result.cancel === true || result.cancelled === true)) {
        return {
          cancelled: true,
          reason: result.reason || null,
          results,
        };
      }
    }

    return {
      cancelled: false,
      reason: null,
      results,
    };
  }
}

module.exports = {
  HookDispatcher,
};
