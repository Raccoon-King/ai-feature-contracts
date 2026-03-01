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
});
