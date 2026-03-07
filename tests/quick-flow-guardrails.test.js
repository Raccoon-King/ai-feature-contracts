const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { createWorkflowRuntime } = require('../lib/interactive-workflows.cjs');

const PKG_ROOT = path.join(__dirname, '..');

function colors() {
  return {
    error: (v) => v,
    success: (v) => v,
    warn: (v) => v,
    info: (v) => v,
    dim: (v) => v,
    bold: (v) => v,
    heading: (v) => v,
    agent: (v) => v,
  };
}

function mockAnswers(answers) {
  const remaining = [...answers];
  return jest.spyOn(readline, 'createInterface').mockReturnValue({
    question: (_prompt, cb) => cb(remaining.shift() || ''),
    close: () => {},
  });
}

describe('quick flow guardrails', () => {
  test('quick spec escalates when complexity threshold is exceeded', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-quick-'));
    fs.writeFileSync(path.join(tmp, 'grabby.config.json'), JSON.stringify({
      bmadFeatures: { adaptiveHelp: false, quickFlowGuardrails: true, riskTieredVerification: false },
      contracts: { directory: 'contracts', trackingMode: 'tracked' },
    }, null, 2), 'utf8');

    const runtime = createWorkflowRuntime({
      c: colors(),
      outputMode: 'console',
      pkgRoot: PKG_ROOT,
      cwd: tmp,
      commandHandlers: {
        resolveContract: () => null,
        backlog: jest.fn(),
        plan: jest.fn(),
      },
    });

    const spy = mockAnswers([
      'Add cross-service auth migration',
      'src/a.ts,src/b.ts,src/c.ts',
      'yes',
    ]);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const rl = runtime.createPromptInterface();
    const quickAgent = runtime.loadAgent('quick');
    await runtime.runQuickSpecWorkflow(rl, quickAgent);
    rl.close();

    const output = logSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('Quick-flow guardrail');
    expect(output).toContain('grabby task "<request>"');

    spy.mockRestore();
    logSpy.mockRestore();
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

