const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  setAuthoringContext,
  isAuthoringContext,
  getProtectedRulesPath,
  getDefaultProtectedPath,
  isProtectedRulesPath,
  assertWriteAllowed,
  getGuidanceSources,
  discoverGuidanceFiles,
  generateSharedRules,
  updateSharedRules,
  listSharedRulesets,
  isAuthoringEnabled,
  buildGeneratePrompt,
  buildUpdatePrompt,
  createFallbackSharedRuleset,
  slugifyTitle,
} = require('../lib/rules-authoring.cjs');

describe('Rules Authoring Module', function () {
  let tempDir;

  beforeEach(function () {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rules-authoring-test-'));
    // Reset authoring context
    setAuthoringContext(false);
  });

  afterEach(function () {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
    // Reset authoring context
    setAuthoringContext(false);
  });

  describe('Authoring Context', function () {
    it('should default to false', function () {
      assert.strictEqual(isAuthoringContext(), false);
    });

    it('should allow setting authoring context to true', function () {
      setAuthoringContext(true);
      assert.strictEqual(isAuthoringContext(), true);
    });

    it('should allow setting authoring context back to false', function () {
      setAuthoringContext(true);
      setAuthoringContext(false);
      assert.strictEqual(isAuthoringContext(), false);
    });
  });

  describe('Protected Path Detection', function () {
    it('should return default protected path', function () {
      const expected = path.join(tempDir, '.grabby', 'rulesets', 'shared');
      assert.strictEqual(getDefaultProtectedPath(tempDir), expected);
    });

    it('should detect paths within protected directory', function () {
      const protectedPath = getProtectedRulesPath(tempDir);
      const testPath = path.join(protectedPath, 'test.ruleset.md');
      assert.strictEqual(isProtectedRulesPath(testPath, tempDir), true);
    });

    it('should detect protected directory itself', function () {
      const protectedPath = getProtectedRulesPath(tempDir);
      assert.strictEqual(isProtectedRulesPath(protectedPath, tempDir), true);
    });

    it('should not detect paths outside protected directory', function () {
      const outsidePath = path.join(tempDir, 'contracts', 'test.fc.md');
      assert.strictEqual(isProtectedRulesPath(outsidePath, tempDir), false);
    });

    it('should handle relative paths', function () {
      const relativePath = '.grabby/rulesets/shared/test.md';
      assert.strictEqual(isProtectedRulesPath(relativePath, tempDir), true);
    });
  });

  describe('Write Boundary Enforcement', function () {
    it('should throw when writing to protected path without authoring context', function () {
      const protectedPath = path.join(getProtectedRulesPath(tempDir), 'test.md');
      assert.throws(
        () => assertWriteAllowed(protectedPath, tempDir, 'write'),
        /Cannot write to protected shared rules path/
      );
    });

    it('should not throw when authoring context is enabled', function () {
      setAuthoringContext(true);
      const protectedPath = path.join(getProtectedRulesPath(tempDir), 'test.md');
      assert.doesNotThrow(() => assertWriteAllowed(protectedPath, tempDir, 'write'));
    });

    it('should not throw for non-protected paths', function () {
      const normalPath = path.join(tempDir, 'contracts', 'test.md');
      assert.doesNotThrow(() => assertWriteAllowed(normalPath, tempDir, 'write'));
    });

    it('should include helpful error message', function () {
      const protectedPath = path.join(getProtectedRulesPath(tempDir), 'test.md');
      try {
        assertWriteAllowed(protectedPath, tempDir, 'modify');
        assert.fail('Should have thrown');
      } catch (error) {
        assert.ok(error.message.includes('grabby rules generate'));
        assert.ok(error.message.includes('grabby rules update'));
      }
    });
  });

  describe('Guidance Sources', function () {
    it('should return default guidance sources', function () {
      const sources = getGuidanceSources(tempDir);
      assert.ok(Array.isArray(sources));
      assert.ok(sources.includes('AGENTS.md'));
      assert.ok(sources.includes('docs'));
      assert.ok(sources.includes('README.md'));
    });

    it('should use configured sources if available', function () {
      // Create config with custom sources
      const configPath = path.join(tempDir, 'grabby.config.json');
      fs.writeFileSync(configPath, JSON.stringify({
        rulesets: {
          authoring: {
            guidanceSources: ['custom.md', 'rules/']
          }
        }
      }));

      const sources = getGuidanceSources(tempDir);
      assert.deepStrictEqual(sources, ['custom.md', 'rules/']);
    });
  });

  describe('Guidance File Discovery', function () {
    it('should discover AGENTS.md if present', function () {
      fs.writeFileSync(path.join(tempDir, 'AGENTS.md'), '# Agents\n');
      const files = discoverGuidanceFiles(tempDir);
      assert.ok(files.includes('AGENTS.md'));
    });

    it('should discover README.md if present', function () {
      fs.writeFileSync(path.join(tempDir, 'README.md'), '# Project\n');
      const files = discoverGuidanceFiles(tempDir);
      assert.ok(files.includes('README.md'));
    });

    it('should return empty array if no guidance files', function () {
      const files = discoverGuidanceFiles(tempDir);
      assert.ok(Array.isArray(files));
      // May be empty or contain defaults
    });
  });

  describe('slugifyTitle', function () {
    it('should convert title to slug', function () {
      assert.strictEqual(slugifyTitle('My Project Rules'), 'my-project-rules');
    });

    it('should handle special characters', function () {
      assert.strictEqual(slugifyTitle('Rules & Guidelines!'), 'rules-guidelines');
    });

    it('should handle empty string', function () {
      assert.strictEqual(slugifyTitle(''), 'shared-rules');
    });

    it('should handle null/undefined', function () {
      assert.strictEqual(slugifyTitle(null), 'shared-rules');
      assert.strictEqual(slugifyTitle(undefined), 'shared-rules');
    });
  });

  describe('createFallbackSharedRuleset', function () {
    it('should create a valid ruleset structure', function () {
      const result = createFallbackSharedRuleset({
        title: 'Test Rules',
        goal: 'Test governance',
        references: ['README.md', 'docs/guide.md']
      });

      assert.ok(result.includes('# SHARED RULESET: Test Rules'));
      assert.ok(result.includes('## Purpose'));
      assert.ok(result.includes('## Standards'));
      assert.ok(result.includes('## Quality Gates'));
      assert.ok(result.includes('## Security Requirements'));
      assert.ok(result.includes('## Non-Goals'));
      assert.ok(result.includes('## Source References'));
      assert.ok(result.includes('README.md'));
      assert.ok(result.includes('docs/guide.md'));
    });

    it('should handle empty references', function () {
      const result = createFallbackSharedRuleset({
        title: 'Test',
        goal: 'Test',
        references: []
      });

      assert.ok(result.includes('- None'));
    });
  });

  describe('buildGeneratePrompt', function () {
    it('should include goal in prompt', function () {
      const prompt = buildGeneratePrompt('Create API rules', 'API documentation content');
      assert.ok(prompt.includes('Create API rules'));
    });

    it('should include context summary', function () {
      const prompt = buildGeneratePrompt('Goal', 'Repository guidance content here');
      assert.ok(prompt.includes('Repository guidance content here'));
    });

    it('should handle empty context', function () {
      const prompt = buildGeneratePrompt('Goal', '');
      assert.ok(prompt.includes('(none provided)'));
    });
  });

  describe('buildUpdatePrompt', function () {
    it('should include existing content', function () {
      const prompt = buildUpdatePrompt('# Existing', 'Add more rules', 'New context');
      assert.ok(prompt.includes('# Existing'));
    });

    it('should include update goal', function () {
      const prompt = buildUpdatePrompt('Content', 'Add security rules', '');
      assert.ok(prompt.includes('Add security rules'));
    });
  });

  describe('listSharedRulesets', function () {
    it('should return empty array if protected path does not exist', function () {
      const rulesets = listSharedRulesets(tempDir);
      assert.deepStrictEqual(rulesets, []);
    });

    it('should list rulesets in protected path', function () {
      const protectedPath = getProtectedRulesPath(tempDir);
      fs.mkdirSync(protectedPath, { recursive: true });
      fs.writeFileSync(path.join(protectedPath, 'test.ruleset.md'), '# Test');

      const rulesets = listSharedRulesets(tempDir);
      assert.strictEqual(rulesets.length, 1);
      assert.strictEqual(rulesets[0].name, 'test');
    });

    it('should only include .ruleset.md files', function () {
      const protectedPath = getProtectedRulesPath(tempDir);
      fs.mkdirSync(protectedPath, { recursive: true });
      fs.writeFileSync(path.join(protectedPath, 'test.ruleset.md'), '# Test');
      fs.writeFileSync(path.join(protectedPath, 'other.md'), '# Other');
      fs.writeFileSync(path.join(protectedPath, 'readme.txt'), 'readme');

      const rulesets = listSharedRulesets(tempDir);
      assert.strictEqual(rulesets.length, 1);
    });
  });

  describe('isAuthoringEnabled', function () {
    it('should return true by default', function () {
      assert.strictEqual(isAuthoringEnabled(tempDir), true);
    });

    it('should respect config setting', function () {
      const configPath = path.join(tempDir, 'grabby.config.json');
      fs.writeFileSync(configPath, JSON.stringify({
        rulesets: {
          authoring: {
            enabled: false
          }
        }
      }));

      assert.strictEqual(isAuthoringEnabled(tempDir), false);
    });
  });

  describe('generateSharedRules', function () {
    it('should create ruleset in protected path', async function () {
      // Create a minimal guidance file
      fs.writeFileSync(path.join(tempDir, 'README.md'), '# Test Project\n\nThis is a test.');

      const result = await generateSharedRules({
        cwd: tempDir,
        title: 'Test Project Rules',
        logger: { log: () => {} }
      });

      assert.ok(result.path);
      assert.ok(fs.existsSync(result.path));
      assert.ok(result.path.includes('.grabby'));
      assert.ok(result.path.includes('shared'));
    });

    it('should include content in result', async function () {
      const result = await generateSharedRules({
        cwd: tempDir,
        title: 'Test Rules',
        goal: 'Test governance',
        logger: { log: () => {} }
      });

      assert.ok(result.content);
      assert.ok(result.content.includes('SHARED RULESET'));
    });
  });

  describe('updateSharedRules', function () {
    it('should throw if no ruleset exists', async function () {
      try {
        await updateSharedRules({
          cwd: tempDir,
          logger: { log: () => {} }
        });
        assert.fail('Should have thrown');
      } catch (error) {
        assert.ok(error.message.includes('does not exist') || error.message.includes('No rulesets found'));
      }
    });

    it('should update existing ruleset', async function () {
      // First create a ruleset
      const protectedPath = getProtectedRulesPath(tempDir);
      fs.mkdirSync(protectedPath, { recursive: true });
      const rulesetPath = path.join(protectedPath, 'test.ruleset.md');
      fs.writeFileSync(rulesetPath, '# SHARED RULESET: Test\n\n## Purpose\n- Original');

      const result = await updateSharedRules({
        cwd: tempDir,
        goal: 'Add more rules',
        logger: { log: () => {} }
      });

      assert.ok(result.updated);
      assert.ok(fs.existsSync(result.path));
    });
  });
});
