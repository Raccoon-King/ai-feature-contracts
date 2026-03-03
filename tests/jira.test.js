const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  testConnection,
  createIssueFromContract,
  listLinks,
  linkIssue,
  unlinkIssue,
  importIssue,
  importIssuesByJql,
  contractExistsForIssue,
  syncContract,
  transitionIssueToStatus,
  resolveContractPath,
  parseContract,
  upsertIntegrationMetadata,
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


  test('createIssueFromContract supports ticket-key IDs in contract body', async () => {
    fs.writeFileSync(path.join(dir, 'contracts', 'ticket.fc.md'), '# FC: Demo Ticket\n**ID:** tt-77 | **Status:** approved\n## Objective\nBuild\n## Scope\n- A\n');
    global.fetch = jest.fn(async (_url, req) => ({ ok: true, text: async () => JSON.stringify({ key: 'PROJ-77', body: req?.body }) }));
    const out = await createIssueFromContract(config, path.join(dir, 'contracts'), 'ticket', dir);
    expect(out.contractId).toBe('TT-77');
    const links = listLinks(dir);
    expect(links['TT-77'].issueKey).toBe('PROJ-77');
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

  test('testConnection fails when Jira is disabled or credentials are missing', async () => {
    await expect(testConnection({ jira: { enabled: false } })).rejects.toThrow('Jira is not enabled in config');

    const missingCredsConfig = {
      jira: {
        enabled: true,
        host: '',
        email: '',
        apiToken: '${JIRA_API_TOKEN}',
      },
    };
    process.env.JIRA_API_TOKEN = '';
    await expect(testConnection(missingCredsConfig)).rejects.toThrow('Missing Jira credentials');
  });

  test('jira request surfaces API errors and raw response bodies', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => JSON.stringify({ errorMessages: ['bad jira request'] }),
    }));
    await expect(testConnection(config)).rejects.toThrow('Jira API 400: bad jira request');

    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      text: async () => 'totally broken',
    }));
    await expect(testConnection(config)).rejects.toThrow('Jira API 500: totally broken');
  });

  test('resolveContractPath, parseContract, and integration metadata helpers cover edge cases', () => {
    fs.writeFileSync(path.join(dir, 'contracts', 'slug-name.fc.md'), '# FC: Slug Name\n**ID:** tt-7 | **Status:** draft\n## Objective\nGoal\n## Scope\n- Work\n', 'utf8');

    expect(resolveContractPath(path.join(dir, 'contracts'), 'demo.fc.md')).toBe(path.join(dir, 'contracts', 'demo.fc.md'));
    expect(resolveContractPath(path.join(dir, 'contracts'), 'slug-name')).toBe(path.join(dir, 'contracts', 'slug-name.fc.md'));
    expect(resolveContractPath(path.join(dir, 'contracts'), 'TT-7')).toBe(path.join(dir, 'contracts', 'slug-name.fc.md'));
    expect(resolveContractPath(path.join(dir, 'contracts'), 'missing')).toBeNull();

    const parsed = parseContract(fs.readFileSync(path.join(dir, 'contracts', 'slug-name.fc.md'), 'utf8'), 'slug-name.fc.md');
    expect(parsed).toMatchObject({
      title: 'Slug Name',
      id: 'TT-7',
      status: 'draft',
      objective: 'Goal',
    });

    upsertIntegrationMetadata(path.join(dir, 'contracts', 'slug-name.fc.md'), 'PROJ-42');
    upsertIntegrationMetadata(path.join(dir, 'contracts', 'slug-name.fc.md'), 'PROJ-42');
    const content = fs.readFileSync(path.join(dir, 'contracts', 'slug-name.fc.md'), 'utf8');
    expect(content.match(/Jira: PROJ-42/g)).toHaveLength(1);
  });

  test('linkIssue and unlinkIssue mutate the local link registry', () => {
    const linked = linkIssue('FC-1', 'PROJ-1', dir);
    expect(linked.issueKey).toBe('PROJ-1');
    expect(listLinks(dir)['FC-1'].issueKey).toBe('PROJ-1');

    unlinkIssue('FC-1', dir);
    expect(listLinks(dir)['FC-1']).toBeUndefined();
  });

  test('transitionIssueToStatus reports when no matching transition exists', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ transitions: [{ id: '1', name: 'Done' }] }),
    }));

    const result = await transitionIssueToStatus(config, 'PROJ-1', 'In Progress');
    expect(result).toEqual({ transitioned: false, reason: 'No transition found for status: In Progress' });
  });

  test('syncContract supports dryRun and requires existing links', async () => {
    const dryRun = await syncContract(config, path.join(dir, 'contracts'), 'demo', { dryRun: true }, dir).catch((error) => error);
    expect(dryRun.message).toContain('No Jira link found');

    linkIssue('FC-1', 'PROJ-9', dir);
    const result = await syncContract(config, path.join(dir, 'contracts'), 'demo', { dryRun: true }, dir);
    expect(result).toEqual({
      contractId: 'FC-1',
      issueKey: 'PROJ-9',
      jiraStatus: 'In Progress',
      dryRun: true,
    });
  });

  test('importIssue can overwrite idempotency and importIssuesByJql respects maxResults', async () => {
    const calls = [];
    global.fetch = jest.fn(async (url, req = {}) => {
      calls.push({ url, body: req.body });
      if (url.includes('/search')) {
        return { ok: true, text: async () => JSON.stringify({ issues: [{ key: 'PROJ-31' }] }) };
      }
      return { ok: true, text: async () => JSON.stringify({ key: 'PROJ-31', fields: { summary: 'From Jira', description: 'Body' } }) };
    });

    const first = await importIssue(config, path.join(dir, 'contracts'), 'PROJ-31', { idempotent: false });
    const second = await importIssuesByJql(config, path.join(dir, 'contracts'), 'project=PROJ', { maxResults: 7, idempotent: false });

    expect(first.skipped).toBe(false);
    expect(second).toHaveLength(1);
    expect(calls.find((call) => call.url.includes('/search')).body).toContain('"maxResults":7');
  });
});
