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
const { createWatcher } = require('../lib/watcher.cjs');

describe('watcher', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watcher-'));
    fs.writeFileSync(path.join(dir, 'demo.fc.md'), '# FC: demo\n**ID:** FC-1 | **Status:** draft\n## Objective\nx\n## Scope\n- y\n## Done When\n- z\n');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

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
});
