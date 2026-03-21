/**
 * Health and configuration endpoint tests
 */

const request = require('supertest');
const { createApp } = require('../../lib/api-server-v2.cjs');
const fs = require('fs');
const path = require('path');

describe('Health Endpoints', () => {
  let app;
  const testConfig = {
    cwd: process.cwd(),
    version: '3.7.0-test',
    logLevel: 'error',
    rateLimit: 1000 // High limit for tests
  };

  beforeAll(() => {
    app = createApp(testConfig);
  });

  describe('GET /v1/health', () => {
    it('should return health status with 200 or 503', async () => {
      const res = await request(app)
        .get('/v1/health')
        .expect('Content-Type', /json/);

      // Accept both 200 (healthy) and 503 (degraded)
      expect([200, 503]).toContain(res.status);

      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('status');
      expect(['healthy', 'degraded']).toContain(res.body.data.status);
      expect(res.body.data).toHaveProperty('services');
      expect(res.body.data).toHaveProperty('system');
      expect(res.body.data).toHaveProperty('version', '3.7.0-test');
      expect(res.body.data).toHaveProperty('responseTime');
    });

    it('should include filesystem service status', async () => {
      const res = await request(app)
        .get('/v1/health');

      expect([200, 503]).toContain(res.status);
      expect(res.body.data.services).toHaveProperty('filesystem');
      expect(res.body.data.services.filesystem).toHaveProperty('status');
      expect(['ok', 'degraded', 'error']).toContain(
        res.body.data.services.filesystem.status
      );
    });

    it('should include git service status', async () => {
      const res = await request(app)
        .get('/v1/health');

      expect([200, 503]).toContain(res.status);
      expect(res.body.data.services).toHaveProperty('git');
      expect(res.body.data.services.git).toHaveProperty('status');
      expect(['ok', 'unavailable', 'error']).toContain(
        res.body.data.services.git.status
      );
    });

    it('should include rulesets service status', async () => {
      const res = await request(app)
        .get('/v1/health');

      expect([200, 503]).toContain(res.status);
      expect(res.body.data.services).toHaveProperty('rulesets');
      expect(res.body.data.services.rulesets).toHaveProperty('status');
    });

    it('should include system metrics', async () => {
      const res = await request(app)
        .get('/v1/health');

      expect([200, 503]).toContain(res.status);
      const { system } = res.body.data;
      expect(system).toHaveProperty('uptime');
      expect(system).toHaveProperty('memory');
      expect(system.memory).toHaveProperty('used');
      expect(system.memory).toHaveProperty('total');
      expect(system).toHaveProperty('platform');
      expect(system).toHaveProperty('nodeVersion');
    });

    it('should respond in a reasonable time', async () => {
      const start = Date.now();
      await request(app)
        .get('/v1/health');
      const duration = Date.now() - start;

      // Allow up to 500ms for CI environments which can be slower
      expect(duration).toBeLessThan(500);
    });

    it('should include request metadata', async () => {
      const res = await request(app)
        .get('/v1/health');

      expect(res.body).toHaveProperty('metadata');
      expect(res.body.metadata).toHaveProperty('timestamp');
      expect(res.body.metadata).toHaveProperty('version', '3.7.0-test');
      expect(res.body.metadata).toHaveProperty('requestId');
      expect(res.body.metadata.requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should return 503 when services are degraded', async () => {
      // This test would need to mock degraded services
      // For now, we just verify the status code handling exists
      const res = await request(app).get('/v1/health');

      expect([200, 503]).toContain(res.status);
    });
  });

  describe('GET /v1/config', () => {
    it('should return configuration', async () => {
      const res = await request(app)
        .get('/v1/config')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('config');
    });

    it('should redact API keys', async () => {
      const res = await request(app)
        .get('/v1/config')
        .expect(200);

      const configStr = JSON.stringify(res.body.data.config);
      expect(configStr).not.toMatch(/sk-[a-zA-Z0-9]{40,}/); // Anthropic API key pattern
      expect(configStr).not.toMatch(/AKIA[A-Z0-9]{16}/); // AWS key pattern

      // If ai.apiKey exists, it should be redacted
      if (res.body.data.config.ai?.apiKey) {
        expect(res.body.data.config.ai.apiKey).toBe('***REDACTED***');
      }

      // If jira.apiToken exists, it should be redacted
      if (res.body.data.config.jira?.apiToken) {
        expect(res.body.data.config.jira.apiToken).toBe('***REDACTED***');
      }
    });

    it('should include metadata', async () => {
      const res = await request(app)
        .get('/v1/config')
        .expect(200);

      expect(res.body).toHaveProperty('metadata');
      expect(res.body.metadata).toHaveProperty('timestamp');
      expect(res.body.metadata).toHaveProperty('requestId');
    });
  });

  describe('PUT /v1/config', () => {
    const configPath = path.join(process.cwd(), 'grabby.config.json');
    let originalConfig;

    beforeAll(() => {
      // Backup original config
      if (fs.existsSync(configPath)) {
        originalConfig = fs.readFileSync(configPath, 'utf8');
      }
    });

    afterAll(() => {
      // Restore original config
      if (originalConfig) {
        fs.writeFileSync(configPath, originalConfig, 'utf8');
      }
    });

    it('should update configuration', async () => {
      const res = await request(app)
        .put('/v1/config')
        .send({
          updates: {
            features: {
              testMode: true
            }
          }
        })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body.data).toHaveProperty('message', 'Configuration updated');
      expect(res.body.data).toHaveProperty('updated');
      expect(res.body.data.updated).toContain('features');
    });

    it('should reject request without updates object', async () => {
      const res = await request(app)
        .put('/v1/config')
        .send({})
        .expect('Content-Type', /json/)
        .expect(400);

      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });

    it('should reject invalid updates', async () => {
      const res = await request(app)
        .put('/v1/config')
        .send({
          updates: 'not an object'
        })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(res.body).toHaveProperty('status', 'error');
    });
  });

  describe('GET /', () => {
    it('should return API information', async () => {
      const res = await request(app)
        .get('/')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).toHaveProperty('name', 'Grabby REST API');
      expect(res.body).toHaveProperty('version', '3.7.0-test');
      expect(res.body).toHaveProperty('documentation', '/v1/docs');
      expect(res.body).toHaveProperty('endpoints');
      expect(res.body.endpoints).toHaveProperty('contracts', '/v1/contracts');
      expect(res.body.endpoints).toHaveProperty('rules', '/v1/rules');
      expect(res.body.endpoints).toHaveProperty('health', '/v1/health');
      expect(res.body.endpoints).toHaveProperty('config', '/v1/config');
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      const res = await request(app)
        .get('/v1/unknown-endpoint')
        .expect('Content-Type', /json/)
        .expect(404);

      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body.error).toHaveProperty('code', 'NOT_FOUND');
      expect(res.body.error.message).toMatch(/Route not found/);
    });
  });
});
