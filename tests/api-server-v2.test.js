'use strict';

const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const request = require('supertest');

const apiServerV2 = require('../lib/api-server-v2.cjs');

function createTempServerRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-api-v2-'));
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify(
      {
        name: 'grabby-api-v2-test',
        version: '0.0.1',
        repository: {
          type: 'git',
          url: 'https://github.com/example/grabby-api-v2-test.git',
        },
      },
      null,
      2,
    ),
    'utf8',
  );
  fs.writeFileSync(
    path.join(dir, 'docs', 'openapi.yaml'),
    [
      'openapi: 3.0.0',
      'info:',
      '  title: Temp Grabby API',
      '  version: 1.0.0',
      'paths: {}',
      '',
    ].join('\n'),
    'utf8',
  );
  return dir;
}

function listenOnRandomPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function closeServer(server) {
  if (!server) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

describe('API Server v2', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempServerRoot();
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function buildConfig(overrides = {}) {
    return {
      cwd: tempDir,
      version: '4.0.1-test',
      logLevel: 'error',
      rateLimit: 1000,
      ...overrides,
    };
  }

  describe('createApp', () => {
    it('serves the raw OpenAPI YAML and JSON spec endpoints', async () => {
      const app = apiServerV2.createApp(buildConfig());

      const yamlRes = await request(app)
        .get('/v1/openapi.yaml')
        .expect('Content-Type', /yaml/)
        .expect(200);
      expect(yamlRes.text).toContain('openapi: 3.0.0');

      const jsonRes = await request(app)
        .get('/v1/openapi.json')
        .expect('Content-Type', /json/)
        .expect(200);
      expect(jsonRes.body).toEqual(expect.objectContaining({
        openapi: '3.0.0',
        info: expect.objectContaining({
          title: 'Temp Grabby API',
        }),
      }));
    });

    it('serves Swagger UI when an OpenAPI spec is present', async () => {
      const app = apiServerV2.createApp(buildConfig());

      const res = await request(app)
        .get('/v1/docs/')
        .expect('Content-Type', /html/)
        .expect(200);

      expect(res.text).toMatch(/swagger-ui/i);
    });
  });

  describe('findAvailablePort', () => {
    it('returns the requested port when it is available', async () => {
      const probe = await listenOnRandomPort();
      const candidatePort = probe.address().port;
      await closeServer(probe);

      const port = await apiServerV2.findAvailablePort(candidatePort, 1);

      expect(port).toBe(candidatePort);
    });

    it('skips an occupied port and finds a later port in range', async () => {
      const occupiedServer = await listenOnRandomPort();
      const occupiedPort = occupiedServer.address().port;

      try {
        const port = await apiServerV2.findAvailablePort(occupiedPort, 4);
        expect(port).toBeGreaterThanOrEqual(occupiedPort);
        expect(port).not.toBe(occupiedPort);
      } finally {
        await closeServer(occupiedServer);
      }
    });

    it('throws when no port in the allowed range is available', async () => {
      const occupiedServer = await listenOnRandomPort();
      const occupiedPort = occupiedServer.address().port;

      try {
        await expect(apiServerV2.findAvailablePort(occupiedPort, 1))
          .rejects
          .toThrow('No available port in range');
      } finally {
        await closeServer(occupiedServer);
      }
    });
  });

  describe('startServer', () => {
    it('starts an HTTP server and serves the health endpoint', async () => {
      const probe = await listenOnRandomPort();
      const startingPort = probe.address().port;
      await closeServer(probe);

      const started = await apiServerV2.startServer(buildConfig({ port: startingPort }));

      try {
        expect(started).toEqual(expect.objectContaining({
          port: expect.any(Number),
          app: expect.any(Function),
          server: expect.any(Object),
        }));
        expect(started.port).toBeGreaterThanOrEqual(startingPort);

        const res = await request(`http://127.0.0.1:${started.port}`)
          .get('/v1/health');

        expect([200, 503]).toContain(res.status);
        expect(res.body).toHaveProperty('data');
        expect(res.body.data).toHaveProperty('status');
      } finally {
        await closeServer(started.server);
      }
    });
  });

  describe('setupGracefulShutdown', () => {
    it('registers SIGTERM and SIGINT handlers', () => {
      const processOnSpy = jest.spyOn(process, 'on');
      const fakeServer = { close: jest.fn() };
      const fakeLogger = { info: jest.fn(), error: jest.fn() };

      apiServerV2.setupGracefulShutdown(fakeServer, fakeLogger);

      expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));

      processOnSpy.mockRestore();
    });
  });
});
