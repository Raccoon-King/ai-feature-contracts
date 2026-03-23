const fs = require('fs');
const os = require('os');
const path = require('path');
const { PluginManager, createPluginManager } = require('../../lib/plugins/index.cjs');
const { HookDispatcher } = require('../../lib/plugins/hooks.cjs');
const { HOOK_TYPES, normalizePluginDefinition } = require('../../lib/plugins/types.cjs');

describe('plugin system foundation', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-plugin-system-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('registers, retrieves, lists, and unregisters plugins', () => {
    const manager = new PluginManager({ pluginsDir: dir });
    manager.register({
      id: 'demo',
      name: 'Demo Plugin',
      version: '1.0.0',
      hooks: {},
    });

    expect(manager.getPlugin('demo')).toEqual(expect.objectContaining({ id: 'demo' }));
    expect(manager.listPlugins()).toHaveLength(1);
    expect(manager.unregister('demo')).toBe(true);
    expect(manager.getPlugin('demo')).toBeNull();
  });

  test('auto-discovers plugin files from the plugins directory', () => {
    fs.writeFileSync(path.join(dir, 'alpha.plugin.cjs'), `module.exports = {
  id: 'alpha',
  name: 'Alpha',
  version: '1.0.0',
  hooks: {}
};`, 'utf8');

    const manager = createPluginManager({ pluginsDir: dir });
    expect(manager.listPlugins().map((plugin) => plugin.id)).toContain('alpha');
  });

  test('dispatches hooks by priority and supports cancellation', async () => {
    const dispatcher = new HookDispatcher();
    const order = [];

    dispatcher.register('onValidate', async () => {
      order.push('low');
      return { ok: true };
    }, { pluginId: 'low', priority: 1 });

    dispatcher.register('onValidate', async () => {
      order.push('high');
      return { cancel: true, reason: 'stop-here' };
    }, { pluginId: 'high', priority: 10 });

    const result = await dispatcher.dispatch('onValidate', {});

    expect(order).toEqual(['high']);
    expect(result.cancelled).toBe(true);
    expect(result.reason).toBe('stop-here');
    expect(result.results[0]).toEqual(expect.objectContaining({ plugin: 'high', hook: 'onValidate' }));
  });

  test('registerPlugin wires sync and async hook definitions', async () => {
    const dispatcher = new HookDispatcher();
    dispatcher.registerPlugin({
      id: 'multi',
      hooks: {
        onPlan: [
          { priority: 5, handler: () => 'sync' },
          { priority: 1, handler: async () => 'async' },
        ],
      },
    });

    const result = await dispatcher.dispatch('onPlan', {});
    expect(result.cancelled).toBe(false);
    expect(result.results.map((entry) => entry.result)).toEqual(['sync', 'async']);
  });
});

describe('hook types', () => {
  test('HOOK_TYPES includes all expected hooks', () => {
    expect(HOOK_TYPES).toContain('onInit');
    expect(HOOK_TYPES).toContain('onCommand');
    expect(HOOK_TYPES).toContain('onContractCreate');
    expect(HOOK_TYPES).toContain('onValidate');
    expect(HOOK_TYPES).toContain('onPlan');
    expect(HOOK_TYPES).toContain('onExecute');
    expect(HOOK_TYPES).toContain('onAudit');
  });

  test('normalizePluginDefinition throws for non-object input', () => {
    expect(() => normalizePluginDefinition(null)).toThrow('Plugin definition must be an object');
    expect(() => normalizePluginDefinition('string')).toThrow('Plugin definition must be an object');
  });

  test('normalizePluginDefinition throws if id/name is missing', () => {
    expect(() => normalizePluginDefinition({})).toThrow('Plugin must define an id or name');
    expect(() => normalizePluginDefinition({ id: '' })).toThrow('Plugin must define an id or name');
  });

  test('normalizePluginDefinition uses name as id fallback', () => {
    const plugin = normalizePluginDefinition({ name: 'MyPlugin' });
    expect(plugin.id).toBe('MyPlugin');
    expect(plugin.name).toBe('MyPlugin');
  });

  test('normalizePluginDefinition provides defaults', () => {
    const plugin = normalizePluginDefinition({ id: 'test' });
    expect(plugin.version).toBe('0.0.0');
    expect(plugin.hooks).toEqual({});
    expect(plugin.meta).toEqual({});
  });
});

