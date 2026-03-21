/**
 * Rules endpoint tests
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { createApp } = require('../../lib/api-server-v2.cjs');

function createRulesTestRoot(options = {}) {
  const {
    activeRulesets = ['languages/typescript'],
    includeLock = true,
    sourceRepo,
  } = options;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-rules-'));
  const missingRepoPath = path.join(dir, 'missing-central-rules.git').replace(/\\/g, '/');
  const repo = sourceRepo === undefined ? `file:///${missingRepoPath}` : sourceRepo;

  fs.mkdirSync(path.join(dir, '.grabby', 'rulesets', 'cache', 'central-repo'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.grabby', 'rulesets', 'cache', 'languages'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.grabby', 'rulesets'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'docs', 'openapi.yaml'),
    'openapi: 3.0.0\ninfo:\n  title: Temp Grabby API\n  version: 1.0.0\npaths: {}\n',
    'utf8',
  );

  fs.writeFileSync(
    path.join(dir, 'grabby.config.json'),
    JSON.stringify({
      version: '1.0',
      rulesets: {
        source: {
          repo,
          branch: 'main',
          version: '1.0.0',
        },
        active: activeRulesets,
        cacheDir: '.grabby/rulesets/cache',
        lockPath: '.grabby/rulesets/sync.lock.yaml',
        sync: {
          interval: '24h',
        },
      },
    }, null, 2),
    'utf8',
  );

  fs.writeFileSync(
    path.join(dir, '.grabby', 'rulesets', 'cache', 'central-repo', 'manifest.yaml'),
    [
      'version: 1.0.0',
      'lastUpdated: 2026-03-21T00:00:00Z',
      'categories:',
      '  languages:',
      '    description: Language rules',
      '    rulesets:',
      '      - name: typescript',
      '        version: 1.0.0',
      '        description: TypeScript rules',
      '',
    ].join('\n'),
    'utf8',
  );

  fs.writeFileSync(
    path.join(dir, '.grabby', 'rulesets', 'cache', 'languages', 'typescript.md'),
    '# TypeScript rules\n\nUse strict typing.\n',
    'utf8',
  );

  if (includeLock) {
    fs.writeFileSync(
      path.join(dir, '.grabby', 'rulesets', 'sync.lock.yaml'),
      [
        'version: 1',
        'lastSync: 2026-03-21T00:00:00Z',
        'source:',
        `  repo: ${repo || '""'}`,
        '  branch: main',
        '  commit: abc123def456',
        '  version: 1.0.0',
        'active:',
        '  - category: languages/typescript',
        '    version: 1.0.0',
        '    hash: sha256:abc123def456',
        '    fetchedAt: 2026-03-21T00:00:00Z',
        'checksums:',
        '  manifest: ""',
        '',
      ].join('\n'),
      'utf8',
    );
  }

  return dir;
}

describe('Rules Endpoints', () => {
  let app;
  let tempDir;

  beforeEach(() => {
    tempDir = createRulesTestRoot();
    app = createApp({
      cwd: tempDir,
      version: '3.7.0-test',
      logLevel: 'error',
      rateLimit: 1000,
    });
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('GET /v1/rules', () => {
    it('should return list of active rulesets', async () => {
      const res = await request(app)
        .get('/v1/rules')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('rulesets');
      expect(res.body.data).toHaveProperty('total', 1);
      expect(Array.isArray(res.body.data.rulesets)).toBe(true);
      expect(res.body.data.rulesets).toHaveLength(1);
    });

    it('should include ruleset metadata', async () => {
      const res = await request(app)
        .get('/v1/rules')
        .expect(200);

      const ruleset = res.body.data.rulesets[0];
      expect(ruleset).toHaveProperty('path', 'languages/typescript');
      expect(ruleset).toHaveProperty('category', 'languages');
      expect(ruleset).toHaveProperty('name', 'typescript');
      expect(ruleset).toHaveProperty('version', '1.0.0');
      expect(ruleset).toHaveProperty('description', 'TypeScript rules');
    });

    it('should include sync metadata', async () => {
      const res = await request(app)
        .get('/v1/rules')
        .expect(200);

      expect(res.body.data).toHaveProperty('lastSync', '2026-03-21T00:00:00Z');
      expect(res.body.data).toHaveProperty('manifestVersion', '1.0.0');
    });

    it('should include request metadata', async () => {
      const res = await request(app)
        .get('/v1/rules')
        .expect(200);

      expect(res.body).toHaveProperty('metadata');
      expect(res.body.metadata).toHaveProperty('timestamp');
      expect(res.body.metadata).toHaveProperty('version', '3.7.0-test');
      expect(res.body.metadata).toHaveProperty('requestId');
    });

    it('should return empty array when no rulesets configured', async () => {
      const emptyDir = createRulesTestRoot({ activeRulesets: [] });
      const emptyApp = createApp({
        cwd: emptyDir,
        version: '3.7.0-test',
        logLevel: 'error',
        rateLimit: 1000,
      });

      try {
        const res = await request(emptyApp)
          .get('/v1/rules')
          .expect(200);

        expect(Array.isArray(res.body.data.rulesets)).toBe(true);
        expect(res.body.data.rulesets).toHaveLength(0);
        expect(res.body.data.total).toBe(0);
      } finally {
        fs.rmSync(emptyDir, { recursive: true, force: true });
      }
    });
  });

  describe('POST /v1/rules/sync', () => {
    it('should return service unavailable when sync fails', async () => {
      const res = await request(app)
        .post('/v1/rules/sync')
        .expect('Content-Type', /json/)
        .expect(503);

      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body.error).toHaveProperty('code', 'SERVICE_UNAVAILABLE');
    });

    it('should return 400 when rulesets source not configured', async () => {
      const noSourceDir = createRulesTestRoot({ sourceRepo: '' });
      const noSourceApp = createApp({
        cwd: noSourceDir,
        version: '3.7.0-test',
        logLevel: 'error',
        rateLimit: 1000,
      });

      try {
        const res = await request(noSourceApp)
          .post('/v1/rules/sync')
          .expect('Content-Type', /json/)
          .expect(400);

        expect(res.body).toHaveProperty('status', 'error');
        expect(res.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
        expect(res.body.error.message).toMatch(/not configured/i);
      } finally {
        fs.rmSync(noSourceDir, { recursive: true, force: true });
      }
    });

    it('should return a consistent error envelope for sync failures', async () => {
      const res = await request(app)
        .post('/v1/rules/sync')
        .expect(503);

      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toHaveProperty('code', 'SERVICE_UNAVAILABLE');
      expect(res.body).toHaveProperty('metadata');
    });
  });

  describe('GET /v1/rules/status', () => {
    it('should return sync status', async () => {
      const res = await request(app)
        .get('/v1/rules/status')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('lastSync', '2026-03-21T00:00:00Z');
      expect(res.body.data).toHaveProperty('isStale');
      expect(res.body.data).toHaveProperty('hasDrift');
      expect(res.body.data).toHaveProperty('activeRulesets', 1);
    });

    it('should include source information', async () => {
      const res = await request(app)
        .get('/v1/rules/status')
        .expect(200);

      expect(res.body.data).toHaveProperty('source');
      expect(res.body.data.source).toHaveProperty('repo');
      expect(res.body.data.source).toHaveProperty('branch', 'main');
      expect(res.body.data.source).toHaveProperty('commit', 'abc123def456');
    });

    it('should indicate staleness correctly', async () => {
      const res = await request(app)
        .get('/v1/rules/status')
        .expect(200);

      expect(typeof res.body.data.isStale).toBe('boolean');
      expect(typeof res.body.data.hasDrift).toBe('boolean');
    });

    it('should handle missing sync lock gracefully', async () => {
      const noLockDir = createRulesTestRoot({ includeLock: false });
      const noLockApp = createApp({
        cwd: noLockDir,
        version: '3.7.0-test',
        logLevel: 'error',
        rateLimit: 1000,
      });

      try {
        const res = await request(noLockApp)
          .get('/v1/rules/status')
          .expect(200);

        expect(res.body).toHaveProperty('status', 'success');
        expect(res.body.data).toHaveProperty('lastSync', null);
        expect(res.body.data).toHaveProperty('activeRulesets', 0);
      } finally {
        fs.rmSync(noLockDir, { recursive: true, force: true });
      }
    });
  });

  describe('GET /v1/rules/:category/:name', () => {
    it('should return ruleset details for active ruleset', async () => {
      const res = await request(app)
        .get('/v1/rules/languages/typescript')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body.data).toHaveProperty('ruleset');
      expect(res.body.data.ruleset).toHaveProperty('category', 'languages');
      expect(res.body.data.ruleset).toHaveProperty('name', 'typescript');
      expect(res.body.data.ruleset).toHaveProperty('path', 'languages/typescript');
    });

    it('should return 404 for non-active ruleset', async () => {
      const res = await request(app)
        .get('/v1/rules/nonexistent/ruleset')
        .expect('Content-Type', /json/)
        .expect(404);

      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body.error).toHaveProperty('code', 'NOT_FOUND');
      expect(res.body.error.message).toMatch(/nonexistent\/ruleset/);
    });

    it('should include ruleset content if available', async () => {
      const res = await request(app)
        .get('/v1/rules/languages/typescript')
        .expect(200);

      expect(res.body.data.ruleset).toHaveProperty('content');
      expect(typeof res.body.data.ruleset.content).toBe('string');
      expect(res.body.data.ruleset.content).toContain('TypeScript rules');
    });

    it('should include ruleset metadata', async () => {
      const res = await request(app)
        .get('/v1/rules/languages/typescript')
        .expect(200);

      const rulesetData = res.body.data.ruleset;
      expect(rulesetData).toHaveProperty('category', 'languages');
      expect(rulesetData).toHaveProperty('name', 'typescript');
      expect(rulesetData).toHaveProperty('path', 'languages/typescript');
      expect(rulesetData).toHaveProperty('description', 'TypeScript rules');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed requests gracefully', async () => {
      const res = await request(app)
        .post('/v1/rules/sync')
        .send('invalid json')
        .set('Content-Type', 'application/json')
        .expect('Content-Type', /json/);

      expect([400, 500]).toContain(res.status);
    });

    it('should return proper error format', async () => {
      const res = await request(app)
        .get('/v1/rules/invalid/path/structure')
        .expect('Content-Type', /json/)
        .expect(404);

      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toHaveProperty('code');
      expect(res.body.error).toHaveProperty('message');
      expect(res.body).toHaveProperty('metadata');
    });
  });

  describe('Request Metadata', () => {
    it('should include unique request IDs', async () => {
      const res1 = await request(app).get('/v1/rules/status');
      const res2 = await request(app).get('/v1/rules/status');

      const id1 = res1.body.metadata.requestId;
      const id2 = res2.body.metadata.requestId;

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(id2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should include timestamps in ISO format', async () => {
      const res = await request(app).get('/v1/rules/status');

      expect(res.body.metadata).toHaveProperty('timestamp');
      expect(res.body.metadata.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });
  });
});
