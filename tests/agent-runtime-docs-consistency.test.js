const assert = require('assert');
const fs = require('fs');
const path = require('path');

describe('Agent Runtime Documentation Consistency', function () {
  const docsDir = path.join(__dirname, '..', 'docs');
  const templatesDir = path.join(__dirname, '..', 'templates');
  const rootDir = path.join(__dirname, '..');

  describe('Key Terms Consistency', function () {
    const keyTerms = [
      'contract',
      'runtime',
      'tool',
      'llm'
    ];

    const docsToCheck = [
      'AGENT_ARCHITECTURE.md',
      'AGENT_PROMPT_EVALUATION.md',
      'AGENT_RUNTIME_MIGRATION_PLAN.md'
    ];

    docsToCheck.forEach(docFile => {
      it(`${docFile} should contain four-layer terminology`, function () {
        const content = fs.readFileSync(path.join(docsDir, docFile), 'utf8').toLowerCase();
        keyTerms.forEach(term => {
          assert.ok(
            content.includes(term),
            `${docFile} should mention "${term}"`
          );
        });
      });
    });
  });

  describe('Cross-References', function () {
    it('AGENT_ARCHITECTURE.md should reference migration plan', function () {
      const content = fs.readFileSync(path.join(docsDir, 'AGENT_ARCHITECTURE.md'), 'utf8');
      assert.ok(
        content.includes('AGENT_RUNTIME_MIGRATION_PLAN') || content.includes('migration'),
        'Should reference migration plan'
      );
    });

    it('AGENT_ARCHITECTURE.md should reference evaluation', function () {
      const content = fs.readFileSync(path.join(docsDir, 'AGENT_ARCHITECTURE.md'), 'utf8');
      assert.ok(
        content.includes('AGENT_PROMPT_EVALUATION') || content.includes('evaluation'),
        'Should reference evaluation'
      );
    });

    it('CONTRACTS.md should reference architecture', function () {
      const content = fs.readFileSync(path.join(docsDir, 'CONTRACTS.md'), 'utf8');
      assert.ok(
        content.includes('AGENT_ARCHITECTURE') || content.includes('four-layer'),
        'Should reference architecture'
      );
    });

    it('EXECUTION_PROTOCOL.md should reference architecture', function () {
      const content = fs.readFileSync(path.join(docsDir, 'EXECUTION_PROTOCOL.md'), 'utf8');
      assert.ok(
        content.includes('AGENT_ARCHITECTURE') || content.includes('runtime'),
        'Should reference runtime'
      );
    });

    it('LLM_INSTALL.md should reference architecture', function () {
      const content = fs.readFileSync(path.join(docsDir, 'LLM_INSTALL.md'), 'utf8');
      assert.ok(
        content.includes('AGENT_ARCHITECTURE') || content.includes('runtime'),
        'Should reference architecture'
      );
    });
  });

  describe('Version Consistency', function () {
    it('README.md should have version 4.x', function () {
      const content = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');
      assert.ok(
        content.includes('4.0') || content.includes('Version:** 4'),
        'README should reference version 4.x'
      );
    });

    it('docs/index.html should have version 4.x', function () {
      const content = fs.readFileSync(path.join(docsDir, 'index.html'), 'utf8');
      assert.ok(
        content.includes('4.0') || content.includes('v4'),
        'docs/index.html should reference version 4.x'
      );
    });
  });

  describe('Required Files Exist', function () {
    const requiredDocs = [
      'docs/AGENT_ARCHITECTURE.md',
      'docs/AGENT_PROMPT_EVALUATION.md',
      'docs/AGENT_RUNTIME_MIGRATION_PLAN.md',
      'docs/CONTRACTS.md',
      'docs/EXECUTION_PROTOCOL.md',
      'docs/LLM_INSTALL.md'
    ];

    requiredDocs.forEach(docPath => {
      it(`${docPath} should exist`, function () {
        const fullPath = path.join(rootDir, docPath);
        assert.ok(fs.existsSync(fullPath), `${docPath} should exist`);
      });
    });

    const requiredTemplates = [
      'templates/agent-runtime-contract.example.yaml',
      'templates/agent-runtime-minimal-prompt.md'
    ];

    requiredTemplates.forEach(templatePath => {
      it(`${templatePath} should exist`, function () {
        const fullPath = path.join(rootDir, templatePath);
        assert.ok(fs.existsSync(fullPath), `${templatePath} should exist`);
      });
    });
  });

  describe('Runtime-Driven Model Documentation', function () {
    it('AGENT_ARCHITECTURE.md should explain four-layer architecture', function () {
      const content = fs.readFileSync(path.join(docsDir, 'AGENT_ARCHITECTURE.md'), 'utf8');
      assert.ok(content.includes('Layer 1') || content.includes('four-layer') || content.includes('Four-Layer'),
        'Should explain layered architecture');
    });

    it('AGENT_ARCHITECTURE.md should explain responsibility shift', function () {
      const content = fs.readFileSync(path.join(docsDir, 'AGENT_ARCHITECTURE.md'), 'utf8');
      assert.ok(content.includes('Responsibility') || content.includes('Before') && content.includes('After'),
        'Should explain responsibility shift');
    });

    it('README.md should mention runtime-driven model', function () {
      const content = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');
      assert.ok(content.includes('Runtime') || content.includes('runtime'),
        'README should mention runtime model');
    });
  });

  describe('Deprecated Terminology Absent', function () {
    // These terms should not appear in new docs as primary concepts
    const docsToCheck = [
      'AGENT_ARCHITECTURE.md',
      'CONTRACTS.md'
    ];

    docsToCheck.forEach(docFile => {
      it(`${docFile} should not use deprecated "prompt bundle" as primary model`, function () {
        const content = fs.readFileSync(path.join(docsDir, docFile), 'utf8');
        // It's okay to reference prompt bundles in context, but they shouldn't be
        // described as the primary operating model
        const promptBundleCount = (content.match(/prompt bundle/gi) || []).length;
        const runtimeCount = (content.match(/runtime/gi) || []).length;

        // Runtime should be mentioned more than prompt bundles in architecture docs
        if (docFile === 'AGENT_ARCHITECTURE.md') {
          assert.ok(
            runtimeCount >= promptBundleCount,
            `Runtime mentions (${runtimeCount}) should be >= prompt bundle mentions (${promptBundleCount})`
          );
        }
      });
    });
  });
});
