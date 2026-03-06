const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  DEFAULT_CONFIG,
  getGrabbyDir,
  getConfigPath,
  initConfig,
  loadConfig,
  renderPromptBundle,
} = require('../lib/governance.cjs');

describe('Governance', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-governance-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('derives grabby paths from cwd', () => {
    expect(getGrabbyDir(tempDir)).toBe(path.join(tempDir, '.grabby'));
    expect(getConfigPath(tempDir)).toBe(path.join(tempDir, '.grabby', 'config.json'));
  });

  it('initializes config once and preserves existing config', () => {
    const configPath = initConfig(tempDir);
    const first = fs.readFileSync(configPath, 'utf8');

    fs.writeFileSync(configPath, JSON.stringify({ version: 9 }, null, 2));
    initConfig(tempDir);

    expect(first).toContain('"defaultProvider": "generic"');
    expect(JSON.parse(fs.readFileSync(configPath, 'utf8')).version).toBe(9);
  });

  it('loads default config when repo config does not exist', () => {
    const config = loadConfig(tempDir);
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('merges repo overrides onto the default config', () => {
    initConfig(tempDir);
    fs.writeFileSync(getConfigPath(tempDir), JSON.stringify({
      llm: {
        defaultProvider: 'anthropic',
      },
      agile: {
        maxTasksPerEpic: 3,
      },
    }, null, 2));

    const config = loadConfig(tempDir);

    expect(config.llm.defaultProvider).toBe('anthropic');
    expect(config.agile.maxTasksPerEpic).toBe(3);
    expect(config.agile.maxSubtasksPerTask).toBe(DEFAULT_CONFIG.agile.maxSubtasksPerTask);
    expect(config.governance.rules).toEqual(DEFAULT_CONFIG.governance.rules);
  });

  it('renders a prompt bundle including optional plan and backlog', () => {
    const prompt = renderPromptBundle({
      fileName: 'sample.fc.md',
      contractContent: '# FC: Sample',
      config: DEFAULT_CONFIG,
      planContent: 'contract: sample.fc.md',
      backlogContent: 'epics: []',
    });

    expect(prompt).toContain('Grabby Prompt Bundle: sample.fc.md');
    expect(prompt).toContain('Provider profile: generic');
    expect(prompt).toContain('## Plan');
    expect(prompt).toContain('## Backlog');
    expect(prompt).toContain('## LLM Instructions');
    expect(prompt).toContain('Fibonacci points only: 0.5, 1, 2, 3, 5, 8, 13');
    expect(prompt).toContain('0.5 day, 1 day, 3 days, 5 days, 2 weeks');
    expect(prompt).toContain('display a post-feature ticket');
  });
});

