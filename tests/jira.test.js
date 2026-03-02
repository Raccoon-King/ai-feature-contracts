const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  testConnection,
  createIssueFromContract,
  listLinks,
  importIssue,
  importIssuesByJql,
  contractExistsForIssue,
  syncContract,
} = require('../lib/jira.cjs');

const config = {
  jira: {
    enabled: true,
    host: 'https://example.atlassian.net',
    email: 'user@example.com',
    apiToken: '${JIRA_API_TOKEN}',
    apiVersion: '3',
    project: 'PROJ',
    defaults: { issueType: 'Story', labels: ['grabby'] },
    customFields: { contractId: 'customfield_10001' },
    sync: { statusMapping: { approved: 'In Progress' } },
  },
};

describe('jira', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jira-'));
    fs.mkdirSync(path.join(dir, 'contracts'));
    fs.writeFileSync(path.join(dir, 'contracts', 'demo.fc.md'), '# FC: Demo\n**ID:** FC-1 | **Status:** approved\n## Objective\nBuild\n## Scope\n- A\n');
    process.env.JIRA_API_TOKEN = 'token';
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('testConnection calls Jira API', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, text: async () => JSON.stringify({ displayName: 'Dev' }) }));
    const me = await testConnection(config);
    expect(me.displayName).toBe('Dev');
  });

  test('createIssueFromContract links issue and updates contract metadata', async () => {
    global.fetch = jest.fn(async (_url, req) => ({ ok: true, text: async () => JSON.stringify({ key: 'PROJ-1', body: req?.body }) }));
    const out = await createIssueFromContract(config, path.join(dir, 'contracts'), 'demo', dir);
    expect(out.issueKey).toBe('PROJ-1');
    const links = listLinks(dir);
    expect(links['FC-1'].issueKey).toBe('PROJ-1');
    const content = fs.readFileSync(path.join(dir, 'contracts', 'demo.fc.md'), 'utf8');
    expect(content).toContain('## Integrations');
    expect(content).toContain('Jira: PROJ-1');
  });

  test('syncContract updates issue and attempts transition', async () => {
    const calls = [];
    global.fetch = jest.fn(async (url, req = {}) => {
      calls.push({ url, method: req.method || 'GET' });
      if (url.includes('/transitions') && (req.method || 'GET') === 'GET') {
        return { ok: true, text: async () => JSON.stringify({ transitions: [{ id: '11', name: 'In Progress' }] }) };
      }
      return { ok: true, text: async () => JSON.stringify({ key: 'PROJ-1' }) };
    });

    await createIssueFromContract(config, path.join(dir, 'contracts'), 'demo', dir);
    const out = await syncContract(config, path.join(dir, 'contracts'), 'demo', {}, dir);
    expect(out.transitioned).toBe(true);
    expect(calls.some(c => c.url.includes('/issue/PROJ-1/transitions'))).toBe(true);
  });

  test('importIssue is idempotent', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, text: async () => JSON.stringify({ key: 'PROJ-10', fields: { summary: 'From Jira', description: 'Body' } }) }));
    const first = await importIssue(config, path.join(dir, 'contracts'), 'PROJ-10');
    const second = await importIssue(config, path.join(dir, 'contracts'), 'PROJ-10');
    expect(first.skipped).toBe(false);
    expect(second.skipped).toBe(true);
    expect(contractExistsForIssue(path.join(dir, 'contracts'), 'PROJ-10')).toBe(true);
  });

  test('importIssuesByJql imports multiple issues', async () => {
    global.fetch = jest.fn(async (url) => {
      if (url.includes('/search')) {
        return { ok: true, text: async () => JSON.stringify({ issues: [{ key: 'PROJ-20' }, { key: 'PROJ-21' }] }) };
      }
      return { ok: true, text: async () => JSON.stringify({ key: url.includes('PROJ-20') ? 'PROJ-20' : 'PROJ-21', fields: { summary: 'Issue', description: 'Desc' } }) };
    });

    const result = await importIssuesByJql(config, path.join(dir, 'contracts'), 'project=PROJ');
    expect(result).toHaveLength(2);
    expect(fs.readdirSync(path.join(dir, 'contracts')).some(f => f.endsWith('.fc.md'))).toBe(true);
  });

  test('uses configured apiVersion for server/data-center compatibility', async () => {
    const serverConfig = { ...config, jira: { ...config.jira, apiVersion: '2' } };
    const seen = [];
    global.fetch = jest.fn(async (url) => {
      seen.push(url);
      return { ok: true, text: async () => JSON.stringify({ displayName: 'Dev' }) };
    });
    await testConnection(serverConfig);
    expect(seen[0]).toContain('/rest/api/2/myself');
  });
});
