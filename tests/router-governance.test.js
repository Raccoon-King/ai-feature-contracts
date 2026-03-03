const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('yaml');
const {
  checkPlanExists,
  checkApprovalStatus,
  validateExecutionGate,
  detectUncontractedRequest,
} = require('../lib/governance-runtime.cjs');

describe('router governance', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-router-gov-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('detectUncontractedRequest', () => {
    it('detects feature requests without contract reference', () => {
      const result = detectUncontractedRequest('Add a login button');
      expect(result.isFeatureRequest).toBe(true);
      expect(result.hasContractRef).toBe(false);
      expect(result.needsRouting).toBe(true);
    });

    it('detects contract reference in request', () => {
      const result = detectUncontractedRequest('Implement contracts/GRAB-001.fc.md');
      expect(result.hasContractRef).toBe(true);
      expect(result.needsRouting).toBe(false);
    });

    it('detects contract ID reference', () => {
      const result = detectUncontractedRequest('Implement GRAB-001');
      expect(result.hasContractRef).toBe(true);
      expect(result.needsRouting).toBe(false);
    });

    it('does not flag non-feature requests', () => {
      const result = detectUncontractedRequest('What is the weather?');
      expect(result.isFeatureRequest).toBe(false);
      expect(result.needsRouting).toBe(false);
    });

    it('recognizes various feature keywords', () => {
      const keywords = ['implement', 'create', 'build', 'fix', 'refactor', 'enhance'];
      for (const kw of keywords) {
        const result = detectUncontractedRequest(`${kw} something new`);
        expect(result.isFeatureRequest).toBe(true);
      }
    });
  });

  describe('checkPlanExists', () => {
    it('returns false when plan does not exist', () => {
      const result = checkPlanExists('GRAB-001', tempDir);
      expect(result.exists).toBe(false);
      expect(result.path).toBeNull();
    });

    it('finds plan in contracts directory', () => {
      const contractsDir = path.join(tempDir, 'contracts');
      fs.mkdirSync(contractsDir, { recursive: true });
      fs.writeFileSync(path.join(contractsDir, 'GRAB-001.plan.yaml'), 'status: draft');

      const result = checkPlanExists('GRAB-001', tempDir);
      expect(result.exists).toBe(true);
      expect(result.path).toContain('GRAB-001.plan.yaml');
    });

    it('finds plan in contracts/active directory', () => {
      const activeDir = path.join(tempDir, 'contracts', 'active');
      fs.mkdirSync(activeDir, { recursive: true });
      fs.writeFileSync(path.join(activeDir, 'GRAB-002.plan.yaml'), 'status: draft');

      const result = checkPlanExists('GRAB-002', tempDir);
      expect(result.exists).toBe(true);
    });

    it('normalizes contract ID to uppercase', () => {
      const contractsDir = path.join(tempDir, 'contracts');
      fs.mkdirSync(contractsDir, { recursive: true });
      fs.writeFileSync(path.join(contractsDir, 'GRAB-001.plan.yaml'), 'status: draft');

      const result = checkPlanExists('grab-001', tempDir);
      expect(result.exists).toBe(true);
    });
  });

  describe('checkApprovalStatus', () => {
    it('returns false for non-existent plan', () => {
      const result = checkApprovalStatus('/nonexistent/path.yaml');
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('not found');
    });

    it('returns false for plan without approval_token', () => {
      const planPath = path.join(tempDir, 'plan.yaml');
      fs.writeFileSync(planPath, yaml.stringify({ status: 'draft' }));

      const result = checkApprovalStatus(planPath);
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('Missing approval_token');
    });

    it('returns true for approved plan', () => {
      const planPath = path.join(tempDir, 'plan.yaml');
      fs.writeFileSync(planPath, yaml.stringify({
        status: 'approved',
        approval_token: 'Approved',
        approved_at: '2026-01-01T00:00:00.000Z',
      }));

      const result = checkApprovalStatus(planPath);
      expect(result.approved).toBe(true);
      expect(result.approvedAt).toBe('2026-01-01T00:00:00.000Z');
    });

    it('handles malformed YAML gracefully', () => {
      const planPath = path.join(tempDir, 'plan.yaml');
      fs.writeFileSync(planPath, '{ invalid yaml');

      const result = checkApprovalStatus(planPath);
      expect(result.approved).toBe(false);
      expect(result.reason).toContain('Failed to parse');
    });
  });

  describe('validateExecutionGate', () => {
    it('fails when contract does not exist', () => {
      const result = validateExecutionGate('GRAB-999', tempDir);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('Contract not found'));
    });

    it('fails when plan does not exist', () => {
      const contractsDir = path.join(tempDir, 'contracts');
      fs.mkdirSync(contractsDir, { recursive: true });
      fs.writeFileSync(path.join(contractsDir, 'GRAB-001.fc.md'), '# Contract\n**ID:** GRAB-001');

      const result = validateExecutionGate('GRAB-001', tempDir);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('Plan not found'));
    });

    it('fails when plan is not approved', () => {
      const contractsDir = path.join(tempDir, 'contracts');
      fs.mkdirSync(contractsDir, { recursive: true });
      fs.writeFileSync(path.join(contractsDir, 'GRAB-001.fc.md'), '# Contract\n**ID:** GRAB-001');
      fs.writeFileSync(path.join(contractsDir, 'GRAB-001.plan.yaml'), yaml.stringify({ status: 'draft' }));

      const result = validateExecutionGate('GRAB-001', tempDir);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('Execution blocked'));
    });

    it('passes when contract exists, plan exists, and is approved', () => {
      const contractsDir = path.join(tempDir, 'contracts');
      fs.mkdirSync(contractsDir, { recursive: true });
      fs.writeFileSync(path.join(contractsDir, 'GRAB-001.fc.md'), '# Contract\n**ID:** GRAB-001');
      fs.writeFileSync(path.join(contractsDir, 'GRAB-001.plan.yaml'), yaml.stringify({
        status: 'approved',
        approval_token: 'Approved',
      }));

      const result = validateExecutionGate('GRAB-001', tempDir);
      expect(result.valid).toBe(true);
      expect(result.planPath).toContain('GRAB-001.plan.yaml');
      expect(result.contractPath).toContain('GRAB-001.fc.md');
    });
  });

  describe('ID normalization', () => {
    it('normalizes lowercase IDs to uppercase', () => {
      const contractsDir = path.join(tempDir, 'contracts');
      fs.mkdirSync(contractsDir, { recursive: true });
      fs.writeFileSync(path.join(contractsDir, 'GRAB-001.fc.md'), '# Contract\n**ID:** GRAB-001');
      fs.writeFileSync(path.join(contractsDir, 'GRAB-001.plan.yaml'), yaml.stringify({
        approval_token: 'Approved',
      }));

      const result = validateExecutionGate('grab-001', tempDir);
      expect(result.valid).toBe(true);
    });
  });

  describe('plan phase no-write guarantee', () => {
    it('checkPlanExists does not modify any files', () => {
      const contractsDir = path.join(tempDir, 'contracts');
      fs.mkdirSync(contractsDir, { recursive: true });
      const filesBefore = fs.readdirSync(contractsDir);

      checkPlanExists('GRAB-001', tempDir);

      const filesAfter = fs.readdirSync(contractsDir);
      expect(filesAfter).toEqual(filesBefore);
    });

    it('validateExecutionGate does not modify any files', () => {
      const contractsDir = path.join(tempDir, 'contracts');
      fs.mkdirSync(contractsDir, { recursive: true });
      fs.writeFileSync(path.join(contractsDir, 'GRAB-001.fc.md'), '# Contract');
      const contentBefore = fs.readFileSync(path.join(contractsDir, 'GRAB-001.fc.md'), 'utf8');

      validateExecutionGate('GRAB-001', tempDir);

      const contentAfter = fs.readFileSync(path.join(contractsDir, 'GRAB-001.fc.md'), 'utf8');
      expect(contentAfter).toBe(contentBefore);
    });
  });
});