describe('HookDispatcher edge cases', () => {
  test('register throws for unknown hook type', () => {
    const dispatcher = new HookDispatcher();
    expect(() => dispatcher.register('unknownHook', () => {})).toThrow('Unknown hook: unknownHook');
  });

  test('register throws if handler is not a function', () => {
    const dispatcher = new HookDispatcher();
    expect(() => dispatcher.register('onValidate', 'not-a-function')).toThrow('must be a function');
  });

  test('hasHandlers returns false for empty hooks', () => {
    const dispatcher = new HookDispatcher();
    expect(dispatcher.hasHandlers('onValidate')).toBe(false);
  });

  test('hasHandlers returns true after registering', () => {
    const dispatcher = new HookDispatcher();
    dispatcher.register('onValidate', () => {});
    expect(dispatcher.hasHandlers('onValidate')).toBe(true);
  });

  test('unregisterPlugin removes all hooks for a plugin', () => {
    const dispatcher = new HookDispatcher();
    dispatcher.register('onValidate', () => 'a', { pluginId: 'test' });
    dispatcher.register('onPlan', () => 'b', { pluginId: 'test' });
    dispatcher.register('onValidate', () => 'c', { pluginId: 'other' });

    dispatcher.unregisterPlugin('test');

    expect(dispatcher.hasHandlers('onPlan')).toBe(false);
    expect(dispatcher.hasHandlers('onValidate')).toBe(true);
  });

  test('dispatch returns empty results for unregistered hook', async () => {
    const dispatcher = new HookDispatcher();
    const result = await dispatcher.dispatch('onValidate', {});
    expect(result.cancelled).toBe(false);
    expect(result.results).toEqual([]);
  });

  test('dispatch handles cancelled: true as well as cancel: true', async () => {
    const dispatcher = new HookDispatcher();
    dispatcher.register('onValidate', () => ({ cancelled: true, reason: 'alt-cancel' }));

    const result = await dispatcher.dispatch('onValidate', {});
    expect(result.cancelled).toBe(true);
    expect(result.reason).toBe('alt-cancel');
  });

  test('registerPlugin handles function hooks directly', async () => {
    const dispatcher = new HookDispatcher();
    dispatcher.registerPlugin({
      id: 'simple',
      hooks: {
        onValidate: () => 'direct-fn',
      },
    });

    const result = await dispatcher.dispatch('onValidate', {});
    expect(result.results[0].result).toBe('direct-fn');
  });

  test('registerPlugin ignores invalid hook entries', () => {
    const dispatcher = new HookDispatcher();
    dispatcher.registerPlugin({
      id: 'invalid',
      hooks: {
        onValidate: [null, undefined, 'string', { notHandler: true }],
      },
    });

    expect(dispatcher.hasHandlers('onValidate')).toBe(false);
  });
});

describe('PluginManager edge cases', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-plugin-edge-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('unregister returns false for unknown plugin', () => {
    const manager = new PluginManager({ pluginsDir: dir });
    expect(manager.unregister('nonexistent')).toBe(false);
  });

  test('discover handles missing plugins directory', () => {
    const manager = new PluginManager({ pluginsDir: path.join(dir, 'missing') });
    const discovered = manager.discover();
    expect(Array.isArray(discovered)).toBe(true);
  });

  test('dispatchHook delegates to hooks dispatcher', async () => {
    const manager = new PluginManager({ pluginsDir: dir });
    manager.register({
      id: 'hook-test',
      hooks: { onValidate: () => 'hook-result' },
    });

    const result = await manager.dispatchHook('onValidate', { test: true });
    expect(result.results[0].result).toBe('hook-result');
  });

  test('re-registering plugin replaces hooks', async () => {
    const manager = new PluginManager({ pluginsDir: dir });
    manager.register({ id: 'replace', hooks: { onValidate: () => 'first' } });
    manager.register({ id: 'replace', hooks: { onValidate: () => 'second' } });

    const result = await manager.dispatchHook('onValidate', {});
    expect(result.results).toHaveLength(1);
    expect(result.results[0].result).toBe('second');
  });
});
