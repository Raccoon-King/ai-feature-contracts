/**
 * Grabby - API Server Module Tests
 * Comprehensive regression tests for REST API server
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const apiServer = require('../lib/api-server.cjs');

describe('API Server Module', () => {
  let tempDir;
  let server;
  let serverApi;
  let port;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-api-'));
  });

  afterEach(async () => {
    if (serverApi) {
      await serverApi.stop();
      serverApi = null;
      server = null;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function createContext() {
    return {
      contractsDir: path.join(tempDir, 'contracts'),
      grabbyDir: path.join(tempDir, '.grabby'),
    };
  }

  function writeContract(name, content) {
    const contractsDir = path.join(tempDir, 'contracts');
    fs.mkdirSync(contractsDir, { recursive: true });
    fs.writeFileSync(path.join(contractsDir, name), content, 'utf8');
  }

  async function startServer(context = createContext(), options = {}) {
    serverApi = apiServer.createAPIServer(context, options);
    server = await serverApi.start(0);
    const addr = server.address();
    port = addr.port;
    return server;
  }

  async function request(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
        },
      };

      const req = http.request(options, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: data ? JSON.parse(data) : null,
            });
          } catch {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: data,
            });
          }
        });
      });

      req.on('error', reject);
      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  describe('createAPIServer', () => {
    it('should create an HTTP server', async () => {
      await startServer();

      expect(server).toBeDefined();
      expect(typeof port).toBe('number');
    });

    it('should respond to health check', async () => {
      await startServer();

      const res = await request('GET', '/api/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('should handle CORS preflight', async () => {
      await startServer();

      const res = await request('OPTIONS', '/api/contracts');

      expect(res.headers['access-control-allow-origin']).toBe('*');
      expect(res.headers['access-control-allow-methods']).toContain('GET');
    });
  });

  describe('GET /api/contracts', () => {
    it('should return empty array for no contracts', async () => {
      await startServer();

      const res = await request('GET', '/api/contracts');

      expect(res.status).toBe(200);
      expect(res.body.contracts).toEqual([]);
    });

    it('should list contracts', async () => {
      writeContract('test.fc.md', `# FC: Test Feature
**ID:** FC-001 | **Status:** draft

## Objective
Test.
`);
      await startServer();

      const res = await request('GET', '/api/contracts');

      expect(res.status).toBe(200);
      expect(res.body.contracts).toHaveLength(1);
      expect(res.body.contracts[0].file).toBe('test.fc.md');
      expect(res.body.contracts[0].id).toBe('FC-001');
      expect(res.body.contracts[0].status).toBe('draft');
    });
  });

  describe('GET /api/contracts/:id', () => {
    it('should return 404 for non-existent contract', async () => {
      await startServer();

      const res = await request('GET', '/api/contracts/FC-999');

      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });

    it('should return contract by ID', async () => {
      writeContract('test.fc.md', `# FC: Test Feature
**ID:** FC-001 | **Status:** draft

## Objective
Test objective.

## Scope
- Item 1

## Directories
**Allowed:** src/

## Files
| Action | Path |
|--------|------|
| create | src/test.ts |

## Done When
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes

## Testing
- Unit tests
`);
      await startServer();

      const res = await request('GET', '/api/contracts/FC-001');

      expect(res.status).toBe(200);
      expect(res.body.file).toBe('test.fc.md');
      expect(res.body.content).toBeDefined();
      expect(res.body.validation).toBeDefined();
      expect(res.body.complexity).toBeDefined();
    });

    it('should return contract by filename', async () => {
      writeContract('test.fc.md', `# FC: Test
**ID:** FC-001 | **Status:** draft
`);
      await startServer();

      const res = await request('GET', '/api/contracts/test.fc.md');

      expect(res.status).toBe(200);
      expect(res.body.file).toBe('test.fc.md');
    });
  });

  describe('POST /api/contracts', () => {
    it('should create contract from name', async () => {
      await startServer();

      const res = await request('POST', '/api/contracts', {
        name: 'New Feature',
      });

      expect(res.status).toBe(201);
      expect(res.body.created).toContain('.fc.md');

      const contractsDir = path.join(tempDir, 'contracts');
      const files = fs.readdirSync(contractsDir);
      expect(files.length).toBeGreaterThan(0);
    });

    it('should create contract from content', async () => {
      await startServer();

      const res = await request('POST', '/api/contracts', {
        name: 'Custom',
        content: '# FC: Custom\n## Objective\nCustom content.',
      });

      expect(res.status).toBe(201);
      expect(res.body.created).toBe('custom.fc.md');
    });

    it('should return error for missing name and content', async () => {
      await startServer();

      const res = await request('POST', '/api/contracts', {});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });
  });

  describe('POST /api/contracts/:id/validate', () => {
    it('should validate contract', async () => {
      writeContract('test.fc.md', `# FC: Test
**ID:** FC-001 | **Status:** draft

## Objective
Test.

## Scope
- Item

## Directories
**Allowed:** src/

## Files
| Action | Path |
|--------|------|
| create | src/test.ts |

## Done When
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes

## Testing
- Unit tests
`);
      await startServer();

      const res = await request('POST', '/api/contracts/FC-001/validate');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('valid');
      expect(res.body).toHaveProperty('errors');
      expect(res.body).toHaveProperty('warnings');
    });
  });

  describe('GET /api/metrics', () => {
    it('should return metrics', async () => {
      await startServer();

      const res = await request('GET', '/api/metrics');

      expect(res.status).toBe(200);
      expect(res.body).toBeDefined();
    });
  });

  describe('rate limiting', () => {
    it('should enforce rate limit', async () => {
      await startServer(createContext(), { rateLimit: 2 });

      // First two requests should succeed
      const res1 = await request('GET', '/api/health');
      const res2 = await request('GET', '/api/health');

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      // Third request should be rate limited
      const res3 = await request('GET', '/api/health');
      expect(res3.status).toBe(429);
    });
  });

  describe('404 handling', () => {
    it('should return 404 for unknown routes', async () => {
      await startServer();

      const res = await request('GET', '/api/unknown');

      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });
  });
});
