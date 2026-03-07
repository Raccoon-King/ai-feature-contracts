const fs = require('fs');
const os = require('os');
const path = require('path');
const { createShellHandlers } = require('../lib/interactive-shell.cjs');
const { getSuggestedNextActions } = require('../lib/commands.cjs');

function formatter() {
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

describe('adaptive help routing', () => {
  test('builds expected suggestions for empty contract state', () => {
    const actions = getSuggestedNextActions({
      contractStats: { total: 0, draft: 0, approved: 0, executing: 0, complete: 0 },
    });
    expect(actions.map((entry) => entry.command)).toEqual([
      'grabby ticket "<request>"',
      'grabby task "<request>"',
      'grabby orchestrate "<request>"',
    ]);
  });

  test('help output includes Suggested Now and Also Available sections', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-help-'));
    const previousCwd = process.cwd();
    process.chdir(tmp);
    fs.mkdirSync(path.join(tmp, 'contracts'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'contracts', 'BMAD-1.fc.md'), '# FC: Demo\n**Status:** draft\n', 'utf8');
    fs.writeFileSync(path.join(tmp, 'grabby.config.json'), JSON.stringify({
      bmadFeatures: { adaptiveHelp: true, quickFlowGuardrails: false, riskTieredVerification: false },
    }, null, 2), 'utf8');

    const lines = [];
    const handlers = createShellHandlers({
      c: formatter(),
      logger: { log: (...values) => lines.push(values.join(' ')) },
      runtime: { resolveContract: (file) => file },
    });
    handlers.help();

    const output = lines.join('\n');
    expect(output).toContain('Suggested Now:');
    expect(output).toContain('Also Available:');
    expect(output).toContain('grabby validate <file>');

    process.chdir(previousCwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

