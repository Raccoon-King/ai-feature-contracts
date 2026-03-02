/**
 * Grabby - CI/CD Module Tests
 * Comprehensive regression tests for CI/CD integration
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const cicd = require('../lib/cicd.cjs');

describe('CI/CD Module', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-cicd-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('generateGitHubWorkflow', () => {
    it('should generate workflow string', () => {
      const result = cicd.generateGitHubWorkflow();

      expect(typeof result).toBe('string');
      expect(result).toContain('name: Contract Validation');
      expect(result).toContain('on:');
      expect(result).toContain('pull_request');
    });

    it('should include checkout step', () => {
      const result = cicd.generateGitHubWorkflow();

      expect(result).toContain('actions/checkout');
    });

    it('should include Node.js setup', () => {
      const result = cicd.generateGitHubWorkflow();

      expect(result).toContain('actions/setup-node');
      expect(result).toContain("node-version:");
    });

    it('should include grabby install step', () => {
      const result = cicd.generateGitHubWorkflow();

      expect(result).toContain('npm install -g grabby');
    });

    it('should include validation step', () => {
      const result = cicd.generateGitHubWorkflow();

      expect(result).toContain('grabby validate');
    });

    it('should include metrics generation', () => {
      const result = cicd.generateGitHubWorkflow();

      expect(result).toContain('grabby metrics');
    });
  });

  describe('templates.preCommitHook', () => {
    it('should provide hook script template', () => {
      const result = cicd.templates.preCommitHook;

      expect(typeof result).toBe('string');
      expect(result).toContain('#!/bin/sh');
    });

    it('should include contract file detection', () => {
      const result = cicd.templates.preCommitHook;

      // Check for grep pattern that matches .fc.md files (backslash-escaped)
      expect(result).toMatch(/grep.*fc.*md/);
    });

    it('should include validation command', () => {
      const result = cicd.templates.preCommitHook;

      expect(result).toContain('grabby validate');
    });

    it('should exit with error on validation failure', () => {
      const result = cicd.templates.preCommitHook;

      expect(result).toContain('exit 1');
    });
  });

  describe('templates.prTemplate', () => {
    it('should provide PR template', () => {
      const result = cicd.templates.prTemplate;

      expect(typeof result).toBe('string');
      expect(result).toContain('## Description');
    });

    it('should include contract reference section', () => {
      const result = cicd.templates.prTemplate;

      expect(result).toContain('Contract Reference');
      expect(result).toContain('Contract ID');
    });

    it('should include checklist', () => {
      const result = cicd.templates.prTemplate;

      expect(result).toContain('## Checklist');
      expect(result).toContain('- [ ]');
    });

    it('should include security checklist', () => {
      const result = cicd.templates.prTemplate;

      expect(result).toContain('Security');
      expect(result).toContain('npm audit');
    });
  });

  describe('generateCICDFiles', () => {
    it('should generate CI/CD files and return array', () => {
      const result = cicd.generateCICDFiles(tempDir);

      expect(Array.isArray(result)).toBe(true);
    });

    it('should write workflow file to .github directory', () => {
      cicd.generateCICDFiles(tempDir);

      const workflowPath = path.join(tempDir, '.github', 'workflows', 'contract-validation.yml');
      expect(fs.existsSync(workflowPath)).toBe(true);
      expect(fs.readFileSync(workflowPath, 'utf8')).toContain('Contract Validation');
    });

    it('should write PR template', () => {
      cicd.generateCICDFiles(tempDir);

      const prPath = path.join(tempDir, '.github', 'PULL_REQUEST_TEMPLATE.md');
      expect(fs.existsSync(prPath)).toBe(true);
    });

    it('should return generated file info', () => {
      const result = cicd.generateCICDFiles(tempDir);

      const workflow = result.find(r => r.type === 'workflow');
      const prTemplate = result.find(r => r.type === 'pr-template');

      expect(workflow).toBeDefined();
      expect(prTemplate).toBeDefined();
      expect(workflow.path).toContain('.github');
    });

    it('should support dry run mode', () => {
      const result = cicd.generateCICDFiles(tempDir, { dryRun: true });

      expect(result.some(r => r.dryRun)).toBe(true);
      const workflowPath = path.join(tempDir, '.github', 'workflows', 'contract-validation.yml');
      expect(fs.existsSync(workflowPath)).toBe(false);
    });
  });

  describe('checkCICDSetup', () => {
    it('should return status object', () => {
      const result = cicd.checkCICDSetup(tempDir);

      expect(result).toHaveProperty('checks');
      expect(result).toHaveProperty('allConfigured');
      expect(result).toHaveProperty('missing');
    });

    it('should detect missing files', () => {
      const result = cicd.checkCICDSetup(tempDir);

      expect(result.allConfigured).toBe(false);
      expect(result.missing.length).toBeGreaterThan(0);
    });

    it('should include checks array', () => {
      const result = cicd.checkCICDSetup(tempDir);

      expect(Array.isArray(result.checks)).toBe(true);
      expect(result.checks.length).toBeGreaterThan(0);
      expect(result.checks[0]).toHaveProperty('name');
      expect(result.checks[0]).toHaveProperty('exists');
      expect(result.checks[0]).toHaveProperty('path');
    });
  });

  describe('formatSetupReport', () => {
    it('should format missing files report', () => {
      const status = {
        checks: [
          { name: 'GitHub Actions workflow', exists: false, path: '.github/workflows/grabby.yml' },
          { name: 'PR template', exists: false, path: '.github/PULL_REQUEST_TEMPLATE.md' },
        ],
        allConfigured: false,
        missing: [
          { name: 'GitHub Actions workflow', exists: false, path: '.github/workflows/grabby.yml' },
          { name: 'PR template', exists: false, path: '.github/PULL_REQUEST_TEMPLATE.md' },
        ],
      };

      const report = cicd.formatSetupReport(status);

      expect(report).toContain('Missing');
    });

    it('should format complete setup report', () => {
      const status = {
        checks: [
          { name: 'GitHub Actions workflow', exists: true, path: '.github/workflows/grabby.yml' },
          { name: 'PR template', exists: true, path: '.github/PULL_REQUEST_TEMPLATE.md' },
        ],
        allConfigured: true,
        missing: [],
      };

      const report = cicd.formatSetupReport(status);

      expect(report.toLowerCase()).toContain('configured');
    });

    it('should include suggestions for missing items', () => {
      const status = {
        checks: [
          { name: 'GitHub Actions workflow', exists: false, path: '.github/workflows/grabby.yml' },
          { name: 'PR template', exists: true, path: '.github/PULL_REQUEST_TEMPLATE.md' },
        ],
        allConfigured: false,
        missing: [
          { name: 'GitHub Actions workflow', exists: false, path: '.github/workflows/grabby.yml' },
        ],
      };

      const report = cicd.formatSetupReport(status);

      expect(report).toContain('grabby cicd');
    });
  });
});
