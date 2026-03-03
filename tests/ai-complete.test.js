const ai = require('../lib/ai-complete.cjs');

describe('ai-complete provider detection', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OLLAMA_HOST;
    delete process.env.OLLAMA_MODEL;
    delete process.env.AI_PROVIDER;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('prefers gemini when configured', () => {
    process.env.GEMINI_API_KEY = 'x';
    process.env.OPENAI_API_KEY = 'y';
    expect(ai.getAvailableProvider()).toBe('gemini');
    expect(ai.isAIAvailable()).toBe(true);
  });

  it('falls back to ollama when local config is provided', () => {
    process.env.OLLAMA_HOST = 'http://localhost:11434';
    expect(ai.getAvailableProvider()).toBe('ollama');
    expect(ai.isAIAvailable()).toBe(true);
  });

  it('returns null when no provider configured', () => {
    expect(ai.getAvailableProvider()).toBeNull();
    expect(ai.isAIAvailable()).toBe(false);
  });

  it('builds a repository assessment prompt with local signals', () => {
    const prompt = ai.buildProjectAssessmentPrompt({
      packageName: 'demo-app',
      stackSummary: 'React + TypeScript application',
      projectTypes: ['react', 'typescript'],
      projectDirs: ['src', 'tests'],
      rootEntries: [{ name: 'src' }, { name: 'package.json' }],
      scripts: ['test', 'build'],
    });

    expect(prompt).toContain('demo-app');
    expect(prompt).toContain('React + TypeScript application');
    expect(prompt).toContain('src, tests');
  });

  it('falls back to a deterministic assessment summary without a provider', async () => {
    const summary = await ai.summarizeProjectAssessment({
      stackSummary: 'Node.js project',
      projectDirs: ['lib', 'tests'],
      hasTests: true,
    });

    expect(summary).toContain('Node.js project');
    expect(summary).toContain('lib, tests');
    expect(summary).toContain('Testing signals are present');
  });

  it('falls back when the provider call fails', async () => {
    const summary = await ai.summarizeProjectAssessment({
      stackSummary: 'React application',
      projectDirs: ['src'],
      hasTests: false,
    }, {
      provider: 'openai',
      callLLMImpl: async () => {
        throw new Error('provider down');
      },
    });

    expect(summary).toContain('React application');
    expect(summary).toContain('Primary working areas include src');
  });
});
