const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  DEFAULT_GRABBYIGNORE,
  getGrabbyIgnorePath,
  initGrabbyIgnore,
  loadGrabbyIgnore,
  globToRegExp,
  isIgnoredByGrabby,
} = require('../lib/ignore.cjs');

describe('Grabby ignore', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-ignore-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('initializes a default .grabbyignore', () => {
    const ignorePath = initGrabbyIgnore(tempDir);

    expect(ignorePath).toBe(getGrabbyIgnorePath(tempDir));
    expect(fs.readFileSync(ignorePath, 'utf8')).toBe(DEFAULT_GRABBYIGNORE);
  });

  it('loads ignore patterns and matches ignored paths', () => {
    initGrabbyIgnore(tempDir);
    const ignoredDir = path.join(tempDir, 'coverage');
    const ignoredFile = path.join(ignoredDir, 'index.html');
    fs.mkdirSync(ignoredDir, { recursive: true });
    fs.writeFileSync(ignoredFile, 'ok');

    expect(loadGrabbyIgnore(tempDir)).toContain('coverage/');
    expect(isIgnoredByGrabby(tempDir, ignoredFile)).toBe(true);
    expect(isIgnoredByGrabby(tempDir, path.join(tempDir, 'contracts', 'demo.fc.md'))).toBe(false);
  });

  it('supports glob-style ignore patterns', () => {
    fs.writeFileSync(path.join(tempDir, '.grabbyignore'), [
      '**/*.session.json',
      'tmp/*.log',
    ].join('\n'));

    expect(globToRegExp('**/*.session.json').test('contracts/demo.session.json')).toBe(true);
    expect(isIgnoredByGrabby(tempDir, path.join(tempDir, 'contracts', 'demo.session.json'))).toBe(true);
    expect(isIgnoredByGrabby(tempDir, path.join(tempDir, 'tmp', 'build.log'))).toBe(true);
    expect(isIgnoredByGrabby(tempDir, path.join(tempDir, 'tmp', 'build.txt'))).toBe(false);
  });

  it('supports negated ignore patterns in declaration order', () => {
    fs.writeFileSync(path.join(tempDir, '.grabbyignore'), [
      '**/*.session.json',
      '!contracts/keep.session.json',
    ].join('\n'));

    expect(isIgnoredByGrabby(tempDir, path.join(tempDir, 'contracts', 'drop.session.json'))).toBe(true);
    expect(isIgnoredByGrabby(tempDir, path.join(tempDir, 'contracts', 'keep.session.json'))).toBe(false);
  });
});
