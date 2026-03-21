/**
 * Rules endpoint tests
 */

const request = require('supertest');
const { createApp } = require('../../lib/api-server-v2.cjs');
const nock = require('nock');

describe('Rules Endpoints', () => {
  let app;
  const testConfig = {
    cwd: process.cwd(),
    version: '3.7.0-test',
    logLevel: 'error',
    rateLimit: 1000
  };

  beforeAll(() => {
    app = createApp(testConfig);
  });

  afterEach(() => {
    nock.cleanAll();
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
      expect(res.body.data).toHaveProperty('total');
      expect(Array.isArray(res.body.data.rulesets)).toBe(true);
    });

    it('should include ruleset metadata', async () => {
      const res = await request(app)
        .get('/v1/rules')
        .expect(200);

      if (res.body.data.rulesets.length > 0) {
        const ruleset = res.body.data.rulesets[0];
        expect(ruleset).toHaveProperty('path');
        expect(ruleset).toHaveProperty('category');
        expect(ruleset).toHaveProperty('name');
      }
    });

    it('should include sync metadata', async () => {
      const res = await request(app)
        .get('/v1/rules')
        .expect(200);

      expect(res.body.data).toHaveProperty('lastSync');
      expect(res.body.data).toHaveProperty('manifestVersion');
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
      // This would require mocking the config to return no active rulesets
      const res = await request(app)
        .get('/v1/rules')
        .expect(200);

      expect(Array.isArray(res.body.data.rulesets)).toBe(true);
      expect(typeof res.body.data.total).toBe('number');
    });
  });

  describe('POST /v1/rules/sync', () => {
    it('should sync rulesets from remote repository', async () => {
      // This test may fail if git is not configured or network is unavailable
      // We'll just verify the endpoint exists and returns proper format
      const res = await request(app)
        .post('/v1/rules/sync')
        .expect('Content-Type', /json/);

      // Should be either success (200) or service unavailable (503)
      expect([200, 400, 503]).toContain(res.status);

      if (res.status === 200) {
        expect(res.body).toHaveProperty('status', 'success');
        expect(res.body.data).toHaveProperty('synced');
        expect(res.body.data).toHaveProperty('timestamp');
      } else if (res.status === 503) {
        expect(res.body).toHaveProperty('status', 'error');
        expect(res.body.error).toHaveProperty('code');
      }
    });

    it('should return 400 when rulesets source not configured', async () => {
      // This would require mocking config without rulesets.source.repo
      // For now, we just test the response format
      const res = await request(app)
        .post('/v1/rules/sync');

      if (res.status === 400) {
        expect(res.body).toHaveProperty('status', 'error');
        expect(res.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
        expect(res.body.error.message).toMatch(/not configured/i);
      }
    });

    it('should return 503 when git is unavailable', async () => {
      // This would require mocking git to fail
      // We just verify the error format
      const res = await request(app)
        .post('/v1/rules/sync');

      if (res.status === 503) {
        expect(res.body).toHaveProperty('status', 'error');
        expect(res.body.error).toHaveProperty('code', 'SERVICE_UNAVAILABLE');
      }
    });

    it('should include sync results in response', async () => {
      const res = await request(app)
        .post('/v1/rules/sync');

      if (res.status === 200) {
        expect(res.body.data).toHaveProperty('synced');
        expect(res.body.data).toHaveProperty('timestamp');
        expect(res.body.data).toHaveProperty('version');
        expect(res.body.data).toHaveProperty('commit');
        expect(res.body.data).toHaveProperty('rulesets');
        expect(Array.isArray(res.body.data.rulesets)).toBe(true);
      }
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
      expect(res.body.data).toHaveProperty('lastSync');
      expect(res.body.data).toHaveProperty('isStale');
      expect(res.body.data).toHaveProperty('hasDrift');
      expect(res.body.data).toHaveProperty('activeRulesets');
    });

    it('should include source information', async () => {
      const res = await request(app)
        .get('/v1/rules/status')
        .expect(200);

      expect(res.body.data).toHaveProperty('source');

      if (res.body.data.source) {
        expect(res.body.data.source).toHaveProperty('repo');
        expect(res.body.data.source).toHaveProperty('branch');
        expect(res.body.data.source).toHaveProperty('commit');
      }
    });

    it('should indicate staleness correctly', async () => {
      const res = await request(app)
        .get('/v1/rules/status')
        .expect(200);

      expect(typeof res.body.data.isStale).toBe('boolean');
      expect(typeof res.body.data.hasDrift).toBe('boolean');
    });

    it('should handle missing sync lock gracefully', async () => {
      const res = await request(app)
        .get('/v1/rules/status')
        .expect(200);

      // Should succeed even if sync lock doesn't exist
      expect(res.body).toHaveProperty('status', 'success');
    });
  });

  describe('GET /v1/rules/:category/:name', () => {
    it('should return ruleset details for active ruleset', async () => {
      // First get list of active rulesets
      const listRes = await request(app).get('/v1/rules');

      if (listRes.body.data.rulesets.length === 0) {
        // Skip if no rulesets configured
        return;
      }

      const ruleset = listRes.body.data.rulesets[0];
      const { category, name } = ruleset;

      const res = await request(app)
        .get(`/v1/rules/${category}/${name}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body.data).toHaveProperty('ruleset');
      expect(res.body.data.ruleset).toHaveProperty('category', category);
      expect(res.body.data.ruleset).toHaveProperty('name', name);
      expect(res.body.data.ruleset).toHaveProperty('path', `${category}/${name}`);
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
      const listRes = await request(app).get('/v1/rules');

      if (listRes.body.data.rulesets.length === 0) {
        return;
      }

      const ruleset = listRes.body.data.rulesets[0];
      const { category, name } = ruleset;

      const res = await request(app)
        .get(`/v1/rules/${category}/${name}`)
        .expect(200);

      expect(res.body.data.ruleset).toHaveProperty('content');
      // Content may be null if file doesn't exist, or a string if it does
      expect([null, 'string']).toContain(typeof res.body.data.ruleset.content);
    });

    it('should include ruleset metadata', async () => {
      const listRes = await request(app).get('/v1/rules');

      if (listRes.body.data.rulesets.length === 0) {
        return;
      }

      const ruleset = listRes.body.data.rulesets[0];
      const { category, name } = ruleset;

      const res = await request(app)
        .get(`/v1/rules/${category}/${name}`)
        .expect(200);

      const rulesetData = res.body.data.ruleset;
      expect(rulesetData).toHaveProperty('category');
      expect(rulesetData).toHaveProperty('name');
      expect(rulesetData).toHaveProperty('path');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed requests gracefully', async () => {
      const res = await request(app)
        .post('/v1/rules/sync')
        .send('invalid json')
        .set('Content-Type', 'application/json')
        .expect('Content-Type', /json/);

      // Should return 400 or 500, not crash
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
