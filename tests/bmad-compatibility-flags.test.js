const { getBmadFeatureFlags } = require('../lib/commands.cjs');
const { defaultConfig, validateConfig } = require('../lib/config.cjs');

describe('bmad compatibility flags', () => {
  test('defaults bmad feature flags to disabled', () => {
    const cfg = defaultConfig();
    expect(cfg.bmadFeatures).toEqual({
      adaptiveHelp: false,
      quickFlowGuardrails: false,
      riskTieredVerification: false,
    });
  });

  test('reads enabled bmad flags from config', () => {
    const flags = getBmadFeatureFlags({
      bmadFeatures: {
        adaptiveHelp: true,
        quickFlowGuardrails: true,
        riskTieredVerification: false,
      },
    });
    expect(flags).toEqual({
      adaptiveHelp: true,
      quickFlowGuardrails: true,
      riskTieredVerification: false,
    });
  });

  test('validates bmad feature flag types', () => {
    const cfg = defaultConfig();
    cfg.bmadFeatures.adaptiveHelp = 'sometimes';
    const result = validateConfig(cfg);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('bmadFeatures.adaptiveHelp must be true or false');
  });
});

