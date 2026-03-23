const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const request = require('supertest');
const yaml = require('yaml');

const dashboardCommands = require('../lib/dashboard/commands.cjs');
const { createDashboardServer, runDashboard } = require('../lib/dashboard/index.cjs');

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

function writeFixtureContract(cwd, status = 'draft', options = {}) {
  const contractsDir = path.join(cwd, 'contracts');
  fs.mkdirSync(contractsDir, { recursive: true });
  const contractPath = path.join(contractsDir, 'dash-101.fc.md');
  const targetedRelease = String(options.targetedRelease || '-');
  const garbageCollect = options.garbageCollect === true ? 'yes' : 'no';

  fs.writeFileSync(contractPath, `# FC: Dashboard Fixture
**ID:** DASH-101 | **Status:** ${status}
**Targeted Release:** ${targetedRelease}
**Garbage Collect:** ${garbageCollect}
**Data Change:** no
**API Change:** no
CONTRACT_TYPE: FEATURE_CONTRACT
ARCH_VERSION: v1
RULESET_VERSION: v1
ENV_VERSION: v1

## Objective
Exercise the local dashboard contract workflow.

## Scope
- Load the dashboard
- Run lifecycle actions

## Non-Goals
- External hosting

## Directories
**Allowed:** \`lib/\`, \`tests/\`, \`docs/\`
**Restricted:** \`node_modules/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | \`lib/dashboard/index.cjs\` | server |
| create | \`tests/dashboard.test.js\` | verification |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery

## Security Considerations
- [ ] Bind to localhost only

## Code Quality
- [ ] Tests pass

## Done When
- [ ] Dashboard runs
- [ ] Tests pass (80%+ coverage)

## Testing
- Unit: \`tests/dashboard.test.js\`

## Context Refs
- ARCH_INDEX_v1
`, 'utf8');

  return contractPath;
}

function writeFixturePlan(cwd, status = 'approved') {
  const planPath = path.join(cwd, 'contracts', 'DASH-101.plan.yaml');
  fs.writeFileSync(planPath, yaml.stringify({
    contract: 'dash-101.fc.md',
    phase: 'plan',
    timestamp: '2026-03-22T18:00:00.000Z',
    files: [
      { action: 'create', path: 'lib/dashboard/index.cjs', reason: 'server' },
      { action: 'create', path: 'tests/dashboard.test.js', reason: 'tests' },
    ],
    status,
    approved_at: status === 'approved' ? '2026-03-22T18:05:00.000Z' : undefined,
    approval_token: status === 'approved' ? 'Approved' : undefined,
  }), 'utf8');
}

function writeFixtureAudit(cwd) {
  const auditPath = path.join(cwd, 'contracts', 'DASH-101.audit.md');
  fs.writeFileSync(auditPath, `# Audit: DASH-101

- Status: complete

## Checks
- Lint: passed
`, 'utf8');
}

function writeFixtureHistory(cwd) {
  const historyDir = path.join(cwd, '.grabby', 'history');
  fs.mkdirSync(historyDir, { recursive: true });
  fs.writeFileSync(path.join(historyDir, 'history-001.yaml'), yaml.stringify({
    version: '1.0',
    entries: [
      {
        id: 'OLD-101',
        title: 'Archived Dashboard Contract',
        objective: 'Preserve a previously completed dashboard contract in history.',
        type: 'FEATURE_CONTRACT',
        files: ['lib/legacy-dashboard.cjs', 'tests/legacy-dashboard.test.js'],
        closedAt: '2026-03-20T18:00:00.000Z',
      },
    ],
  }), 'utf8');
}

