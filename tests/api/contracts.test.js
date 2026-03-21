/**
 * Contracts endpoint tests
 */

const request = require('supertest');
const { createApp } = require('../../lib/api-server-v2.cjs');
const fs = require('fs');
const path = require('path');

describe('Contracts Endpoints', () => {
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

  describe('GET /v1/contracts', () => {
    it('should return list of contracts', async () => {
      const res = await request(app)
        .get('/v1/contracts')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('contracts');
      expect(res.body.data).toHaveProperty('total');
      expect(Array.isArray(res.body.data.contracts)).toBe(true);
    });

    it('should include contract metadata', async () => {
      const res = await request(app)
        .get('/v1/contracts')
        .expect(200);

      if (res.body.data.contracts.length > 0) {
        const contract = res.body.data.contracts[0];
        expect(contract).toHaveProperty('id');
        expect(contract).toHaveProperty('title');
        expect(contract).toHaveProperty('status');
        expect(contract).toHaveProperty('type');
        expect(contract).toHaveProperty('lastModified');
        expect(contract).toHaveProperty('path');
      }
    });

    it('should include request metadata', async () => {
      const res = await request(app)
        .get('/v1/contracts')
        .expect(200);

      expect(res.body).toHaveProperty('metadata');
      expect(res.body.metadata).toHaveProperty('timestamp');
      expect(res.body.metadata).toHaveProperty('version', '3.7.0-test');
      expect(res.body.metadata).toHaveProperty('requestId');
    });

    it('should have total matching contracts array length', async () => {
      const res = await request(app)
        .get('/v1/contracts')
        .expect(200);

      expect(res.body.data.total).toBe(res.body.data.contracts.length);
    });
  });

  describe('POST /v1/contracts', () => {
    const testContractsDir = path.join(process.cwd(), 'contracts');
    let createdContractPath;

    afterEach(() => {
      // Cleanup created contracts
      if (createdContractPath && fs.existsSync(createdContractPath)) {
        fs.unlinkSync(createdContractPath);
      }
    });

    it('should create a new contract', async () => {
      const res = await request(app)
        .post('/v1/contracts')
        .send({
          title: 'Test Contract Creation',
          objective: 'Test that contract creation works via API',
          type: 'feat'
        })
        .expect('Content-Type', /json/)
        .expect(201);

      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body.data).toHaveProperty('contract');
      expect(res.body.data.contract).toHaveProperty('id');
      expect(res.body.data.contract).toHaveProperty('title', 'Test Contract Creation');
      expect(res.body.data.contract).toHaveProperty('status', 'draft');

      // Store path for cleanup
      createdContractPath = path.join(
        testContractsDir,
        `${res.body.data.contract.id}.fc.md`
      );
    });

    it('should reject creation without title', async () => {
      const res = await request(app)
        .post('/v1/contracts')
        .send({
          objective: 'Missing title field'
        })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
      expect(res.body.error.message).toMatch(/title/i);
    });

    it('should reject creation without objective', async () => {
      const res = await request(app)
        .post('/v1/contracts')
        .send({
          title: 'Missing objective'
        })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
      expect(res.body.error.message).toMatch(/objective/i);
    });

    it('should reject creation with invalid type', async () => {
      const res = await request(app)
        .post('/v1/contracts')
        .send({
          title: 'Invalid type contract',
          objective: 'Test invalid type',
          type: 'invalid-type'
        })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });

    it('should default to feat type when not specified', async () => {
      const res = await request(app)
        .post('/v1/contracts')
        .send({
          title: 'Default Type Contract',
          objective: 'Test default type behavior'
        })
        .expect(201);

      expect(res.body.data.contract).toHaveProperty('type', 'feat');

      createdContractPath = path.join(
        testContractsDir,
        `${res.body.data.contract.id}.fc.md`
      );
    });

    it('should reject duplicate titles', async () => {
      // Create first contract
      const res1 = await request(app)
        .post('/v1/contracts')
        .send({
          title: 'Duplicate Title Test',
          objective: 'First contract'
        })
        .expect(201);

      createdContractPath = path.join(
        testContractsDir,
        `${res1.body.data.contract.id}.fc.md`
      );

      // Try to create second with same title
      const res2 = await request(app)
        .post('/v1/contracts')
        .send({
          title: 'Duplicate Title Test',
          objective: 'Second contract'
        })
        .expect(409);

      expect(res2.body).toHaveProperty('status', 'error');
      expect(res2.body.error).toHaveProperty('code', 'CONFLICT');
      expect(res2.body.error.message).toMatch(/already exists/i);
    });
  });

  describe('GET /v1/contracts/:id', () => {
    it('should return contract details for existing contract', async () => {
      // Get list first to find an existing contract
      const listRes = await request(app).get('/v1/contracts');

      if (listRes.body.data.contracts.length === 0) {
        // Skip if no contracts exist
        return;
      }

      const contractId = listRes.body.data.contracts[0].id;

      const res = await request(app)
        .get(`/v1/contracts/${contractId}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body.data).toHaveProperty('contract');
      expect(res.body.data.contract).toHaveProperty('id', contractId);
      expect(res.body.data.contract).toHaveProperty('content');
      expect(typeof res.body.data.contract.content).toBe('string');
    });

    it('should return 404 for non-existent contract', async () => {
      const res = await request(app)
        .get('/v1/contracts/FC-99999')
        .expect('Content-Type', /json/)
        .expect(404);

      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body.error).toHaveProperty('code', 'NOT_FOUND');
      expect(res.body.error.message).toMatch(/FC-99999/);
    });

    it('should return 400 for invalid contract ID format', async () => {
      const res = await request(app)
        .get('/v1/contracts/invalid-id')
        .expect('Content-Type', /json/)
        .expect(400);

      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });

    it('should include validation when validate=true', async () => {
      const listRes = await request(app).get('/v1/contracts');

      if (listRes.body.data.contracts.length === 0) {
        return;
      }

      const contractId = listRes.body.data.contracts[0].id;

      const res = await request(app)
        .get(`/v1/contracts/${contractId}?validate=true`)
        .expect(200);

      expect(res.body.data.contract).toHaveProperty('validation');
      expect(res.body.data.contract.validation).toHaveProperty('valid');
      expect(res.body.data.contract.validation).toHaveProperty('errors');
      expect(res.body.data.contract.validation).toHaveProperty('warnings');
    });
  });

  describe('PUT /v1/contracts/:id', () => {
    let testContractId;
    const testContractsDir = path.join(process.cwd(), 'contracts');

    beforeAll(async () => {
      // Create a test contract
      const res = await request(app)
        .post('/v1/contracts')
        .send({
          title: 'Update Test Contract',
          objective: 'Contract for testing updates'
        });

      if (res.body.data?.contract?.id) {
        testContractId = res.body.data.contract.id;
      }
    });

    afterAll(() => {
      // Cleanup
      if (testContractId) {
        const contractPath = path.join(testContractsDir, `${testContractId}.fc.md`);
        if (fs.existsSync(contractPath)) {
          fs.unlinkSync(contractPath);
        }
      }
    });

    it('should update contract status', async () => {
      if (!testContractId) {
        return; // Skip if contract creation failed
      }

      const res = await request(app)
        .put(`/v1/contracts/${testContractId}`)
        .send({
          status: 'approved'
        })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body.data).toHaveProperty('message', 'Contract updated');
      expect(res.body.data.contract).toHaveProperty('id', testContractId);
    });

    it('should return 404 for non-existent contract', async () => {
      const res = await request(app)
        .put('/v1/contracts/FC-99999')
        .send({
          status: 'approved'
        })
        .expect('Content-Type', /json/)
        .expect(404);

      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body.error).toHaveProperty('code', 'NOT_FOUND');
    });

    it('should reject invalid status values', async () => {
      if (!testContractId) {
        return;
      }

      const res = await request(app)
        .put(`/v1/contracts/${testContractId}`)
        .send({
          status: 'invalid-status'
        })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });
  });

  describe('DELETE /v1/contracts/:id', () => {
    it('should delete existing contract', async () => {
      // Create a contract to delete
      const createRes = await request(app)
        .post('/v1/contracts')
        .send({
          title: 'Delete Test Contract',
          objective: 'Contract for testing deletion'
        })
        .expect(201);

      const contractId = createRes.body.data.contract.id;

      // Delete it
      const deleteRes = await request(app)
        .delete(`/v1/contracts/${contractId}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(deleteRes.body).toHaveProperty('status', 'success');
      expect(deleteRes.body.data).toHaveProperty('message', 'Contract deleted');
      expect(deleteRes.body.data).toHaveProperty('id', contractId);

      // Verify it's gone
      await request(app)
        .get(`/v1/contracts/${contractId}`)
        .expect(404);
    });

    it('should return 404 when deleting non-existent contract', async () => {
      const res = await request(app)
        .delete('/v1/contracts/FC-99999')
        .expect('Content-Type', /json/)
        .expect(404);

      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body.error).toHaveProperty('code', 'NOT_FOUND');
    });
  });

  describe('POST /v1/contracts/:id/validate', () => {
    it('should validate existing contract', async () => {
      const listRes = await request(app).get('/v1/contracts');

      if (listRes.body.data.contracts.length === 0) {
        return;
      }

      const contractId = listRes.body.data.contracts[0].id;

      const res = await request(app)
        .post(`/v1/contracts/${contractId}/validate`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body.data).toHaveProperty('message');
      expect(res.body.data).toHaveProperty('valid');
    });

    it('should return 404 for non-existent contract', async () => {
      const res = await request(app)
        .post('/v1/contracts/FC-99999/validate')
        .expect('Content-Type', /json/)
        .expect(404);

      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body.error).toHaveProperty('code', 'NOT_FOUND');
    });
  });

  describe('POST /v1/contracts/:id/plan', () => {
    it('should generate plan for existing contract', async () => {
      const listRes = await request(app).get('/v1/contracts');

      if (listRes.body.data.contracts.length === 0) {
        return;
      }

      const contractId = listRes.body.data.contracts[0].id;

      const res = await request(app)
        .post(`/v1/contracts/${contractId}/plan`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).toHaveProperty('status', 'success');
      expect(res.body.data).toHaveProperty('message');
      expect(res.body.data).toHaveProperty('planPath');
    });

    it('should return 404 for non-existent contract', async () => {
      const res = await request(app)
        .post('/v1/contracts/FC-99999/plan')
        .expect('Content-Type', /json/)
        .expect(404);

      expect(res.body).toHaveProperty('status', 'error');
      expect(res.body.error).toHaveProperty('code', 'NOT_FOUND');
    });
  });
});
