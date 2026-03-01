const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveInputFiles, summarizeFiles } = require('../lib/ruleset-builder.cjs');

describe('ruleset builder helpers', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-ruleset-'));
    fs.mkdirSync(path.join(tempDir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'README.md'), '# Hello\n', 'utf8');
    fs.writeFileSync(path.join(tempDir, 'docs', 'guide.md'), 'Guide content', 'utf8');
    fs.writeFileSync(path.join(tempDir, 'docs', 'image.png'), 'not-text', 'utf8');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('resolves files and ignores non-text files', () => {
    const files = resolveInputFiles(tempDir, ['README.md', 'docs']);
    const rel = files.map((f) => path.relative(tempDir, f).replace(/\\/g, '/')).sort();
    expect(rel).toEqual(['README.md', 'docs/guide.md']);
  });

  it('summarizes file snippets with file markers', () => {
    const files = resolveInputFiles(tempDir, ['README.md']);
    const summary = summarizeFiles(tempDir, files);
    expect(summary).toContain('## File: README.md');
    expect(summary).toContain('# Hello');
  });
});
