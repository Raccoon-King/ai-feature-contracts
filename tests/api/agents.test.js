/**
 * Agents and workflows endpoint tests
 */

const request = require('supertest');
const { createApp } = require('../../lib/api-server-v2.cjs');

describe('Agents Endpoints', () => {
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

  describe('GET /v1/agents', () => {
    it('should return list of agents', async () => {
      const res = await request(app)
        .get('/v1/agents')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('agents');
      expect(res.body.data).toHaveProperty('total');
      expect(Array.isArray(res.body.data.agents)).toBe(true);
    });

    it('should include agent metadata fields', async () => {
      const res = await request(app)
        .get('/v1/agents')
        .expect(200);

      if (res.body.data.agents.length > 0) {
        const agent = res.body.data.agents[0];
        expect(agent).toHaveProperty('id');
        expect(agent).toHaveProperty('name');
        expect(agent).toHaveProperty('title');
        expect(agent).toHaveProperty('mode');
      }
    });

    it('should include metadata', async () => {
      const res = await request(app)
        .get('/v1/agents')
        .expect(200);

      expect(res.body).toHaveProperty('metadata');
      expect(res.body.metadata).toHaveProperty('timestamp');
      expect(res.body.metadata).toHaveProperty('version', '3.7.0-test');
    });
  });

  describe('GET /v1/agents/:id', () => {
    it('should return agent details for valid id', async () => {
      // First get list to find a valid agent ID
      const listRes = await request(app).get('/v1/agents');

      if (listRes.body.data.agents.length > 0) {
        const agentId = listRes.body.data.agents[0].id;

        const res = await request(app)
          .get(`/v1/agents/${agentId}`)
          .expect('Content-Type', /json/)
          .expect(200);

        expect(res.body).toHaveProperty('status', 'success');
        expect(res.body.data).toHaveProperty('agent');
        expect(res.body.data.agent).toHaveProperty('id', agentId);
        expect(res.body.data.agent).toHaveProperty('name');
        expect(res.body.data.agent).toHaveProperty('menu');
      }
    });

    it('should return 404 for non-existent agent', async () => {
      const res = await request(app)
        .get('/v1/agents/nonexistent-agent-xyz')
        .expect('Content-Type', /json/)
        .expect(404);

      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body.error).toHaveProperty('code', 'NOT_FOUND');
    });
  });

  describe('GET /v1/agents/:id/workflows', () => {
    it('should return workflows for valid agent', async () => {
      // First get list to find a valid agent ID
      const listRes = await request(app).get('/v1/agents');

      if (listRes.body.data.agents.length > 0) {
        const agentId = listRes.body.data.agents[0].id;

        const res = await request(app)
          .get(`/v1/agents/${agentId}/workflows`)
          .expect('Content-Type', /json/)
          .expect(200);

        expect(res.body).toHaveProperty('status', 'success');
        expect(res.body.data).toHaveProperty('agentId', agentId);
        expect(res.body.data).toHaveProperty('workflows');
        expect(res.body.data).toHaveProperty('total');
        expect(Array.isArray(res.body.data.workflows)).toBe(true);
      }
    });

    it('should return 404 for non-existent agent', async () => {
      const res = await request(app)
        .get('/v1/agents/nonexistent-agent-xyz/workflows')
        .expect('Content-Type', /json/)
        .expect(404);

      expect(res.body).toHaveProperty('status', 'error');
    });
  });

  describe('GET /v1/agents/all/workflows', () => {
    it('should return all workflows', async () => {
      const res = await request(app)
        .get('/v1/agents/all/workflows')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body.data).toHaveProperty('workflows');
      expect(res.body.data).toHaveProperty('total');
      expect(Array.isArray(res.body.data.workflows)).toBe(true);
    });
  });

  describe('POST /v1/agents/route', () => {
    it('should route request to appropriate agent', async () => {
      const res = await request(app)
        .post('/v1/agents/route')
        .send({ request: 'Create a new feature contract' })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body.data).toHaveProperty('primary');
      expect(res.body.data.primary).toHaveProperty('id');
      expect(res.body.data.primary).toHaveProperty('name');
    });

    it('should reject empty request', async () => {
      const res = await request(app)
        .post('/v1/agents/route')
        .send({})
        .expect('Content-Type', /json/)
        .expect(400);

      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });

    it('should reject non-string request', async () => {
      const res = await request(app)
        .post('/v1/agents/route')
        .send({ request: 12345 })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(res.body).toHaveProperty('status', 'error');
    });
  });

  describe('GET /v1/agents/lint/all', () => {
    it('should return lint results for all agents', async () => {
      const res = await request(app)
        .get('/v1/agents/lint/all')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body.data).toHaveProperty('valid');
      expect(res.body.data).toHaveProperty('results');
      expect(Array.isArray(res.body.data.results)).toBe(true);
    });

    it('should include lint details in results', async () => {
      const res = await request(app)
        .get('/v1/agents/lint/all')
        .expect(200);

      if (res.body.data.results.length > 0) {
        const result = res.body.data.results[0];
        expect(result).toHaveProperty('fileName');
        expect(result).toHaveProperty('valid');
        expect(result).toHaveProperty('errors');
        expect(result).toHaveProperty('warnings');
      }
    });
  });

  describe('Root endpoint agents inclusion', () => {
    it('should include agents endpoint in root response', async () => {
      const res = await request(app)
        .get('/')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body.endpoints).toHaveProperty('agents', '/v1/agents');
    });
  });
});
