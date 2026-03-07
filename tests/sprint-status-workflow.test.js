const fs = require('fs');
const os = require('os');
const path = require('path');
const { createShellHandlers } = require('../lib/interactive-shell.cjs');

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

describe('sprint status workflow', () => {
  test('workflow output includes readiness summary', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-sprint-'));
    const previousCwd = process.cwd();
    process.chdir(tmp);
    fs.mkdirSync(path.join(tmp, 'contracts'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'contracts', 'A-1.fc.md'), '# FC: A\n**Status:** approved\n', 'utf8');
    fs.writeFileSync(path.join(tmp, 'contracts', 'A-2.fc.md'), '# FC: B\n**Status:** draft\n', 'utf8');

    const lines = [];
    const handlers = createShellHandlers({
      c: formatter(),
      argv: ['node', 'cli', 'workflow', 'sprint-status'],
      logger: { log: (...values) => lines.push(values.join(' ')) },
      runtime: {
        listWorkflowMetadata: () => [],
        getWorkflowDetails: () => ({
          name: 'sprint-status',
          description: 'status',
          agent: 'strategist',
          steps: [{ goal: 'summary' }],
        }),
      },
    });

    await handlers.workflow();

    const output = lines.join('\n');
    expect(output).toContain('Status Summary:');
    expect(output).toContain('Readiness: CONCERNS');

    process.chdir(previousCwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