function writeFixtureRules(cwd) {
  fs.writeFileSync(path.join(cwd, 'grabby.config.json'), JSON.stringify({
    version: '1.0',
    contracts: { directory: 'contracts', trackingMode: 'tracked' },
    interactive: { enabled: false, defaultNextAction: null },
    features: { menuMode: true, startupArt: true, rulesetWizard: true },
    rulesets: {
      source: {
        repo: 'https://github.com/example/grabby-contracts.git',
        branch: 'main',
        version: '1.1.0',
      },
      active: ['languages/javascript'],
      cacheDir: '.grabby/rulesets/cache',
      lockPath: '.grabby/rulesets/sync.lock.yaml',
    },
  }, null, 2), 'utf8');

  fs.mkdirSync(path.join(cwd, '.grabby', 'rulesets', 'shared'), { recursive: true });
  fs.writeFileSync(path.join(cwd, '.grabby', 'rulesets', 'shared', 'team.ruleset.md'), `# RULESET: team
## Standards
- Team-owned rule
`, 'utf8');

  fs.mkdirSync(path.join(cwd, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'docs', 'RULESET_CORE.md'), `# RULESET: core
## Standards
- Built-in core rule
`, 'utf8');

  const repoCacheDir = path.join(cwd, '.grabby', 'rulesets', 'cache', 'central-repo');
  fs.mkdirSync(path.join(repoCacheDir, 'languages'), { recursive: true });
  fs.mkdirSync(path.join(repoCacheDir, 'policies'), { recursive: true });

  fs.writeFileSync(path.join(repoCacheDir, 'manifest.yaml'), yaml.stringify({
    version: '1.1.0',
    lastUpdated: '2026-03-22T18:00:00.000Z',
    categories: {
      languages: {
        description: 'Language-specific rules',
        rulesets: [
          {
            name: 'javascript',
            version: '1.1.0',
            description: 'JavaScript standards',
            tags: ['js'],
            extends: [],
          },
        ],
      },
      policies: {
        description: 'Policy rules',
        rulesets: [
          {
            name: 'security',
            version: '1.1.0',
            description: 'Security policy',
            tags: ['security'],
            extends: [],
          },
        ],
      },
    },
  }), 'utf8');

  fs.writeFileSync(path.join(repoCacheDir, 'languages', 'javascript.md'), `# RULESET: javascript
## Standards
- Use strict linting
`, 'utf8');
  fs.writeFileSync(path.join(repoCacheDir, 'policies', 'security.md'), `# RULESET: security
## Standards
- Validate input
`, 'utf8');

  fs.writeFileSync(path.join(cwd, '.grabby', 'rulesets', 'sync.lock.yaml'), yaml.stringify({
    version: 1,
    lastSync: '2026-03-22T19:00:00.000Z',
    source: {
      repo: 'https://github.com/example/grabby-contracts.git',
      branch: 'main',
      commit: 'abc123',
      version: '1.1.0',
    },
    active: [
      {
        category: 'languages/javascript',
        name: 'javascript',
        version: '1.1.0',
        hash: 'sha256:deadbeef',
        fetchedAt: '2026-03-22T19:00:00.000Z',
      },
    ],
    checksums: {
      manifest: '',
    },
  }), 'utf8');
}

