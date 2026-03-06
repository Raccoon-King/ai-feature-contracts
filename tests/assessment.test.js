jest.mock('../lib/smart-prompts.cjs', () => ({
  detectProjectType: jest.fn(),
  getProjectDirs: jest.fn(),
}));

jest.mock('../lib/ai-complete.cjs', () => ({
  summarizeProjectAssessment: jest.fn(),
}));

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  collectProjectAssessment,
  generateBaselineContracts,
  buildProjectBaselineContract,
  deriveProjectContext,
  generateProjectContextArtifact,
} = require('../lib/assessment.cjs');
const { detectProjectType, getProjectDirs } = require('../lib/smart-prompts.cjs');
const { summarizeProjectAssessment } = require('../lib/ai-complete.cjs');

describe('assessment helpers', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-assessment-'));
    jest.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('collectProjectAssessment infers package metadata, tests, and contracts', () => {
    detectProjectType.mockReturnValue(['react', 'typescript', 'react']);
    getProjectDirs.mockReturnValue(['src', 'tests', 'src', 'components']);
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      name: 'demo-app',
      dependencies: { react: '^18.0.0' },
      devDependencies: { jest: '^29.0.0' },
      scripts: { test: 'jest', start: 'node index.js' },
    }), 'utf8');
    fs.mkdirSync(path.join(tempDir, 'contracts'));
    fs.mkdirSync(path.join(tempDir, 'src'));
    fs.writeFileSync(path.join(tempDir, 'README.md'), 'hi', 'utf8');
    fs.mkdirSync(path.join(tempDir, 'node_modules'));
    fs.mkdirSync(path.join(tempDir, '.hidden'));

    const assessment = collectProjectAssessment(tempDir);

    expect(assessment.packageName).toBe('demo-app');
    expect(assessment.projectTypes).toEqual(['react', 'typescript']);
    expect(assessment.projectDirs).toEqual(['src', 'tests', 'components']);
    expect(assessment.stackSummary).toBe('React + TypeScript application');
    expect(assessment.dependencies).toEqual(['react']);
    expect(assessment.devDependencies).toEqual(['jest']);
    expect(assessment.scripts).toEqual(['start', 'test']);
    expect(assessment.hasTests).toBe(true);
    expect(assessment.hasContracts).toBe(true);
    expect(assessment.pluginSuggestions).toEqual([]);
    expect(assessment.rootEntries).toEqual(expect.arrayContaining([
      { name: 'README.md', kind: 'file' },
      { name: 'contracts', kind: 'dir' },
      { name: 'src', kind: 'dir' },
    ]));
    expect(assessment.rootEntries.find((entry) => entry.name === 'node_modules')).toBeUndefined();
    expect(assessment.rootEntries.find((entry) => entry.name === '.hidden')).toBeUndefined();
  });

  test('collectProjectAssessment falls back cleanly for invalid package metadata', () => {
    detectProjectType.mockReturnValue(['python']);
    getProjectDirs.mockReturnValue([]);
    fs.writeFileSync(path.join(tempDir, 'package.json'), '{invalid', 'utf8');

    const assessment = collectProjectAssessment(tempDir);

    expect(assessment.packageName).toBe(path.basename(tempDir));
    expect(assessment.stackSummary).toBe('Python project');
    expect(assessment.dependencies).toEqual([]);
    expect(assessment.devDependencies).toEqual([]);
    expect(assessment.scripts).toEqual([]);
    expect(assessment.hasTests).toBe(false);
    expect(assessment.hasContracts).toBe(false);
  });

  test('collectProjectAssessment covers additional stack summaries and test detection paths', () => {
    detectProjectType.mockReturnValue(['nextjs']);
    getProjectDirs.mockReturnValue(['app']);
    expect(collectProjectAssessment(tempDir).stackSummary).toBe('Next.js application');

    detectProjectType.mockReturnValue(['typescript', 'node']);
    getProjectDirs.mockReturnValue(['lib']);
    expect(collectProjectAssessment(tempDir).stackSummary).toBe('Node.js + TypeScript CLI/service');

    detectProjectType.mockReturnValue(['go']);
    getProjectDirs.mockReturnValue(['__tests__']);
    const goAssessment = collectProjectAssessment(tempDir);
    expect(goAssessment.stackSummary).toBe('Go project');
    expect(goAssessment.hasTests).toBe(true);

    detectProjectType.mockReturnValue(['rust']);
    getProjectDirs.mockReturnValue(['client']);
    expect(collectProjectAssessment(tempDir).stackSummary).toBe('Rust project');
  });

  test('collectProjectAssessment detects nested Go projects and singular test directories', () => {
    detectProjectType.mockReturnValue([]);
    getProjectDirs.mockReturnValue([]);
    fs.mkdirSync(path.join(tempDir, 'go-proxy'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'go-proxy', 'go.mod'), 'module example.com/go-proxy\n', 'utf8');
    fs.mkdirSync(path.join(tempDir, 'test'), { recursive: true });

    const assessment = collectProjectAssessment(tempDir);

    expect(assessment.projectTypes).toContain('go');
    expect(assessment.stackSummary).toBe('Go project');
    expect(assessment.hasTests).toBe(true);
  });

  test('buildProjectBaselineContract falls back when no common directories or dependencies exist', () => {
    const contract = buildProjectBaselineContract({
      packageName: '',
      dependencies: [],
      devDependencies: [],
      projectDirs: ['docs'],
      projectTypes: [],
      rootEntries: [],
      stackSummary: 'software project',
    }, 'summary text');

    expect(contract).toContain('Package/Application: local repository');
    expect(contract).toContain('existing repository dependencies');
    expect(contract).toContain('**Allowed:** `src/`, `lib/`, `tests/`');
    expect(contract).toContain('Detected stack: local project structure');
    expect(contract).toContain('no notable root signals detected');
    expect(contract).toContain('Assessment summary: summary text');
  });

  test('generateBaselineContracts creates baseline files and skips reruns', async () => {
    detectProjectType.mockReturnValue(['node']);
    getProjectDirs.mockReturnValue(['lib']);
    summarizeProjectAssessment.mockResolvedValue('generated summary');
    fs.mkdirSync(path.join(tempDir, 'contracts'));
    fs.mkdirSync(path.join(tempDir, 'templates'));
    fs.writeFileSync(path.join(tempDir, 'templates', 'system-baseline.md'), [
      '# Feature Contract: {{PROJECT_NAME}}',
      'Summary: {{SUMMARY}}',
      'Stack: {{STACK_SUMMARY}}',
    ].join('\n'), 'utf8');
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'cli-tool' }), 'utf8');

    const created = await generateBaselineContracts({
      cwd: tempDir,
      contractsDir: path.join(tempDir, 'contracts'),
      templatesDir: path.join(tempDir, 'templates'),
    });

    expect(created.summary).toBe('generated summary');
    expect(created.created).toEqual(['SYSTEM-BASELINE.fc.md', 'PROJECT-BASELINE.fc.md', 'SETUP-BASELINE.fc.md']);
    expect(created.skipped).toEqual([]);
    expect(fs.readFileSync(path.join(tempDir, 'contracts', 'SYSTEM-BASELINE.fc.md'), 'utf8')).toContain('Summary: generated summary');
    expect(fs.readFileSync(path.join(tempDir, 'contracts', 'PROJECT-BASELINE.fc.md'), 'utf8')).toContain('Package/Application: `cli-tool`');
    const setupBaseline = fs.readFileSync(path.join(tempDir, 'contracts', 'SETUP-BASELINE.fc.md'), 'utf8');
    expect(setupBaseline).toContain('deterministic setup validation');
    expect(setupBaseline).toContain('Fibonacci points only');
    expect(setupBaseline).toContain('Post-Feature Ticket Format');

    const skipped = await generateBaselineContracts({
      cwd: tempDir,
      contractsDir: path.join(tempDir, 'contracts'),
      templatesDir: path.join(tempDir, 'templates'),
    });

    expect(skipped.created).toEqual([]);
    expect(skipped.skipped).toEqual(['SYSTEM-BASELINE.fc.md', 'PROJECT-BASELINE.fc.md', 'SETUP-BASELINE.fc.md']);
  });

  test('derives a reusable project-context artifact from assessment data', () => {
    const projectContext = deriveProjectContext({
      packageName: 'demo-app',
      stackSummary: 'React application',
      projectTypes: ['react'],
      projectDirs: ['src', 'tests', 'docs'],
      scripts: ['lint', 'test'],
      dependencies: ['react'],
      devDependencies: ['jest'],
      hasTests: true,
      hasContracts: false,
      pluginSuggestions: ['helm'],
      rootEntries: [{ name: 'src', kind: 'dir' }],
    }, 'react brownfield repo');

    expect(projectContext.stackSummary).toBe('React application');
    expect(projectContext.summary).toBe('react brownfield repo');
    expect(projectContext.recommendedDirectories).toEqual(['src', 'tests', 'docs']);
    expect(projectContext.testing.hasTests).toBe(true);
    expect(projectContext.governance.allowedDirectories).toEqual(['src', 'tests', 'docs']);
    expect(projectContext.plugins.suggested).toEqual(['helm']);
  });

  test('generates and saves project-context artifact', async () => {
    detectProjectType.mockReturnValue(['node']);
    getProjectDirs.mockReturnValue(['lib', 'tests']);
    summarizeProjectAssessment.mockResolvedValue('cli brownfield repo');
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      name: 'cli-tool',
      scripts: { test: 'jest' },
      dependencies: { chalk: '^5.0.0' },
    }), 'utf8');

    const result = await generateProjectContextArtifact({ cwd: tempDir });

    expect(result.summary).toBe('cli brownfield repo');
    expect(path.relative(tempDir, result.outputPath).replace(/\\/g, '/')).toBe('.grabby/project-context.json');
    expect(fs.existsSync(result.outputPath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(result.outputPath, 'utf8'))).toEqual(expect.objectContaining({
      packageName: 'cli-tool',
      stackSummary: 'Node.js project',
      summary: 'cli brownfield repo',
    }));
  });

  test('collectProjectAssessment suggests plugins from deterministic repo signals', () => {
    detectProjectType.mockReturnValue(['node']);
    getProjectDirs.mockReturnValue(['helm', 'src']);
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      name: 'platform-tools',
      dependencies: { 'keycloak-js': '^1.0.0' },
    }), 'utf8');
    fs.writeFileSync(path.join(tempDir, 'Chart.yaml'), 'apiVersion: v2\nname: demo\n', 'utf8');

    const assessment = collectProjectAssessment(tempDir);

    expect(assessment.pluginSuggestions).toEqual(expect.arrayContaining(['helm', 'keycloak']));
  });
});
