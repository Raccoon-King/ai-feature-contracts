const fs = require('fs');
const os = require('os');
const path = require('path');
const { detectProjectType, getProjectDirs, loadExistingContracts, generateSmartPrompts, getInterviewQuestions, suggestFieldValues } = require('../lib/smart-prompts.cjs');

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

  test('loadExistingContracts reads contract metadata', () => {
    const contractsDir = path.join(dir, 'contracts');
    fs.mkdirSync(contractsDir);
    fs.writeFileSync(path.join(contractsDir, 'FC-1.fc.md'), '# FC: Demo\n**ID:** FC-1 | **Status:** approved\n');

    const contracts = loadExistingContracts(contractsDir);

    expect(contracts).toHaveLength(1);
    expect(contracts[0]).toMatchObject({
      file: 'FC-1.fc.md',
      title: 'Demo',
      status: 'approved',
    });
  });

  test('generateSmartPrompts uses detected directories and test context', () => {
    const contractsDir = path.join(dir, 'contracts');
    fs.mkdirSync(contractsDir);
    fs.writeFileSync(path.join(dir, 'package.json'), '{}');
    fs.mkdirSync(path.join(dir, 'src'));
    fs.mkdirSync(path.join(dir, 'tests'));
    fs.writeFileSync(path.join(contractsDir, 'FC-2.fc.md'), '# FC: Existing\n**ID:** FC-2 | **Status:** draft\n');

    const context = generateSmartPrompts(dir, contractsDir, 'build a ui component');

    expect(context.projectDirs).toEqual(expect.arrayContaining(['src', 'tests']));
    expect(context.prompts.directories.some((item) => item.includes('Detected directories'))).toBe(true);
    expect(context.prompts.testing).toContain('Write unit tests for new functions');
    expect(context.prompts.context).toContain('Existing');
  });
});
