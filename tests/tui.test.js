const readline = require('readline');
const { EventEmitter } = require('events');
const { createProjectContext, createCommandHandlers } = require('../lib/commands.cjs');

jest.mock('../lib/watcher.cjs', () => ({
  runWatchMode: jest.fn(),
}));

jest.mock('../lib/ruleset-builder.cjs', () => ({
  runRulesetWizard: jest.fn().mockResolvedValue('docs/rules.ruleset.md'),
}));

const { drawBox, ansi, createMenu, createTUI, getStartupArt } = require('../lib/tui.cjs');

describe('tui', () => {
  function createMockInput() {
    const stdin = new EventEmitter();
    stdin.setRawMode = jest.fn();
    stdin.resume = jest.fn();
    stdin.once = jest.fn((event, handler) => {
      if (event === 'data') handler(Buffer.from('x'));
      return stdin;
    });
    return stdin;
  }

  function runTuiAction(actionIndex, setup = () => {}, options = {}) {
    const keys = [];
    for (let i = 0; i < actionIndex; i += 1) {
      keys.push('\u001B[B');
    }
    keys.push('\r');
    return runTuiKeys(keys, setup, options);
  }

  function runTuiKeys(keys, setup = () => {}, options = {}) {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-tui-'));
    const contractsDir = path.join(tmp, 'contracts');
    const grabbyDir = path.join(tmp, '.grabby');
    fs.mkdirSync(contractsDir, { recursive: true });
    fs.mkdirSync(grabbyDir, { recursive: true });
    setup({ fs, path, tmp, contractsDir, grabbyDir });

    const stdin = createMockInput();
    const answers = Array.isArray(options.answers) ? [...options.answers] : [];
    const originalStdin = process.stdin;
    const stdoutWrite = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const createInterfaceSpy = jest.spyOn(readline, 'createInterface').mockImplementation(() => ({
      close: jest.fn(),
      question: jest.fn((question, handler) => handler(answers.shift() ?? '')),
    }));

    Object.defineProperty(process, 'stdin', { value: stdin, configurable: true });

    const tui = createTUI({
      cwd: tmp,
      contractsDir,
      grabbyDir,
      commandHandlers: options.commandHandlers,
      exit: options.exit,
    });
    tui.start();
    keys.forEach((key) => stdin.emit('data', Buffer.from(key)));

    const output = consoleSpy.mock.calls.map((call) => call[0]).join('\n');

    stdoutWrite.mockRestore();
    consoleSpy.mockRestore();
    createInterfaceSpy.mockRestore();
    Object.defineProperty(process, 'stdin', { value: originalStdin, configurable: true });
    if (!options.keepTemp) {
      fs.rmSync(tmp, { recursive: true, force: true });
      return output;
    }

    return { output, tmp, contractsDir, grabbyDir };
  }

  test('drawBox renders bordered content', () => {
    const out = drawBox('Title', 'Hello', 20);
    expect(out).toContain('Hello');
    expect(out).toContain('+');
  });

  test('exports ansi constants and startup art', () => {
    expect(ansi).toHaveProperty('CLEAR_SCREEN');
    expect(getStartupArt()).toContain('Grabby');
  });

  test('createMenu returns controls', () => {
    const menu = createMenu({
      title: 'T',
      items: [{ label: 'One', action: 'one' }],
      onSelect: () => {},
      onExit: () => {},
    });
    expect(menu).toHaveProperty('start');
    expect(menu).toHaveProperty('render');
  });

  test('createMenu selects the highlighted item on Enter', () => {
    const rl = { close: jest.fn() };
    const onSelect = jest.fn();
    const stdin = new EventEmitter();
    stdin.setRawMode = jest.fn();
    stdin.resume = jest.fn();
    stdin.removeListener = jest.fn();
    const stdoutWrite = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const createInterfaceSpy = jest.spyOn(readline, 'createInterface').mockReturnValue(rl);
    const originalStdin = process.stdin;

    Object.defineProperty(process, 'stdin', { value: stdin, configurable: true });

    const menu = createMenu({
      title: 'Pick',
      items: [{ label: 'One', action: 'one' }, { label: 'Two', action: 'two' }],
      onSelect,
      onExit: jest.fn(),
    });

    menu.start();
    stdin.emit('data', Buffer.from('\u001B[B'));
    stdin.emit('data', Buffer.from('\r'));

    expect(onSelect).toHaveBeenCalledWith({ label: 'Two', action: 'two' }, 1);
    expect(rl.close).toHaveBeenCalled();

    stdoutWrite.mockRestore();
    consoleSpy.mockRestore();
    createInterfaceSpy.mockRestore();
    Object.defineProperty(process, 'stdin', { value: originalStdin, configurable: true });
  });

  test('createMenu exits on q', () => {
    const rl = { close: jest.fn() };
    const onExit = jest.fn();
    const stdin = new EventEmitter();
    stdin.setRawMode = jest.fn();
    stdin.resume = jest.fn();
    stdin.removeListener = jest.fn();
    const stdoutWrite = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const createInterfaceSpy = jest.spyOn(readline, 'createInterface').mockReturnValue(rl);
    const originalStdin = process.stdin;

    Object.defineProperty(process, 'stdin', { value: stdin, configurable: true });

    const menu = createMenu({
      items: [{ label: 'One', action: 'one' }],
      onSelect: jest.fn(),
      onExit,
    });

    menu.start();
    stdin.emit('data', Buffer.from('q'));

    expect(onExit).toHaveBeenCalled();
    expect(rl.close).toHaveBeenCalled();

    stdoutWrite.mockRestore();
    consoleSpy.mockRestore();
    createInterfaceSpy.mockRestore();
    Object.defineProperty(process, 'stdin', { value: originalStdin, configurable: true });
  });

  test('createTUI renders startup art and contract list', () => {
    const output = runTuiAction(0, ({ fs, path, contractsDir }) => {
      fs.writeFileSync(path.join(contractsDir, 'sample.fc.md'), '**Status:** draft\n', 'utf8');
    });
    expect(output).toContain('GrabbyAI');
    expect(output).toContain('Contracts');
    expect(output).toContain('sample.fc.md');
  });

  test('createTUI runs the setup wizard and applies recommended defaults', () => {
    const fs = require('fs');
    const path = require('path');

    const result = runTuiKeys([
      '\u001B[B',
      '\r',
      '\r',
    ], ({ fs: setupFs, tmp: setupTmp }) => {
      setupFs.writeFileSync(path.join(setupTmp, 'grabby.config.json'), JSON.stringify({
        version: '1.0',
        interactive: { enabled: false, defaultNextAction: null },
        contracts: { directory: 'contracts', trackingMode: 'tracked', templates: '.grabby/templates', autoValidate: true, strictMode: false },
        features: { menuMode: false, startupArt: false, rulesetWizard: false },
      }, null, 2));
    }, { keepTemp: true });

    const config = JSON.parse(fs.readFileSync(path.join(result.tmp, 'grabby.config.json'), 'utf8'));
    expect(result.output).toContain('Setup Wizard');
    expect(result.output).toContain('Applied recommended setup defaults.');
    expect(config.interactive.enabled).toBe(true);
    expect(config.features.menuMode).toBe(true);
    expect(config.features.startupArt).toBe(true);
    expect(config.features.rulesetWizard).toBe(true);

    fs.rmSync(result.tmp, { recursive: true, force: true });
  });

  test('createTUI surfaces brownfield project context in the home menu and setup wizard', () => {
    const output = runTuiKeys([
      '\u001B[B',
      '\r',
      '\u001B[B',
      '\u001B[B',
      '\u001B[B',
      '\u001B[B',
      '\r',
    ], ({ fs, path, grabbyDir }) => {
      fs.writeFileSync(path.join(grabbyDir, 'project-context.json'), JSON.stringify({
        stackSummary: 'Node.js project',
        summary: 'existing CLI repo',
        recommendedDirectories: ['lib', 'tests'],
        testing: { signals: ['test'] },
      }, null, 2));
    });

    expect(output).toContain('Brownfield context: Node.js project | Dirs: lib, tests');
    expect(output).toContain('Review Brownfield Context');
    expect(output).toContain('Node.js project | lib, tests');
  });

  test('createTUI shows guided create flow messaging', () => {
    const output = runTuiAction(2);
    expect(output).toContain('Contract Workflow');
    expect(output).toContain('Create New Contract');
    expect(output).toContain('Select Existing Contract');
  });

  test('createTUI creates a contract from the workflow menu', () => {
    const commandHandlers = {
      create: jest.fn(),
    };

    const output = runTuiKeys([
      '\u001B[B',
      '\u001B[B',
      '\r',
      '\r',
    ], () => {}, {
      answers: ['menu-created'],
      commandHandlers,
    });

    expect(output).toContain('Created contract via menu.');
    expect(commandHandlers.create).toHaveBeenCalledWith('menu-created');
  });

  test('createTUI falls back to command guidance when workflow handlers are unavailable', () => {
    const output = runTuiKeys([
      '\u001B[B',
      '\u001B[B',
      '\r',
      '\r',
    ], () => {}, {
      answers: ['menu-created'],
    });

    expect(output).toContain('Guided Contract Start');
    expect(output).toContain('grabby task "your feature request"');
  });

  test('createTUI recommends the next lifecycle action for an existing contract', () => {
    const output = runTuiKeys([
      '\u001B[B',
      '\u001B[B',
      '\r',
      '\u001B[B',
      '\r',
      '\r',
    ], ({ fs, path, contractsDir }) => {
      fs.writeFileSync(path.join(contractsDir, 'flow.fc.md'), `# FC: Flow
**ID:** FLOW-1 | **Status:** draft

## Objective
Ship a flow.

## Scope
- bounded

## Directories
**Allowed:** \`lib/\`
**Restricted:** \`node_modules/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | \`lib/tui.cjs\` | menu |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery

## Security Considerations
- [ ] reviewed

## Code Quality
- [ ] consistent

## Done When
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes

## Testing
- Unit
`, 'utf8');
    });

    expect(output).toContain('Recommended next step: Plan Contract');
  });

  test('createTUI reports when no contracts are available in the workflow menu', () => {
    const output = runTuiKeys([
      '\u001B[B',
      '\u001B[B',
      '\r',
      '\u001B[B',
      '\r',
    ]);

    expect(output).toContain('No contracts found.');
  });

  test('createTUI delegates the recommended execute action to command handlers', () => {
    const commandHandlers = {
      execute: jest.fn(),
    };

    runTuiKeys([
      '\u001B[B',
      '\u001B[B',
      '\r',
      '\u001B[B',
      '\r',
      '\r',
      '\r',
    ], ({ fs, path, contractsDir }) => {
      fs.writeFileSync(path.join(contractsDir, 'ship.fc.md'), `# FC: Ship
**ID:** SHIP-1 | **Status:** approved

## Objective
Ship it.

## Scope
- bounded

## Directories
**Allowed:** \`src/\`
**Restricted:** \`node_modules/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | \`src/ship.js\` | impl |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery

## Security Considerations
- [ ] reviewed

## Code Quality
- [ ] consistent

## Done When
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes

## Testing
- Unit
`, 'utf8');
      fs.writeFileSync(path.join(contractsDir, 'SHIP-1.plan.yaml'), 'status: approved\nfiles: []\n', 'utf8');
    }, {
      commandHandlers,
    });

    expect(commandHandlers.execute).toHaveBeenCalledWith('ship.fc.md', { yes: true });
  });

  test('createTUI recommends and delegates audit for executing contracts', () => {
    const commandHandlers = {
      audit: jest.fn(),
    };

    const output = runTuiKeys([
      '\u001B[B',
      '\u001B[B',
      '\r',
      '\u001B[B',
      '\r',
      '\r',
      '\r',
    ], ({ fs, path, contractsDir }) => {
      fs.writeFileSync(path.join(contractsDir, 'verify.fc.md'), `# FC: Verify
**ID:** VERIFY-1 | **Status:** approved

## Objective
Verify it.

## Scope
- bounded

## Directories
**Allowed:** \`src/\`
**Restricted:** \`node_modules/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | \`src/verify.js\` | impl |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery

## Security Considerations
- [ ] reviewed

## Code Quality
- [ ] consistent

## Done When
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes

## Testing
- Unit
`, 'utf8');
      fs.writeFileSync(path.join(contractsDir, 'VERIFY-1.plan.yaml'), 'status: executing\nfiles: []\n', 'utf8');
    }, {
      commandHandlers,
    });

    expect(output).toContain('Recommended next step: Audit Contract');
    expect(commandHandlers.audit).toHaveBeenCalledWith('verify.fc.md', { yes: true });
  });

  test('createTUI marks contracts complete after a passing audit', () => {
    const fs = require('fs');
    const path = require('path');
    const result = runTuiKeys([
      '\u001B[B',
      '\u001B[B',
      '\r',
      '\u001B[B',
      '\r',
      '\r',
      '\u001B[B',
      '\u001B[B',
      '\u001B[B',
      '\u001B[B',
      '\u001B[B',
      '\u001B[B',
      '\r',
    ], ({ fs: setupFs, path: setupPath, contractsDir }) => {
      setupFs.writeFileSync(path.join(contractsDir, 'done.fc.md'), `# FC: Done
**ID:** DONE-1 | **Status:** approved

## Objective
Close out.

## Scope
- bounded

## Directories
**Allowed:** \`src/\`
**Restricted:** \`node_modules/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | \`src/done.js\` | impl |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery

## Security Considerations
- [ ] reviewed

## Code Quality
- [ ] consistent

## Done When
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes

## Testing
- Unit
`, 'utf8');
      setupFs.writeFileSync(setupPath.join(contractsDir, 'DONE-1.plan.yaml'), 'status: executing\n', 'utf8');
      setupFs.writeFileSync(setupPath.join(contractsDir, 'DONE-1.audit.md'), '# Audit: DONE-1\n\n- Status: complete\n', 'utf8');
    }, { keepTemp: true });

    const contractContent = fs.readFileSync(path.join(result.contractsDir, 'done.fc.md'), 'utf8');
    const planContent = fs.readFileSync(path.join(result.contractsDir, 'DONE-1.plan.yaml'), 'utf8');
    expect(result.output).toContain('Contract marked complete.');
    expect(contractContent).toContain('**Status:** complete');
    expect(planContent).toContain('status: complete');

    fs.rmSync(result.tmp, { recursive: true, force: true });
  });

  test('createTUI archives completed contracts through the workflow menu', () => {
    const commandHandlers = {
      featureClose: jest.fn(),
    };

    runTuiKeys([
      '\u001B[B',
      '\u001B[B',
      '\r',
      '\u001B[B',
      '\r',
      '\r',
      '\r',
    ], ({ fs, path, contractsDir }) => {
      fs.writeFileSync(path.join(contractsDir, 'archive.fc.md'), `# FC: Archive
**ID:** ARC-1 | **Status:** complete

## Objective
Archive it.

## Scope
- bounded

## Directories
**Allowed:** \`src/\`
**Restricted:** \`node_modules/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | \`src/archive.js\` | impl |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery

## Security Considerations
- [ ] reviewed

## Code Quality
- [ ] consistent

## Done When
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes

## Testing
- Unit
`, 'utf8');
    }, {
      commandHandlers,
    });

    expect(commandHandlers.featureClose).toHaveBeenCalledWith('ARC-1', { yes: true });
  });

  test('createTUI blocks mark-complete when the audit has not passed', () => {
    const output = runTuiKeys([
      '\u001B[B',
      '\u001B[B',
      '\r',
      '\u001B[B',
      '\r',
      '\r',
      '\u001B[B',
      '\u001B[B',
      '\u001B[B',
      '\u001B[B',
      '\u001B[B',
      '\u001B[B',
      '\r',
    ], ({ fs, path, contractsDir }) => {
      fs.writeFileSync(path.join(contractsDir, 'blocked.fc.md'), `# FC: Blocked
**ID:** BLOCK-1 | **Status:** approved

## Objective
Do not complete yet.

## Scope
- bounded

## Directories
**Allowed:** \`src/\`
**Restricted:** \`node_modules/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | \`src/blocked.js\` | impl |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery

## Security Considerations
- [ ] reviewed

## Code Quality
- [ ] consistent

## Done When
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes

## Testing
- Unit
`, 'utf8');
      fs.writeFileSync(path.join(contractsDir, 'BLOCK-1.plan.yaml'), 'status: executing\nfiles: []\n', 'utf8');
    });

    expect(output).toContain('Audit has not passed yet for blocked.fc.md.');
  });

  test('createTUI surfaces guard failures from menu-driven workflow actions', () => {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-tui-guard-'));
    const contractsDir = path.join(tmp, 'contracts');
    const grabbyDir = path.join(tmp, '.grabby');
    fs.mkdirSync(contractsDir, { recursive: true });
    fs.mkdirSync(grabbyDir, { recursive: true });

    fs.writeFileSync(path.join(contractsDir, 'guarded.fc.md'), `# FC: Guarded
**ID:** GUARD-1 | **Status:** approved

## Objective
Test execute guards.

## Scope
- guarded

## Directories
**Allowed:** \`src/\`
**Restricted:** \`node_modules/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | \`src/guarded.js\` | impl |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery

## Security Considerations
- [ ] reviewed

## Code Quality
- [ ] consistent

## Done When
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes

## Testing
- Unit
`, 'utf8');

    const stdin = createMockInput();
    const originalStdin = process.stdin;
    const stdoutWrite = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const createInterfaceSpy = jest.spyOn(readline, 'createInterface').mockImplementation(() => ({
      close: jest.fn(),
      question: jest.fn((question, handler) => handler('')),
    }));

    Object.defineProperty(process, 'stdin', { value: stdin, configurable: true });

    const context = createProjectContext({ cwd: tmp, pkgRoot: path.join(__dirname, '..') });
    const handlers = createCommandHandlers({
      context,
      logger: console,
      exit: () => {},
    });
    const tui = createTUI({ cwd: tmp, contractsDir, grabbyDir, commandHandlers: handlers });
    tui.start();
    [
      '\u001B[B',
      '\u001B[B',
      '\r',
      '\u001B[B',
      '\r',
      '\r',
      '\u001B[B',
      '\u001B[B',
      '\u001B[B',
      '\u001B[B',
      '\r',
      'x',
    ].forEach((key) => stdin.emit('data', Buffer.from(key)));

    const output = consoleSpy.mock.calls.map((call) => call[0]).join('\n');
    expect(output).toContain('No plan found. Run: grabby plan guarded.fc.md');

    stdoutWrite.mockRestore();
    consoleSpy.mockRestore();
    createInterfaceSpy.mockRestore();
    Object.defineProperty(process, 'stdin', { value: originalStdin, configurable: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('createTUI runs validation summary', () => {
    const output = runTuiAction(3, ({ fs, path, contractsDir }) => {
      fs.writeFileSync(path.join(contractsDir, 'valid.fc.md'), `# FC: Valid
**ID:** FC-1 | **Status:** draft

## Objective
Test

## Scope
- Ship it

## Directories
**Allowed:** \`src/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | \`src/x.js\` | impl |
| create | \`tests/x.test.js\` | tests |

## Done When
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes

## Security Considerations
- [ ] Validate input

## Testing
- Unit
`, 'utf8');
    });
    expect(output).toContain('Validating Contracts');
    expect(output).toContain('1 passed, 0 failed');
  });

  test('createTUI shows metrics summary', () => {
    const output = runTuiAction(4, ({ fs, path, contractsDir }) => {
      fs.writeFileSync(path.join(contractsDir, 'valid.fc.md'), '# FC: Metrics\n**ID:** FC-1 | **Status:** approved\n## Objective\nOk\n## Scope\n- one\n## Done When\n- [ ] done\n', 'utf8');
    });
    expect(output).toContain('GRABBY METRICS REPORT');
  });

  test('createTUI enters watch mode', () => {
    const watcher = require('../lib/watcher.cjs');
    const spy = jest.spyOn(watcher, 'runWatchMode').mockImplementation(() => {});

    const output = runTuiAction(5);

    expect(output).toContain('Starting watch mode');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  test('createTUI shows cicd setup summary', () => {
    const output = runTuiAction(6);
    expect(output).toContain('CI/CD');
    expect(output).toContain('GitHub Actions workflow: Missing');
  });

  test('createTUI generates a selected automation asset through the automation wizard', () => {
    const fs = require('fs');
    const path = require('path');
    const result = runTuiKeys([
      '\u001B[B',
      '\u001B[B',
      '\u001B[B',
      '\u001B[B',
      '\u001B[B',
      '\u001B[B',
      '\r',
      '\r',
      '\r',
    ], () => {}, { keepTemp: true });

    const workflowPath = path.join(result.tmp, '.github', 'workflows', 'contract-validation.yml');
    expect(result.output).toContain('Automation');
    expect(result.output).toContain('Configured GitHub Actions workflow.');
    expect(fs.existsSync(workflowPath)).toBe(true);

    fs.rmSync(result.tmp, { recursive: true, force: true });
  });

  test('createTUI imports a selected automation asset through the automation wizard', () => {
    const fs = require('fs');
    const path = require('path');
    const result = runTuiKeys([
      '\u001B[B',
      '\u001B[B',
      '\u001B[B',
      '\u001B[B',
      '\u001B[B',
      '\u001B[B',
      '\r',
      '\u001B[B',
      '\r',
      '\u001B[B',
      '\r',
    ], ({ fs: setupFs, path: setupPath, tmp }) => {
      setupFs.writeFileSync(setupPath.join(tmp, 'existing-pr.md'), '# Imported Template\n', 'utf8');
    }, {
      keepTemp: true,
      answers: ['existing-pr.md'],
    });

    const prTemplatePath = path.join(result.tmp, '.github', 'PULL_REQUEST_TEMPLATE.md');
    expect(result.output).toContain('Imported PR template.');
    expect(fs.readFileSync(prTemplatePath, 'utf8')).toContain('Imported Template');

    fs.rmSync(result.tmp, { recursive: true, force: true });
  });

  test('createTUI shows plugin summary when none are installed', () => {
    const output = runTuiAction(7);
    expect(output).toContain('Installed Plugins');
    expect(output).toContain('No plugins installed');
  });

  test('createTUI toggles settings in repo config', () => {
    const output = runTuiKeys([
      '\u001B[B',
      '\u001B[B',
      '\u001B[B',
      '\u001B[B',
      '\u001B[B',
      '\u001B[B',
      '\u001B[B',
      '\u001B[B',
      '\r',
      '\r',
    ]);
    expect(output).toContain('Updated interactive.enabled -> ON');
  });

  test('createTUI launches ruleset wizard flows from the menu', () => {
    const rulesets = require('../lib/ruleset-builder.cjs');
    const output = runTuiKeys([
      '\u001B[B',
      '\u001B[B',
      '\u001B[B',
      '\u001B[B',
      '\u001B[B',
      '\u001B[B',
      '\u001B[B',
      '\u001B[B',
      '\u001B[B',
      '\r',
      '\r',
    ]);
    expect(output).toContain('Ruleset Wizards');
    expect(rulesets.runRulesetWizard).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      mode: 'import-existing',
      logger: console,
    }));
  });

  test('createTUI exits cleanly from menu action', () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit:${code}`);
    });

    expect(() => runTuiAction(10)).toThrow('exit:0');

    exitSpy.mockRestore();
  });
});
