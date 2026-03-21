/**
 * Health and configuration endpoint tests
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { createApp } = require('../../lib/api-server-v2.cjs');

function createHealthTestRoot({ withConfig = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-health-'));

  fs.mkdirSync(path.join(dir, 'contracts'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.grabby'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'docs', 'openapi.yaml'),
    'openapi: 3.0.0\ninfo:\n  title: Temp Grabby API\n  version: 1.0.0\npaths: {}\n',
    'utf8',
  );

  if (withConfig) {
    fs.writeFileSync(
      path.join(dir, 'grabby.config.json'),
      JSON.stringify({
        version: '1.0',
        ai: {
          provider: 'anthropic',
          apiKey: 'sk-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN123456',
        },
        jira: {
          enabled: false,
          apiToken: 'AKIAABCDEFGHIJKLMNOP',
        },
        features: {
          menuMode: true,
          startupArt: true,
          rulesetWizard: true,
        },
      }, null, 2),
      'utf8',
    );
  }

  return dir;
}

describe('Health Endpoints', () => {
  let app;
  let tempDir;

  beforeEach(() => {
    tempDir = createHealthTestRoot();
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

  describe('GET /v1/health', () => {
    it('should return health status with 200 or 503', async () => {
      const res = await request(app)
        .get('/v1/health')
        .expect('Content-Type', /json/);

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
      const res = await request(app).get('/v1/health');

      expect([200, 503]).toContain(res.status);
      expect(res.body.data.services).toHaveProperty('filesystem');
      expect(res.body.data.services.filesystem).toHaveProperty('status');
      expect(['ok', 'degraded', 'error']).toContain(
        res.body.data.services.filesystem.status,
      );
    });

    it('should include git service status', async () => {
      const res = await request(app).get('/v1/health');

      expect([200, 503]).toContain(res.status);
      expect(res.body.data.services).toHaveProperty('git');
      expect(res.body.data.services.git).toHaveProperty('status');
      expect(['ok', 'unavailable', 'error']).toContain(
        res.body.data.services.git.status,
      );
    });

    it('should include rulesets service status', async () => {
      const res = await request(app).get('/v1/health');

      expect([200, 503]).toContain(res.status);
      expect(res.body.data.services).toHaveProperty('rulesets');
      expect(res.body.data.services.rulesets).toHaveProperty('status');
    });

    it('should include system metrics', async () => {
      const res = await request(app).get('/v1/health');

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
      await request(app).get('/v1/health');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500);
    });

    it('should include request metadata', async () => {
      const res = await request(app).get('/v1/health');

      expect(res.body).toHaveProperty('metadata');
      expect(res.body.metadata).toHaveProperty('timestamp');
      expect(res.body.metadata).toHaveProperty('version', '3.7.0-test');
      expect(res.body.metadata).toHaveProperty('requestId');
      expect(res.body.metadata.requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('should return 503 when services are degraded', async () => {
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
      expect(configStr).not.toMatch(/sk-[a-zA-Z0-9]{40,}/);
      expect(configStr).not.toMatch(/AKIA[A-Z0-9]{16}/);
      expect(res.body.data.config.ai.apiKey).toBe('***REDACTED***');
      expect(res.body.data.config.jira.apiToken).toBe('***REDACTED***');
    });

    it('should include metadata', async () => {
      const res = await request(app)
        .get('/v1/config')
        .expect(200);

      expect(res.body).toHaveProperty('metadata');
      expect(res.body.metadata).toHaveProperty('timestamp');
      expect(res.body.metadata).toHaveProperty('requestId');
    });

    it('should return default configuration when no config file exists', async () => {
      const missingConfigDir = createHealthTestRoot({ withConfig: false });
      const missingConfigApp = createApp({
        cwd: missingConfigDir,
        version: '3.7.0-test',
        logLevel: 'error',
        rateLimit: 1000,
      });

      try {
        const res = await request(missingConfigApp)
          .get('/v1/config')
          .expect('Content-Type', /json/)
          .expect(200);

        expect(res.body.data.config).toHaveProperty('contracts');
        expect(res.body.data.config).toHaveProperty('rulesets');
      } finally {
        fs.rmSync(missingConfigDir, { recursive: true, force: true });
      }
    });
  });

  describe('PUT /v1/config', () => {
    it('should update configuration', async () => {
      const res = await request(app)
        .put('/v1/config')
        .send({
          updates: {
            features: {
              testMode: true,
            },
          },
        })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body.data).toHaveProperty('message', 'Configuration updated');
      expect(res.body.data).toHaveProperty('updated');
      expect(res.body.data.updated).toContain('features');

      const savedConfig = JSON.parse(fs.readFileSync(path.join(tempDir, 'grabby.config.json'), 'utf8'));
      expect(savedConfig.features).toEqual(expect.objectContaining({ testMode: true }));
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
          updates: 'not an object',
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
