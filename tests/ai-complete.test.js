const ai = require('../lib/ai-complete.cjs');
const https = require('https');
const { EventEmitter } = require('events');

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

  it('calls the OpenAI provider and parses suggestion lists', async () => {
    process.env.OPENAI_API_KEY = 'openai-key';
    const requestSpy = jest.spyOn(https, 'request').mockImplementation((options, callback) => {
      const res = new EventEmitter();
      callback(res);
      process.nextTick(() => {
        res.emit('data', JSON.stringify({
          choices: [{ message: { content: '- add unit tests\n- update docs' } }],
        }));
        res.emit('end');
      });
      return {
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
      };
    });

    const scope = await ai.suggestScope('add test coverage', {
      projectTypes: ['node'],
      projectDirs: ['lib', 'tests'],
    });

    expect(scope).toEqual(['add unit tests', 'update docs']);
    expect(requestSpy).toHaveBeenCalled();
    requestSpy.mockRestore();
  });

  it('parses file suggestions through the provider response', async () => {
    process.env.OPENAI_API_KEY = 'openai-key';
    const requestSpy = jest.spyOn(https, 'request').mockImplementation((options, callback) => {
      const res = new EventEmitter();
      callback(res);
      process.nextTick(() => {
        res.emit('data', JSON.stringify({
          choices: [{
            message: {
              content: 'create|tests/new.test.js|Add coverage\nmodify|lib/core.cjs|Wire command',
            },
          }],
        }));
        res.emit('end');
      });
      return {
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
      };
    });

    const files = await ai.suggestFiles('add test coverage', {
      projectTypes: ['node'],
      projectDirs: ['lib', 'tests'],
    });

    expect(files).toEqual([
      { action: 'create', path: 'tests/new.test.js', reason: 'Add coverage' },
      { action: 'modify', path: 'lib/core.cjs', reason: 'Wire command' },
    ]);
    requestSpy.mockRestore();
  });

  it('parses checkbox suggestions and formats them for display', async () => {
    process.env.OPENAI_API_KEY = 'openai-key';
    const requestSpy = jest.spyOn(https, 'request').mockImplementation((options, callback) => {
      const res = new EventEmitter();
      callback(res);
      process.nextTick(() => {
        res.emit('data', JSON.stringify({
          choices: [{
            message: {
              content: '- [ ] tests pass\n- [ ] audit passes',
            },
          }],
        }));
        res.emit('end');
      });
      return {
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
      };
    });

    const doneWhen = await ai.suggestDoneWhen('ship feature', ['add tests']);
    const formatted = ai.formatSuggestions({
      scope: ['add tests'],
      files: [{ action: 'create', path: 'tests/x.test.js', reason: 'Coverage' }],
      doneWhen,
      security: ['validate inputs'],
    });

    expect(doneWhen).toEqual(['tests pass', 'audit passes']);
    expect(formatted).toContain('## Suggested Scope');
    expect(formatted).toContain('| create | `tests/x.test.js` | Coverage |');
    expect(formatted).toContain('- [ ] validate inputs');
    requestSpy.mockRestore();
  });

  it('parses Anthropic responses via callLLM', async () => {
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';
    const requestSpy = jest.spyOn(https, 'request').mockImplementation((options, callback) => {
      const res = new EventEmitter();
      callback(res);
      process.nextTick(() => {
        res.emit('data', JSON.stringify({ content: [{ text: 'anthropic response' }] }));
        res.emit('end');
      });
      return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
    });

    const response = await ai.callLLM('hello', { provider: 'anthropic' });

    expect(response).toBe('anthropic response');
    requestSpy.mockRestore();
  });

  it('parses Gemini responses via callLLM', async () => {
    process.env.GEMINI_API_KEY = 'gemini-key';
    const requestSpy = jest.spyOn(https, 'request').mockImplementation((options, callback) => {
      const res = new EventEmitter();
      callback(res);
      process.nextTick(() => {
        res.emit('data', JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'gemini response' }] } }],
        }));
        res.emit('end');
      });
      return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
    });

    const response = await ai.callLLM('hello', { provider: 'gemini' });

    expect(response).toBe('gemini response');
    requestSpy.mockRestore();
  });

  it('parses Ollama responses via callLLM', async () => {
    process.env.AI_PROVIDER = 'ollama';
    process.env.OLLAMA_HOST = 'http://localhost:11434';
    const http = require('http');
    const requestSpy = jest.spyOn(http, 'request').mockImplementation((options, callback) => {
      const res = new EventEmitter();
      callback(res);
      process.nextTick(() => {
        res.emit('data', JSON.stringify({ response: 'ollama response' }));
        res.emit('end');
      });
      return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
    });

    const response = await ai.callLLM('hello', { provider: 'ollama' });

    expect(response).toBe('ollama response');
    requestSpy.mockRestore();
  });

  it('rejects malformed provider responses', async () => {
    process.env.OPENAI_API_KEY = 'openai-key';
    const requestSpy = jest.spyOn(https, 'request').mockImplementation((options, callback) => {
      const res = new EventEmitter();
      callback(res);
      process.nextTick(() => {
        res.emit('data', 'not json');
        res.emit('end');
      });
      return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
    });

    await expect(ai.callLLM('hello', { provider: 'openai' })).rejects.toThrow('Failed to parse response');
    requestSpy.mockRestore();
  });
});