describe('dashboard', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-dashboard-'));
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      name: 'dashboard-fixture',
      version: '1.0.0',
      scripts: {},
    }, null, 2), 'utf8');
    writeFixtureContract(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('starts and stops cleanly on an ephemeral port', async () => {
    const logger = { log: jest.fn() };
    const dashboard = createDashboardServer({
      cwd: tempDir,
      port: 0,
      autoOpen: false,
      logger,
    });

    const started = await dashboard.start();

    expect(started.port).toBeGreaterThan(0);
    expect(started.url).toContain('127.0.0.1');
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('Grabby UI running at'));

    await dashboard.stop();

    expect(logger.log).toHaveBeenCalledWith('Grabby UI stopped.');
  });

  test('uses configured dashboard port by default and preserves explicit overrides', async () => {
    const configuredPort = await getAvailablePort();
    const overridePort = await getAvailablePort();

    fs.writeFileSync(path.join(tempDir, 'grabby.config.json'), JSON.stringify({
      version: '1.0',
      dashboard: { port: configuredPort },
      contracts: { directory: 'contracts', trackingMode: 'tracked' },
      interactive: { enabled: false, defaultNextAction: null },
      features: { menuMode: true, startupArt: true, rulesetWizard: true },
    }, null, 2), 'utf8');

    const configuredDashboard = createDashboardServer({
      cwd: tempDir,
      autoOpen: false,
    });
    const configuredStarted = await configuredDashboard.start();
    expect(configuredStarted.port).toBe(configuredPort);
    await configuredDashboard.stop();

    const overrideDashboard = createDashboardServer({
      cwd: tempDir,
      port: overridePort,
      autoOpen: false,
    });
    const overrideStarted = await overrideDashboard.start();
    expect(overrideStarted.port).toBe(overridePort);
    expect(overrideStarted.port).not.toBe(configuredPort);
    await overrideDashboard.stop();
  });

  test('serves the dashboard shell and bootstrap payload', async () => {
    writeFixtureHistory(tempDir);
    const app = createDashboardServer({ cwd: tempDir, autoOpen: false }).app;

    const html = await request(app)
      .get('/dashboard')
      .expect(200);

    expect(html.headers['ratelimit-limit']).toBeDefined();
    expect(html.text).toContain('Grabby');
    expect(html.text).toContain('Local Dashboard');
    expect(html.text).toContain('CLI');
    expect(html.text).toContain('History');
    expect(html.text).toContain('Structured');
    expect(html.text).toContain('id="contracts-drawer"');
    expect(html.text).toContain('id="contracts-drawer-toggle"');
    expect(html.text).toContain('data-contracts-view="editor"');
    expect(html.text).toContain('data-contracts-view="summary"');
    expect(html.text).toContain('href="/dashboard"');
    expect(html.text).toContain('href="/contracts"');
    expect(html.text).toContain('href="/rules"');
    expect(html.text).toContain('href="/cli"');
    expect(html.text).toContain('href="/history"');

    // Dashboard overview panels
    expect(html.text).toContain('id="dashboard-status-summary"');
    expect(html.text).toContain('id="dashboard-contract-list"');

    // Rules panels
    expect(html.text).toContain('id="local-rulesets-panel"');
    expect(html.text).toContain('id="repo-rulesets-panel"');
    expect(html.text).toContain('id="sync-info-panel"');
    expect(html.text).toContain('id="rules-editor-panel"');
    expect(html.text).toContain('id="rules-editor-textarea"');
    expect(html.text).toContain('id="rules-diff-panel"');

    await request(app)
      .get('/contracts')
      .expect(200);

    await request(app)
      .get('/rules')
      .expect(200);

    await request(app)
      .get('/cli')
      .expect(200);

    await request(app)
      .get('/history')
      .expect(200);

    await request(app)
      .get('/styles.css')
      .expect(200);

    const bootstrap = await request(app)
      .get('/api/bootstrap')
      .expect(200);

    expect(bootstrap.body.ok).toBe(true);
    expect(bootstrap.body.commands.utilities.commands.some((entry) => entry.name === 'grabby ui')).toBe(true);
    expect(bootstrap.body.workflow.phases.map((phase) => phase.id)).toContain('audit');
    expect(bootstrap.body.contracts[0]).toMatchObject({
      id: 'DASH-101',
      title: 'Dashboard Fixture',
      status: 'draft',
    });
    expect(bootstrap.body.history[0]).toMatchObject({
      id: 'OLD-101',
      title: 'Archived Dashboard Contract',
    });
  });

  test('exposes command search helpers', () => {
    expect(dashboardCommands.getCommandsByCategory('utilities').commands.some((entry) => entry.name === 'grabby ui')).toBe(true);
    expect(dashboardCommands.searchCommands('dashboard').some((entry) => entry.name === 'grabby ui')).toBe(true);
  });

  test('returns contract detail with artifact metadata and timeline', async () => {
    writeFixtureContract(tempDir, 'approved', { targetedRelease: 'v4.2.0', garbageCollect: true });
    writeFixturePlan(tempDir, 'approved');
    writeFixtureAudit(tempDir);

    const app = createDashboardServer({ cwd: tempDir, autoOpen: false }).app;
    const response = await request(app)
      .get('/api/contracts/DASH-101')
      .expect(200);

    expect(response.body.contract.phase.id).toBe('audit');
    expect(response.body.contract.artifacts.planPath).toBe('contracts/DASH-101.plan.yaml');
    expect(response.body.contract.artifacts.auditPath).toBe('contracts/DASH-101.audit.md');
    expect(response.body.contract.metadata).toEqual({
      targetedRelease: 'v4.2.0',
      garbageCollect: true,
    });
    expect(response.body.contract.timeline.map((entry) => entry.id)).toEqual(expect.arrayContaining(['contract', 'plan', 'approve', 'audit']));
  });

  test('updates contract content and status', async () => {
    const app = createDashboardServer({ cwd: tempDir, autoOpen: false }).app;
    const updatedContent = fs.readFileSync(path.join(tempDir, 'contracts', 'dash-101.fc.md'), 'utf8')
      .replace('**Targeted Release:** -', '**Targeted Release:** v4.2.1')
      .replace('**Garbage Collect:** no', '**Garbage Collect:** yes')
      .concat('\n## Notes\n- saved from dashboard\n');

    const response = await request(app)
      .put('/api/contracts/DASH-101')
      .send({
        content: updatedContent,
        status: 'approved',
      })
      .expect(200);

    expect(response.body.contract.status).toBe('approved');
    expect(response.body.contract.metadata).toEqual({
      targetedRelease: 'v4.2.1',
      garbageCollect: true,
    });
    expect(fs.readFileSync(path.join(tempDir, 'contracts', 'dash-101.fc.md'), 'utf8')).toContain('saved from dashboard');
    expect(fs.readFileSync(path.join(tempDir, 'contracts', 'dash-101.fc.md'), 'utf8')).toContain('**Status:** approved');
  });

  test('returns route metadata and validates bad input', async () => {
    const app = createDashboardServer({ cwd: tempDir, autoOpen: false }).app;

    await request(app)
      .get('/api/status')
      .expect(200);

    await request(app)
      .get('/api/workflow')
      .expect(200);

    await request(app)
      .get('/api/commands')
      .expect(200);

    await request(app)
      .get('/api/history')
      .expect(200);

    await request(app)
      .get('/api/contracts/bad_id')
      .expect(400);

    await request(app)
      .post('/api/contracts/DASH-101/actions/not-real')
      .expect(400);
  });

  test('runs validate, plan, and approve lifecycle actions', async () => {
    const app = createDashboardServer({ cwd: tempDir, autoOpen: false }).app;

    const validateResponse = await request(app)
      .post('/api/contracts/DASH-101/actions/validate')
      .expect(200);
    expect(validateResponse.body.logs.join('\n')).toContain('Validation passed');

    const planResponse = await request(app)
      .post('/api/contracts/DASH-101/actions/plan')
      .expect(200);
    expect(planResponse.body.logs.join('\n')).toContain('PHASE 1: PLAN');
    expect(fs.existsSync(path.join(tempDir, 'contracts', 'DASH-101.plan.yaml'))).toBe(true);

    const approveResponse = await request(app)
      .post('/api/contracts/DASH-101/actions/approve')
      .expect(200);
    expect(approveResponse.body.logs.join('\n')).toContain('Contract approved');
    expect(yaml.parse(fs.readFileSync(path.join(tempDir, 'contracts', 'DASH-101.plan.yaml'), 'utf8')).status).toBe('approved');
    expect(fs.readFileSync(path.join(tempDir, 'contracts', 'dash-101.fc.md'), 'utf8')).toContain('**Status:** approved');
  });

  test('runs execute and audit actions when external workflow mode is disabled', async () => {
    writeFixtureContract(tempDir, 'approved');
    writeFixturePlan(tempDir, 'approved');

    const app = createDashboardServer({ cwd: tempDir, autoOpen: false }).app;
    const executeResponse = await request(app)
      .post('/api/contracts/DASH-101/actions/execute')
      .expect(200);

    expect(executeResponse.body.logs.join('\n')).toContain('PHASE 2: EXECUTE');
    expect(yaml.parse(fs.readFileSync(path.join(tempDir, 'contracts', 'DASH-101.plan.yaml'), 'utf8')).status).toBe('executing');

    const auditResponse = await request(app)
      .post('/api/contracts/DASH-101/actions/audit')
      .expect(200);

    expect(auditResponse.body.logs.join('\n')).toContain('POST-EXECUTION AUDIT');
    expect(fs.existsSync(path.join(tempDir, 'contracts', 'DASH-101.audit.md'))).toBe(true);
  });

  test('blocks execute when workflow.externalLlmOnly is enabled', async () => {
    fs.writeFileSync(path.join(tempDir, 'grabby.config.json'), JSON.stringify({
      version: '1.0',
      workflow: { externalLlmOnly: true },
      contracts: { directory: 'contracts', trackingMode: 'tracked' },
      interactive: { enabled: false, defaultNextAction: null },
      features: { menuMode: true, startupArt: true, rulesetWizard: true },
    }, null, 2), 'utf8');
    writeFixturePlan(tempDir, 'approved');

    const app = createDashboardServer({ cwd: tempDir, autoOpen: false }).app;
    const response = await request(app)
      .post('/api/contracts/DASH-101/actions/execute')
      .expect(409);

    expect(response.body.ok).toBe(false);
    expect(response.body.error).toContain('workflow.externalLlmOnly=true');
  });

  test('blocks gc action until garbage collect is enabled', async () => {
    writeFixtureContract(tempDir, 'complete', { garbageCollect: false });
    writeFixturePlan(tempDir, 'complete');

    const app = createDashboardServer({ cwd: tempDir, autoOpen: false }).app;
    const response = await request(app)
      .post('/api/contracts/DASH-101/actions/gc')
      .expect(409);

    expect(response.body.ok).toBe(false);
    expect(response.body.error).toContain('Garbage Collect must be enabled');
  });

  test('runs gc action to archive a complete contract', async () => {
    writeFixtureContract(tempDir, 'complete', { garbageCollect: true, targetedRelease: 'v4.2.1' });
    writeFixturePlan(tempDir, 'complete');
    writeFixtureHistory(tempDir);

    const app = createDashboardServer({ cwd: tempDir, autoOpen: false }).app;

    // Verify contract exists before gc
    const beforeResponse = await request(app)
      .get('/api/contracts/DASH-101')
      .expect(200);
    expect(beforeResponse.body.contract.status).toBe('complete');

    // Run gc action
    const gcResponse = await request(app)
      .post('/api/contracts/DASH-101/actions/gc')
      .expect(200);

    expect(gcResponse.body.ok).toBe(true);
    expect(gcResponse.body.archived).toBe(true);
    expect(gcResponse.body.archivePath).toContain('.grabby/history');
    expect(gcResponse.body.logs.join('\n')).toContain('Archived DASH-101');

    // Verify contract is no longer in active contracts
    const afterResponse = await request(app)
      .get('/api/contracts/DASH-101')
      .expect(404);
    expect(afterResponse.body.error).toBe('Contract not found');

    // Verify contract appears in history
    const historyResponse = await request(app)
      .get('/api/history')
      .expect(200);
    const historyEntry = historyResponse.body.history.find((entry) => entry.id === 'DASH-101');
    expect(historyEntry).toBeDefined();
    expect(historyEntry.targetedRelease).toBe('v4.2.1');
    expect(historyEntry.garbageCollect).toBe(true);
  });

  test('exposes rulesets status in bootstrap and dedicated endpoint', async () => {
    const app = createDashboardServer({ cwd: tempDir, autoOpen: false }).app;

    // Check bootstrap includes rulesets
    const bootstrapResponse = await request(app)
      .get('/api/bootstrap')
      .expect(200);

    expect(bootstrapResponse.body.rulesets).toBeDefined();
    expect(bootstrapResponse.body.rulesets.configured).toBe(false);
    expect(Array.isArray(bootstrapResponse.body.rulesets.available)).toBe(true);
    expect(Array.isArray(bootstrapResponse.body.rulesets.active)).toBe(true);

    // Check dedicated rulesets endpoint
    const rulesetsResponse = await request(app)
      .get('/api/rulesets')
      .expect(200);

    expect(rulesetsResponse.body.ok).toBe(true);
    expect(rulesetsResponse.body.rulesets).toBeDefined();
    expect(rulesetsResponse.body.rulesets.configured).toBe(false);
  });

  test('splits local and repo rules and exposes readable content', async () => {
    writeFixtureRules(tempDir);
    const app = createDashboardServer({ cwd: tempDir, autoOpen: false }).app;

    const bootstrapResponse = await request(app)
      .get('/api/bootstrap')
      .expect(200);

    expect(bootstrapResponse.body.rulesets.configured).toBe(true);
    expect(bootstrapResponse.body.rulesets.local.map((entry) => entry.name)).toEqual(expect.arrayContaining(['team', 'core']));
    expect(bootstrapResponse.body.rulesets.repo.map((entry) => entry.ref)).toEqual(expect.arrayContaining(['languages/javascript', 'policies/security']));
    expect(bootstrapResponse.body.rulesets.active.map((entry) => entry.ref)).toEqual(['languages/javascript']);

    const localReadResponse = await request(app)
      .get('/api/rulesets/read')
      .query({ scope: 'local', file: path.join('.grabby', 'rulesets', 'shared', 'team.ruleset.md') })
      .expect(200);

    expect(localReadResponse.body.rule.scope).toBe('local');
    expect(localReadResponse.body.rule.content).toContain('Team-owned rule');

    const repoReadResponse = await request(app)
      .get('/api/rulesets/read')
      .query({ scope: 'repo', ref: 'languages/javascript' })
      .expect(200);

    expect(repoReadResponse.body.rule.scope).toBe('repo');
    expect(repoReadResponse.body.rule.active).toBe(true);
    expect(repoReadResponse.body.rule.content).toContain('Use strict linting');
  });

  test('handles API fallthrough, open-browser startup, empty stop, and runDashboard wiring', async () => {
    const app = createDashboardServer({ cwd: tempDir, autoOpen: false }).app;
    const apiFallthrough = await request(app)
      .get('/api/nope')
      .expect(404);

    expect(apiFallthrough.body).toEqual({ ok: false, error: 'Route not found' });

    await createDashboardServer({ cwd: tempDir, autoOpen: false }).stop();

    // Test server lifecycle: start and stop
    const first = createDashboardServer({ cwd: tempDir, port: 0, autoOpen: false });
    const started = await first.start();
    expect(started.port).toBeGreaterThan(0);
    expect(started.host).toBe('127.0.0.1');
    await first.stop();

    const onceSpy = jest.spyOn(process, 'once').mockImplementation(() => process);
    const dashboard = await runDashboard({ cwd: tempDir, port: 0, autoOpen: false, logger: { log: jest.fn() } });
    expect(onceSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    expect(onceSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    await dashboard.stop();
    onceSpy.mockRestore();

    jest.resetModules();
    const exec = jest.fn((command, options, callback) => {
      if (typeof callback === 'function') {
        callback();
      }
    });
    jest.doMock('child_process', () => ({ exec }));
    const autoOpenModule = require('../lib/dashboard/index.cjs');
    const autoOpenServer = autoOpenModule.createDashboardServer({
      cwd: tempDir,
      port: 0,
      autoOpen: true,
      logger: { log: jest.fn() },
    });
    const autoOpenStarted = await autoOpenServer.start();
    expect(exec).toHaveBeenCalled();
    await autoOpenServer.stop();
    jest.dontMock('child_process');
    jest.resetModules();
  });
});
