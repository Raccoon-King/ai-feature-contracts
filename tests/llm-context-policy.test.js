const { getLlmContextPolicy } = require('../lib/commands.cjs');
const { defaultConfig, validateConfig } = require('../lib/config.cjs');

describe('llm context policy', () => {
  test('returns lean defaults for lean mode', () => {
    const policy = getLlmContextPolicy({ llmContext: { mode: 'lean' } });
    expect(policy).toEqual({
      mode: 'lean',
      planTokenBudget: 700,
      executeTokenBudget: 1000,
      explicitOnly: true,
      maxSections: 2,
      useDefaults: false,
    });
  });

  test('applies explicit overrides when valid', () => {
    const policy = getLlmContextPolicy({
      llmContext: {
        mode: 'standard',
        planTokenBudget: 900,
        executeTokenBudget: 1300,
        explicitOnly: true,
        maxSections: 1,
        useDefaults: false,
      },
    });
    expect(policy).toEqual({
      mode: 'standard',
      planTokenBudget: 900,
      executeTokenBudget: 1300,
      explicitOnly: true,
      maxSections: 1,
      useDefaults: false,
    });
  });

  test('validateConfig rejects invalid llmContext settings', () => {
    const cfg = defaultConfig();
    cfg.llmContext.mode = 'wide';
    cfg.llmContext.planTokenBudget = 0;
    cfg.llmContext.explicitOnly = 'yes';
    const result = validateConfig(cfg);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'llmContext.mode must be "standard" or "lean"',
      'llmContext.planTokenBudget must be a positive integer',
      'llmContext.explicitOnly must be true or false',
    ]));
  });
});

