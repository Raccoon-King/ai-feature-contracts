const readline = require('readline');
const { EventEmitter } = require('events');

jest.mock('../lib/watcher.cjs', () => ({
  runWatchMode: jest.fn(),
}));

const { drawBox, ansi, createMenu, createTUI } = require('../lib/tui.cjs');

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

  function runTuiAction(actionIndex, setup = () => {}) {
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
    const originalStdin = process.stdin;
    const stdoutWrite = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const createInterfaceSpy = jest.spyOn(readline, 'createInterface').mockReturnValue({ close: jest.fn() });

    Object.defineProperty(process, 'stdin', { value: stdin, configurable: true });

    const tui = createTUI({ contractsDir, grabbyDir });
    tui.start();
    for (let i = 0; i < actionIndex; i += 1) {
      stdin.emit('data', Buffer.from('\u001B[B'));
    }
    stdin.emit('data', Buffer.from('\r'));

    const output = consoleSpy.mock.calls.map((call) => call[0]).join('\n');

    stdoutWrite.mockRestore();
    consoleSpy.mockRestore();
    createInterfaceSpy.mockRestore();
    Object.defineProperty(process, 'stdin', { value: originalStdin, configurable: true });
    fs.rmSync(tmp, { recursive: true, force: true });

    return output;
  }

  test('drawBox renders bordered content', () => {
    const out = drawBox('Title', 'Hello', 20);
    expect(out).toContain('Hello');
    expect(out).toContain('┌');
  });

  test('exports ansi constants', () => {
    expect(ansi).toHaveProperty('CLEAR_SCREEN');
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
    const stdoutWrite = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
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
    const stdoutWrite = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
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

  test('createMenu keeps the first item selected when pressing up at the top', () => {
    const rl = { close: jest.fn() };
    const onSelect = jest.fn();
    const stdin = new EventEmitter();
    stdin.setRawMode = jest.fn();
    stdin.resume = jest.fn();
    const stdoutWrite = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const createInterfaceSpy = jest.spyOn(readline, 'createInterface').mockReturnValue(rl);
    const originalStdin = process.stdin;

    Object.defineProperty(process, 'stdin', { value: stdin, configurable: true });

    const menu = createMenu({
      items: [{ label: 'One', action: 'one' }, { label: 'Two', action: 'two' }],
      onSelect,
      onExit: jest.fn(),
    });

    menu.start();
    stdin.emit('data', Buffer.from('\u001B[A'));
    stdin.emit('data', Buffer.from('\r'));

    expect(onSelect).toHaveBeenCalledWith({ label: 'One', action: 'one' }, 0);

    stdoutWrite.mockRestore();
    consoleSpy.mockRestore();
    createInterfaceSpy.mockRestore();
    Object.defineProperty(process, 'stdin', { value: originalStdin, configurable: true });
  });

  test('createMenu exits on Ctrl+C', () => {
    const rl = { close: jest.fn() };
    const onExit = jest.fn();
    const stdin = new EventEmitter();
    stdin.setRawMode = jest.fn();
    stdin.resume = jest.fn();
    const stdoutWrite = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const createInterfaceSpy = jest.spyOn(readline, 'createInterface').mockReturnValue(rl);
    const originalStdin = process.stdin;

    Object.defineProperty(process, 'stdin', { value: stdin, configurable: true });

    const menu = createMenu({
      items: [{ label: 'One', action: 'one' }],
      onSelect: jest.fn(),
      onExit,
    });

    menu.start();
    stdin.emit('data', Buffer.from('\u0003'));

    expect(onExit).toHaveBeenCalled();

    stdoutWrite.mockRestore();
    consoleSpy.mockRestore();
    createInterfaceSpy.mockRestore();
    Object.defineProperty(process, 'stdin', { value: originalStdin, configurable: true });
  });

  test('createTUI lists contracts from the current project', () => {
    const output = runTuiAction(0, ({ fs, path, contractsDir }) => {
      fs.writeFileSync(path.join(contractsDir, 'sample.fc.md'), '**Status:** draft\n', 'utf8');
    });
    expect(output).toContain('Contracts');
    expect(output).toContain('sample.fc.md');
  });

  test('createTUI shows create guidance', () => {
    const output = runTuiAction(1);
    expect(output).toContain('Creating contract');
    expect(output).toContain('grabby task');
  });

  test('createTUI runs validation summary', () => {
    const output = runTuiAction(2, ({ fs, path, contractsDir }) => {
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
    expect(output).toContain('passed, 0 failed');
  });

  test('createTUI shows metrics summary', () => {
    const output = runTuiAction(3, ({ fs, path, contractsDir }) => {
      fs.writeFileSync(path.join(contractsDir, 'valid.fc.md'), '# FC: Metrics\n**ID:** FC-1 | **Status:** approved\n## Objective\nOk\n## Scope\n- one\n## Done When\n- [ ] done\n', 'utf8');
    });
    expect(output).toContain('GRABBY METRICS REPORT');
  });

  test('createTUI shows plugin summary when none are installed', () => {
    const output = runTuiAction(6);
    expect(output).toContain('Installed Plugins');
    expect(output).toContain('No plugins installed');
  });

  test('createTUI shows installed plugins when present', () => {
    const plugins = require('../lib/plugins.cjs');
    const spy = jest.spyOn(plugins, 'createPluginRegistry').mockReturnValue({
      loadAll: jest.fn(),
      list: () => [{ name: 'demo-plugin', version: '1.2.3', description: 'Adds demo behavior' }],
    });

    const output = runTuiAction(6);

    expect(output).toContain('demo-plugin');
    expect(output).toContain('Adds demo behavior');
    spy.mockRestore();
  });

  test('createTUI reports missing contracts directory', () => {
    const output = runTuiAction(0, ({ fs, contractsDir }) => {
      fs.rmSync(contractsDir, { recursive: true, force: true });
    });
    expect(output).toContain('No contracts directory found');
  });

  test('createTUI reports an empty contracts directory', () => {
    const output = runTuiAction(0);
    expect(output).toContain('No contracts found');
  });

  test('createTUI shows invalid validation summary', () => {
    const output = runTuiAction(2, ({ fs, path, contractsDir }) => {
      fs.writeFileSync(path.join(contractsDir, 'invalid.fc.md'), '# invalid\n', 'utf8');
    });
    expect(output).toContain('Validating Contracts');
    expect(output).toContain('0 passed, 1 failed');
  });

  test('createTUI reports missing contracts directory during validation', () => {
    const output = runTuiAction(2, ({ fs, contractsDir }) => {
      fs.rmSync(contractsDir, { recursive: true, force: true });
    });
    expect(output).toContain('No contracts directory');
  });

  test('createTUI enters watch mode', () => {
    const watcher = require('../lib/watcher.cjs');
    const spy = jest.spyOn(watcher, 'runWatchMode').mockImplementation(() => {});

    const output = runTuiAction(4);

    expect(output).toContain('Starting watch mode');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  test('createTUI shows cicd setup summary', () => {
    const output = runTuiAction(5);
    expect(output).toContain('CI/CD');
  });

  test('createTUI exits cleanly from menu action', () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit:${code}`);
    });

    expect(() => runTuiAction(7)).toThrow('exit:0');

    exitSpy.mockRestore();
  });
});
