const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  parseWorkItemId,
  extractContractId,
  ensureIdMatchesFilename,
  slugifyTitle,
} = require('../lib/id-utils.cjs');
const { createProjectContext, createCommandHandlers } = require('../lib/commands.cjs');

const PKG_ROOT = path.join(__dirname, '..');

describe('id-utils', () => {
  test('parses and normalizes ticket IDs', () => {
    expect(parseWorkItemId('tt-123')).toBe('TT-123');
    expect(parseWorkItemId('JIRA-42')).toBe('JIRA-42');
    expect(parseWorkItemId('grab-intake-002')).toBe('GRAB-INTAKE-002');
    expect(parseWorkItemId('nope')).toBeNull();
  });

  test('extracts ID from content then filename fallback', () => {
    expect(extractContractId('**ID:** tt-9')).toBe('TT-9');
    expect(extractContractId('# FC: demo', 'jira-100.fc.md')).toBe('JIRA-100');
  });

  test('detects filename/content mismatch', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-id-'));
    const file = path.join(dir, 'TT-124.fc.md');
    fs.writeFileSync(file, '# FC: Test\n**ID:** TT-123 | **Status:** draft\n');
    expect(() => ensureIdMatchesFilename(file)).toThrow(/mismatch/i);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('slugifies title with max eight words', () => {
    expect(slugifyTitle('Ship Fancy Login Flow For Enterprise Tenants In EU Region')).toBe('ship-fancy-login-flow-for-enterprise-tenants-in');
  });
});

describe('start command branch naming', () => {
  test('formats branch as <type>/<ID>-<slug>', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-start-'));
    const contractsDir = path.join(dir, 'contracts');
    fs.mkdirSync(contractsDir, { recursive: true });
    fs.writeFileSync(
      path.join(contractsDir, 'TT-123.fc.md'),
      '# FC: Add Billing Webhook Retry Strategy\n**ID:** tt-123 | **Status:** draft\n\n## Done When\n- [ ] done\n'
    );

    const calls = [];
    const logger = { log: () => {} };
    const handlers = createCommandHandlers({
      context: createProjectContext({ cwd: dir, pkgRoot: PKG_ROOT }),
      logger,
      exit: () => {},
      execSyncImpl: (cmd) => {
        calls.push(cmd);
        const outputs = {
          'git rev-parse --is-inside-work-tree': 'true',
          'git rev-parse --abbrev-ref HEAD': 'main',
          'git rev-parse --abbrev-ref --symbolic-full-name @{u}': 'origin/main',
          'git remote get-url origin': 'git@gitlab.com:team/repo.git',
          'git status --porcelain=v1 --branch': '## main...origin/main',
          'git rev-list --left-right --count origin/main...HEAD': '0 0',
          'git stash list': '',
          'git show-ref --verify refs/heads/fix/TT-123-add-billing-webhook-retry-strategy': '',
          'git checkout -b fix/TT-123-add-billing-webhook-retry-strategy': '',
          'git ls-remote --heads origin fix/TT-123-add-billing-webhook-retry-strategy': '',
        };
        if (!(cmd in outputs)) throw new Error(`unexpected ${cmd}`);
        return outputs[cmd];
      },
    });

    handlers.start('TT-123.fc.md', { type: 'fix' });
    expect(calls).toContain('git checkout -b fix/TT-123-add-billing-webhook-retry-strategy');

    const updated = fs.readFileSync(path.join(contractsDir, 'TT-123.fc.md'), 'utf8');
    expect(updated).toContain('**Branch:** fix/TT-123-add-billing-webhook-retry-strategy');

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
