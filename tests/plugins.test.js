const fs = require('fs');
const os = require('os');
const path = require('path');
const { createPluginRegistry, scaffoldPlugin, validatePlugin } = require('../lib/plugins.cjs');

describe('plugins', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugins-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('scaffold + validate plugin', () => {
    const pluginsDir = path.join(dir, '.grabby', 'plugins');
    fs.mkdirSync(pluginsDir, { recursive: true });
    const pluginDir = scaffoldPlugin(pluginsDir, 'demo-plugin');
    const result = validatePlugin(pluginDir);
    expect(result.valid).toBe(true);
  });

  test('registry loads plugin', () => {
    const grabbyDir = path.join(dir, '.grabby');
    const pluginsDir = path.join(grabbyDir, 'plugins');
    fs.mkdirSync(pluginsDir, { recursive: true });
    scaffoldPlugin(pluginsDir, 'demo-plugin');
    const registry = createPluginRegistry(grabbyDir);
    registry.loadAll();
    expect(registry.list().map(p => p.name)).toContain('demo-plugin');
  });
});
