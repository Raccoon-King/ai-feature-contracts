jest.mock('chokidar', () => ({
  watch: jest.fn(() => {
    const handlers = {};
    const api = {
      on: (event, cb) => { handlers[event] = cb; return api; },
      close: jest.fn(async () => {}),
      __handlers: handlers,
    };
    return api;
  }),
}));

const fs = require('fs');
const os = require('os');
const path = require('path');
const chokidar = require('chokidar');
const { createWatcher, runWatchMode } = require('../lib/watcher.cjs');

describe('watcher', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watcher-'));
    fs.writeFileSync(path.join(dir, 'demo.fc.md'), '# FC: demo\n**ID:** FC-1 | **Status:** draft\n## Objective\nx\n## Scope\n- y\n## Done When\n- z\n');
    jest.useFakeTimers();
    chokidar.watch.mockClear();
  });
  afterEach(() => {
    jest.useRealTimers();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('validateAll validates contracts', () => {
    const watcher = createWatcher(dir);
    const results = watcher.validateAll();
    expect(results.length).toBe(1);
    expect(results[0]).toHaveProperty('valid');
  });

  test('start/stop toggles running state', async () => {
    const watcher = createWatcher(dir, { logger: { log: () => {} } });
    watcher.start();
    expect(watcher.isRunning()).toBe(true);
    await watcher.stop();
    expect(watcher.isRunning()).toBe(false);
  });

  test('registers a watcher for contract files', () => {
    const watcher = createWatcher(dir, { logger: { log: () => {} } });
    watcher.start();

    expect(chokidar.watch).toHaveBeenCalledWith(
      path.join(dir, '*.fc.md'),
      expect.objectContaining({
        persistent: true,
        ignoreInitial: false,
      })
    );
  });

  test('debounces change events and validates once', () => {
    const changes = [];
    const validations = [];
    const watcher = createWatcher(dir, {
      logger: { log: () => {} },
      debounceMs: 25,
      onChange: (event) => changes.push(event),
      onValidate: (event) => validations.push(event),
    });

    watcher.start();
    const api = chokidar.watch.mock.results.at(-1).value;
    const filePath = path.join(dir, 'demo.fc.md');

    api.__handlers.change(filePath);
    api.__handlers.change(filePath);
    jest.advanceTimersByTime(24);
    expect(changes).toHaveLength(0);
    expect(validations).toHaveLength(0);

    jest.advanceTimersByTime(1);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({ filePath, type: 'change' });
    expect(validations).toHaveLength(1);
    expect(validations[0].fileName).toBe('demo.fc.md');
  });

  test('skips ignored files during bulk validation', () => {
    fs.writeFileSync(path.join(path.dirname(dir), '.grabbyignore'), `${path.basename(dir)}/ignored.fc.md\n`, 'utf8');
    fs.writeFileSync(path.join(dir, 'ignored.fc.md'), '# FC: ignored\n**ID:** FC-2 | **Status:** draft\n', 'utf8');
    const validations = [];
    const watcher = createWatcher(dir, {
      logger: { log: () => {} },
      onValidate: (event) => validations.push(event),
    });

    const results = watcher.validateAll();

    const ignored = results.find((result) => result.file === 'ignored.fc.md');
    expect(ignored).toMatchObject({ skipped: true, reason: 'ignored' });
    expect(validations.some((event) => event.fileName === 'ignored.fc.md')).toBe(false);
  });

  test('reports add, unlink, and error watcher events', () => {
    const errors = [];
    const logger = { log: jest.fn() };
    const watcher = createWatcher(dir, {
      logger,
      onError: (event) => errors.push(event),
    });

    watcher.start();
    const api = chokidar.watch.mock.results.at(-1).value;
    const filePath = path.join(dir, 'demo.fc.md');
    const error = new Error('watch failed');

    api.__handlers.add(filePath);
    api.__handlers.unlink(filePath);
    api.__handlers.error(error);

    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('Watching: demo.fc.md'));
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('Removed: demo.fc.md'));
    expect(errors).toContainEqual({ error });
  });

  test('does not register a second watcher when started twice', () => {
    const watcher = createWatcher(dir, { logger: { log: () => {} } });

    watcher.start();
    watcher.start();

    expect(chokidar.watch).toHaveBeenCalledTimes(1);
  });

  test('runWatchMode formats validation output and handles shutdown', async () => {
    const logger = { log: jest.fn() };
    const onSpy = jest.spyOn(process, 'on').mockImplementation(() => process);
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

    const watcher = runWatchMode(dir, { logger });
    const api = chokidar.watch.mock.results.at(-1).value;

    api.__handlers.add(path.join(dir, 'demo.fc.md'));
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('demo.fc.md'));

    const sigintHandler = onSpy.mock.calls.find(([event]) => event === 'SIGINT')[1];
    await sigintHandler();

    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('Stopping watcher'));
    expect(api.close).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(watcher.isRunning()).toBe(false);

    onSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
