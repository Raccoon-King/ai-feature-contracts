const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  loadPlugin,
  discoverPlugins,
  createPluginRegistry,
  scaffoldPlugin,
  validatePlugin,
} = require('../lib/plugins.cjs');

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

  test('loadPlugin merges manifest and JS module contributions', () => {
    const pluginDir = path.join(dir, 'merge-plugin');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'plugin.yaml'), [
      'name: merge-plugin',
      'version: 2.0.0',
      'description: yaml manifest',
      'agents:',
      '  - name: yaml-agent',
      'workflows:',
      '  - name: yaml-flow',
      'hooks:',
      '  beforePlan: yaml-hook',
      'commands:',
      '  - name: yaml-command',
    ].join('\n'));
    fs.writeFileSync(path.join(pluginDir, 'index.js'), `module.exports = {
  agents: [{ name: 'js-agent' }],
  workflows: [{ name: 'js-flow' }],
  hooks: {
    afterPlan: () => 'done'
  },
  commands: [{ name: 'js-command' }]
};`);

    const plugin = loadPlugin(pluginDir);

    expect(plugin.name).toBe('merge-plugin');
    expect(plugin.version).toBe('2.0.0');
    expect(plugin.path).toBe(pluginDir);
    expect(plugin.agents.map((agent) => agent.name)).toEqual(['yaml-agent', 'js-agent']);
    expect(plugin.workflows.map((workflow) => workflow.name)).toEqual(['yaml-flow', 'js-flow']);
    expect(plugin.commands.map((command) => command.name)).toEqual(['yaml-command', 'js-command']);
    expect(Object.keys(plugin.hooks)).toEqual(['beforePlan', 'afterPlan']);
  });

  test('loadPlugin and discoverPlugins handle invalid plugins safely', () => {
    const pluginsDir = path.join(dir, 'plugins');
    fs.mkdirSync(pluginsDir, { recursive: true });
    const brokenDir = path.join(pluginsDir, 'broken');
    const emptyDir = path.join(pluginsDir, 'empty');
    fs.mkdirSync(brokenDir, { recursive: true });
    fs.mkdirSync(emptyDir, { recursive: true });
    fs.writeFileSync(path.join(brokenDir, 'index.js'), 'module.exports = ;');
    fs.writeFileSync(path.join(pluginsDir, 'README.md'), 'not a plugin');

    expect(() => loadPlugin(emptyDir)).toThrow('Invalid plugin');
    expect(() => loadPlugin(brokenDir)).toThrow('Failed to load plugin JS');

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const discovered = discoverPlugins(pluginsDir);
    expect(discovered).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to load plugin broken'));
    warnSpy.mockRestore();
  });

  test('registry aggregates plugin surfaces and executes hooks', async () => {
    const grabbyDir = path.join(dir, '.grabby');
    const pluginsDir = path.join(grabbyDir, 'plugins');
    fs.mkdirSync(pluginsDir, { recursive: true });

    const alphaDir = path.join(pluginsDir, 'alpha');
    fs.mkdirSync(alphaDir, { recursive: true });
    fs.writeFileSync(path.join(alphaDir, 'plugin.yaml'), [
      'name: alpha',
      'version: 1.0.0',
      'agents:',
      '  - name: agent-a',
      'workflows:',
      '  - name: flow-a',
      'commands:',
      '  - name: command-a',
    ].join('\n'));
    fs.writeFileSync(path.join(alphaDir, 'index.js'), `module.exports = {
  hooks: {
    beforeValidate: (context) => 'ok:' + context.value,
    afterValidate: 'static-result'
  }
};`);

    const betaDir = path.join(pluginsDir, 'beta');
    fs.mkdirSync(betaDir, { recursive: true });
    fs.writeFileSync(path.join(betaDir, 'plugin.yaml'), [
      'name: beta',
      'version: 1.0.0',
      'agents:',
      '  - name: agent-b',
      'workflows:',
      '  - name: flow-b',
      'commands:',
      '  - name: command-b',
    ].join('\n'));
    fs.writeFileSync(path.join(betaDir, 'index.js'), `module.exports = {
  hooks: {
    beforeValidate: () => { throw new Error('boom'); }
  }
};`);

    const registry = createPluginRegistry(grabbyDir);
    const loadCount = registry.loadAll();
    expect(loadCount).toBe(2);
    expect(registry.hasHook('beforeValidate')).toBe(true);
    expect(registry.hasHook('missing')).toBe(false);
    expect(registry.getAgents().map((agent) => agent.plugin)).toEqual(['alpha', 'beta']);
    expect(registry.getWorkflows().map((workflow) => workflow.plugin)).toEqual(['alpha', 'beta']);
    expect(registry.getCommands().map((command) => command.plugin)).toEqual(['alpha', 'beta']);
    expect(registry.getPluginsDir()).toContain(path.join('.grabby', 'plugins'));

    const results = await registry.executeHook('beforeValidate', { value: 'ctx' });
    expect(results).toEqual([
      { plugin: 'alpha', success: true, result: 'ok:ctx' },
      { plugin: 'beta', success: false, error: 'boom' },
    ]);

    const staticResults = await registry.executeHook('afterValidate', {});
    expect(staticResults).toEqual([{ plugin: 'alpha', success: true, result: 'static-result' }]);
  });

  test('validatePlugin reports YAML and JS issues', () => {
    const missingDir = path.join(dir, 'missing');
    fs.mkdirSync(missingDir, { recursive: true });
    expect(validatePlugin(missingDir)).toEqual({
      valid: false,
      errors: ['Missing plugin.yaml or index.js'],
      warnings: [],
    });

    const yamlDir = path.join(dir, 'yaml-bad');
    fs.mkdirSync(yamlDir, { recursive: true });
    fs.writeFileSync(path.join(yamlDir, 'plugin.yaml'), 'name: [oops', 'utf8');
    const yamlResult = validatePlugin(yamlDir);
    expect(yamlResult.valid).toBe(false);
    expect(yamlResult.errors[0]).toContain('Invalid YAML:');

    const warnDir = path.join(dir, 'warn-plugin');
    fs.mkdirSync(warnDir, { recursive: true });
    fs.writeFileSync(path.join(warnDir, 'plugin.yaml'), 'name: warn-plugin\n', 'utf8');
    const warnResult = validatePlugin(warnDir);
    expect(warnResult.valid).toBe(true);
    expect(warnResult.warnings).toContain('Missing version field');
  });

  test('scaffoldPlugin writes optional agent, workflow, command, and readme content', () => {
    const pluginsDir = path.join(dir, '.grabby', 'plugins');
    fs.mkdirSync(pluginsDir, { recursive: true });

    const pluginDir = scaffoldPlugin(pluginsDir, 'full-plugin', {
      description: 'All surfaces enabled',
      includeAgent: true,
      includeWorkflow: true,
      includeCommand: true,
    });

    const manifest = fs.readFileSync(path.join(pluginDir, 'plugin.yaml'), 'utf8');
    const readme = fs.readFileSync(path.join(pluginDir, 'README.md'), 'utf8');
    expect(manifest).toContain('full-plugin-agent');
    expect(manifest).toContain('full-plugin-workflow');
    expect(manifest).toContain('Run full-plugin command');
    expect(fs.existsSync(path.join(pluginDir, 'index.js'))).toBe(true);
    expect(readme).toContain('beforeExecute');
    expect(() => scaffoldPlugin(pluginsDir, 'full-plugin')).toThrow('Plugin already exists');
  });
});
