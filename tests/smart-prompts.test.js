const fs = require('fs');
const os = require('os');
const path = require('path');
const { detectProjectType, getProjectDirs, getInterviewQuestions, suggestFieldValues } = require('../lib/smart-prompts.cjs');

describe('smart-prompts', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-prompts-'));
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('detectProjectType finds react/typescript', () => {
    fs.writeFileSync(path.join(dir, 'package.json'), '{}');
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{}');
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'App.tsx'), '');
    const types = detectProjectType(dir);
    expect(types).toContain('react');
    expect(types).toContain('typescript');
  });

  test('getProjectDirs lists common dirs', () => {
    fs.mkdirSync(path.join(dir, 'src'));
    fs.mkdirSync(path.join(dir, 'tests'));
    expect(getProjectDirs(dir)).toEqual(expect.arrayContaining(['src', 'tests']));
  });

  test('question and suggestion helpers return values', () => {
    expect(getInterviewQuestions('scope').length).toBeGreaterThan(0);
    const suggestions = suggestFieldValues('directories.restricted');
    expect(suggestions).toEqual(expect.arrayContaining(['node_modules/', '.git/']));
  });
});
