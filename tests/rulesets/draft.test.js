'use strict';

const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  verifyDraft,
  renderDraft,
  saveDraft,
  listDrafts,
  applyDraft,
  discardDraft,
  DRAFTS_DIR,
} = require('../../lib/rulesets/draft.cjs');

const {
  createDraftPrompt,
  createUpdatePrompt,
  createSuggestionPrompt,
  extractJson,
} = require('../../lib/rulesets/prompts.cjs');

// Test fixture for a valid draft
function createValidDraft(overrides = {}) {
  return {
    metadata: {
      id: 'testing/example-ruleset',
      scope: 'local',
      kind: 'domain',
      priority: 100,
      ...overrides.metadata,
    },
    content: {
      name: 'Example Ruleset',
      purpose: ['Define testing standards'],
      standards: ['Write tests for all features', 'Maintain 80% coverage'],
      securityGates: ['No hardcoded secrets'],
      nonGoals: ['Not for production deployment'],
      references: ['README.md'],
      ...overrides.content,
    },
  };
}

describe('verifyDraft', () => {
  it('should accept a valid draft', () => {
    const draft = createValidDraft();
    const result = verifyDraft(draft);

    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  it('should reject null or non-object input', () => {
    const result = verifyDraft(null);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('valid object')));
  });

  it('should reject missing metadata', () => {
    const draft = { content: { name: 'Test', standards: ['rule'] } };
    const result = verifyDraft(draft);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('metadata object')));
  });

  it('should reject missing metadata.id', () => {
    const draft = createValidDraft();
    delete draft.metadata.id;
    const result = verifyDraft(draft);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('metadata.id')));
  });

  it('should warn on invalid id format', () => {
    const draft = createValidDraft({ metadata: { id: 'invalid_format' } });
    const result = verifyDraft(draft);
    assert.strictEqual(result.valid, true); // Still valid, just a warning
    assert.ok(result.warnings.some(w => w.includes('category/name')));
  });

  it('should reject invalid scope', () => {
    const draft = createValidDraft({ metadata: { scope: 'invalid' } });
    const result = verifyDraft(draft);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('scope')));
  });

  it('should reject invalid kind', () => {
    const draft = createValidDraft({ metadata: { kind: 'invalid' } });
    const result = verifyDraft(draft);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('kind')));
  });

  it('should accept all valid scopes', () => {
    const scopes = ['global', 'local'];
    for (const scope of scopes) {
      const draft = createValidDraft({ metadata: { scope } });
      const result = verifyDraft(draft);
      assert.strictEqual(result.valid, true, `scope ${scope} should be valid`);
    }
  });

  it('should accept all valid kinds', () => {
    const kinds = ['language', 'framework', 'domain', 'policy', 'testing', 'tooling'];
    for (const kind of kinds) {
      const draft = createValidDraft({ metadata: { kind } });
      const result = verifyDraft(draft);
      assert.strictEqual(result.valid, true, `kind ${kind} should be valid`);
    }
  });

  it('should reject missing content', () => {
    const draft = { metadata: { id: 'test/rule', scope: 'local', kind: 'domain' } };
    const result = verifyDraft(draft);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('content object')));
  });

  it('should warn on missing content.name', () => {
    const draft = createValidDraft();
    delete draft.content.name;
    const result = verifyDraft(draft);
    assert.strictEqual(result.valid, true);
    assert.ok(result.warnings.some(w => w.includes('content.name')));
  });

  it('should warn on empty standards array', () => {
    const draft = createValidDraft({ content: { standards: [] } });
    const result = verifyDraft(draft);
    assert.strictEqual(result.valid, true);
    assert.ok(result.warnings.some(w => w.includes('standards')));
  });
});

describe('renderDraft', () => {
  it('should render a draft to markdown with frontmatter', () => {
    const draft = createValidDraft();
    const markdown = renderDraft(draft);

    assert.ok(markdown.includes('---'));
    assert.ok(markdown.includes('id: testing/example-ruleset'));
    assert.ok(markdown.includes('scope: local'));
    assert.ok(markdown.includes('kind: domain'));
    assert.ok(markdown.includes('# RULESET: Example Ruleset'));
    assert.ok(markdown.includes('## Purpose'));
    assert.ok(markdown.includes('## Standards'));
  });

  it('should use id for name if content.name is missing', () => {
    const draft = createValidDraft();
    delete draft.content.name;
    const markdown = renderDraft(draft);

    assert.ok(markdown.includes('# RULESET: example-ruleset'));
  });

  it('should include priority in frontmatter', () => {
    const draft = createValidDraft({ metadata: { priority: 500 } });
    const markdown = renderDraft(draft);

    assert.ok(markdown.includes('priority: 500'));
  });

  it('should include extends in frontmatter', () => {
    const draft = createValidDraft({ metadata: { extends: ['base/core'] } });
    const markdown = renderDraft(draft);

    assert.ok(markdown.includes('extends:'));
    assert.ok(markdown.includes('base/core'));
  });

  it('should include signals in frontmatter', () => {
    const draft = createValidDraft({
      metadata: {
        signals: {
          any: [{ glob: '**/*.test.js', weight: 0.8 }],
        },
      },
    });
    const markdown = renderDraft(draft);

    assert.ok(markdown.includes('signals:'));
  });

  it('should render all content sections', () => {
    const draft = createValidDraft();
    const markdown = renderDraft(draft);

    assert.ok(markdown.includes('## Purpose'));
    assert.ok(markdown.includes('- Define testing standards'));
    assert.ok(markdown.includes('## Standards'));
    assert.ok(markdown.includes('- Write tests for all features'));
    assert.ok(markdown.includes('## Security & Quality Gates'));
    assert.ok(markdown.includes('- No hardcoded secrets'));
    assert.ok(markdown.includes('## Non-Goals'));
    assert.ok(markdown.includes('- Not for production deployment'));
    assert.ok(markdown.includes('## References'));
    assert.ok(markdown.includes('- README.md'));
  });

  it('should skip empty sections', () => {
    const draft = createValidDraft({
      content: {
        name: 'Minimal',
        standards: ['One rule'],
        purpose: [],
        securityGates: [],
        nonGoals: [],
        references: [],
      },
    });
    const markdown = renderDraft(draft);

    assert.ok(!markdown.includes('## Purpose'));
    assert.ok(!markdown.includes('## Security & Quality Gates'));
    assert.ok(!markdown.includes('## Non-Goals'));
    assert.ok(!markdown.includes('## References'));
    assert.ok(markdown.includes('## Standards'));
  });
});

describe('prompts', () => {
  describe('createDraftPrompt', () => {
    it('should create a prompt with goal', () => {
      const prompt = createDraftPrompt({ goal: 'Create TypeScript rules' });

      assert.ok(prompt.includes('Create TypeScript rules'));
      assert.ok(prompt.includes('Generate a JSON object'));
      assert.ok(prompt.includes('metadata'));
      assert.ok(prompt.includes('content'));
    });

    it('should include context if provided', () => {
      const prompt = createDraftPrompt({
        goal: 'Test',
        context: 'Some context from files',
      });

      assert.ok(prompt.includes('CONTEXT FROM EXISTING FILES'));
      assert.ok(prompt.includes('Some context from files'));
    });

    it('should use category if provided', () => {
      const prompt = createDraftPrompt({
        goal: 'Test',
        category: 'languages',
      });

      assert.ok(prompt.includes('languages/ruleset-name'));
    });

    it('should use default category if not provided', () => {
      const prompt = createDraftPrompt({ goal: 'Test' });

      assert.ok(prompt.includes('domain/ruleset-name'));
    });
  });

  describe('createUpdatePrompt', () => {
    it('should create a prompt with existing content', () => {
      const prompt = createUpdatePrompt({
        goal: 'Add security rules',
        existingContent: '# RULESET: Old\n## Standards\n- Old rule',
      });

      assert.ok(prompt.includes('EXISTING RULESET'));
      assert.ok(prompt.includes('# RULESET: Old'));
      assert.ok(prompt.includes('Add security rules'));
    });

    it('should handle missing existing content', () => {
      const prompt = createUpdatePrompt({ goal: 'Update' });

      assert.ok(prompt.includes('(no existing content)'));
    });
  });

  describe('createSuggestionPrompt', () => {
    it('should create a prompt from detections', () => {
      const detections = [
        { id: 'nodejs', name: 'Node.js', reason: 'package.json found' },
        { id: 'typescript', name: 'TypeScript', reason: 'tsconfig.json found' },
      ];
      const prompt = createSuggestionPrompt(detections);

      assert.ok(prompt.includes('Node.js'));
      assert.ok(prompt.includes('TypeScript'));
      assert.ok(prompt.includes('package.json found'));
      assert.ok(prompt.includes('rulesetId'));
    });

    it('should handle empty detections', () => {
      const prompt = createSuggestionPrompt([]);

      assert.ok(prompt.includes('(no technologies detected)'));
    });
  });

  describe('extractJson', () => {
    it('should extract JSON object from plain response', () => {
      const response = '{"key": "value"}';
      const result = extractJson(response);

      assert.deepStrictEqual(result, { key: 'value' });
    });

    it('should extract JSON from markdown code fence', () => {
      const response = '```json\n{"key": "value"}\n```';
      const result = extractJson(response);

      assert.deepStrictEqual(result, { key: 'value' });
    });

    it('should extract JSON from code fence without language', () => {
      const response = '```\n{"key": "value"}\n```';
      const result = extractJson(response);

      assert.deepStrictEqual(result, { key: 'value' });
    });

    it('should extract JSON array', () => {
      const response = '[{"a": 1}, {"b": 2}]';
      const result = extractJson(response);

      assert.deepStrictEqual(result, [{ a: 1 }, { b: 2 }]);
    });

    it('should extract JSON from text with surrounding content', () => {
      const response = 'Here is the ruleset:\n{"metadata": {"id": "test/rule"}}';
      const result = extractJson(response);

      assert.deepStrictEqual(result, { metadata: { id: 'test/rule' } });
    });

    it('should return null for invalid JSON', () => {
      const response = 'not valid json';
      const result = extractJson(response);

      assert.strictEqual(result, null);
    });

    it('should return null for empty input', () => {
      assert.strictEqual(extractJson(''), null);
      assert.strictEqual(extractJson(null), null);
      assert.strictEqual(extractJson(undefined), null);
    });

    it('should handle nested JSON', () => {
      const response = `{
        "metadata": {
          "id": "test/nested",
          "signals": { "any": [{ "glob": "**/*.ts" }] }
        },
        "content": { "name": "Test" }
      }`;
      const result = extractJson(response);

      assert.strictEqual(result.metadata.id, 'test/nested');
      assert.ok(Array.isArray(result.metadata.signals.any));
    });
  });
});

describe('draft file operations', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-draft-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('saveDraft', () => {
    it('should save draft to drafts directory', () => {
      const draft = createValidDraft();
      const markdown = renderDraft(draft);

      const result = saveDraft(draft, markdown, tempDir);

      assert.ok(result.draftPath.includes('.grabby/rulesets/drafts/'));
      assert.ok(result.jsonPath.includes('.grabby/rulesets/drafts/'));
      assert.ok(result.draftPath.endsWith('.md'));
      assert.ok(result.jsonPath.endsWith('.json'));

      // Verify files exist
      const mdPath = path.join(tempDir, result.draftPath);
      const jsonPath = path.join(tempDir, result.jsonPath);
      assert.ok(fs.existsSync(mdPath));
      assert.ok(fs.existsSync(jsonPath));

      // Verify content
      const savedMd = fs.readFileSync(mdPath, 'utf8');
      const savedJson = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      assert.strictEqual(savedMd, markdown);
      assert.strictEqual(savedJson.metadata.id, 'testing/example-ruleset');
    });

    it('should create unique filenames with timestamps', () => {
      const draft = createValidDraft();
      const markdown = renderDraft(draft);

      const result1 = saveDraft(draft, markdown, tempDir);
      const result2 = saveDraft(draft, markdown, tempDir);

      assert.notStrictEqual(result1.draftPath, result2.draftPath);
    });
  });

  describe('listDrafts', () => {
    it('should return empty array when no drafts exist', () => {
      const drafts = listDrafts(tempDir);
      assert.deepStrictEqual(drafts, []);
    });

    it('should list all drafts', () => {
      const draft1 = createValidDraft({ metadata: { id: 'test/one' } });
      const draft2 = createValidDraft({ metadata: { id: 'test/two' } });

      saveDraft(draft1, renderDraft(draft1), tempDir);
      saveDraft(draft2, renderDraft(draft2), tempDir);

      const drafts = listDrafts(tempDir);

      assert.strictEqual(drafts.length, 2);
      assert.ok(drafts.some(d => d.id === 'test/one'));
      assert.ok(drafts.some(d => d.id === 'test/two'));
    });

    it('should include metadata for each draft', () => {
      const draft = createValidDraft();
      saveDraft(draft, renderDraft(draft), tempDir);

      const drafts = listDrafts(tempDir);

      assert.strictEqual(drafts.length, 1);
      assert.strictEqual(drafts[0].id, 'testing/example-ruleset');
      assert.ok(drafts[0].file.endsWith('.md'));
      assert.ok(drafts[0].jsonFile.endsWith('.json'));
      assert.ok(drafts[0].createdAt);
    });
  });

  describe('applyDraft', () => {
    it('should move draft to shared directory', () => {
      const draft = createValidDraft();
      const markdown = renderDraft(draft);
      const saved = saveDraft(draft, markdown, tempDir);

      const result = applyDraft(path.basename(saved.draftPath), tempDir);

      assert.ok(result.appliedTo.includes('.grabby/rulesets/shared/'));

      // Original draft should be removed
      assert.ok(!fs.existsSync(path.join(tempDir, saved.draftPath)));
      assert.ok(!fs.existsSync(path.join(tempDir, saved.jsonPath)));

      // Applied file should exist
      assert.ok(fs.existsSync(path.join(tempDir, result.appliedTo)));
    });

    it('should throw error for non-existent draft', () => {
      assert.throws(() => {
        applyDraft('nonexistent.md', tempDir);
      }, /Draft not found/);
    });

    it('should use ruleset id for target filename', () => {
      const draft = createValidDraft({ metadata: { id: 'languages/typescript' } });
      const markdown = renderDraft(draft);
      const saved = saveDraft(draft, markdown, tempDir);

      const result = applyDraft(path.basename(saved.draftPath), tempDir);

      assert.ok(result.appliedTo.includes('languages-typescript.md'));
    });
  });

  describe('discardDraft', () => {
    it('should remove draft files', () => {
      const draft = createValidDraft();
      const markdown = renderDraft(draft);
      const saved = saveDraft(draft, markdown, tempDir);

      const mdPath = path.join(tempDir, saved.draftPath);
      const jsonPath = path.join(tempDir, saved.jsonPath);

      assert.ok(fs.existsSync(mdPath));
      assert.ok(fs.existsSync(jsonPath));

      discardDraft(path.basename(saved.draftPath), tempDir);

      assert.ok(!fs.existsSync(mdPath));
      assert.ok(!fs.existsSync(jsonPath));
    });

    it('should not throw for non-existent draft', () => {
      // Should not throw
      discardDraft('nonexistent.md', tempDir);
    });
  });
});

describe('integration: verify -> render -> save -> apply flow', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-draft-integration-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should complete full draft workflow', () => {
    // 1. Create draft
    const draft = createValidDraft({
      metadata: { id: 'workflow/integration-test' },
      content: {
        name: 'Integration Test Ruleset',
        standards: ['Test all edge cases', 'Document behavior'],
      },
    });

    // 2. Verify draft
    const verification = verifyDraft(draft);
    assert.strictEqual(verification.valid, true);

    // 3. Render to markdown
    const markdown = renderDraft(draft);
    assert.ok(markdown.includes('# RULESET: Integration Test Ruleset'));

    // 4. Save draft
    const saved = saveDraft(draft, markdown, tempDir);
    assert.ok(saved.draftPath);

    // 5. List drafts
    const drafts = listDrafts(tempDir);
    assert.strictEqual(drafts.length, 1);
    assert.strictEqual(drafts[0].id, 'workflow/integration-test');

    // 6. Apply draft
    const applied = applyDraft(path.basename(saved.draftPath), tempDir);
    assert.ok(applied.appliedTo.includes('shared'));

    // 7. Verify draft is removed
    const remainingDrafts = listDrafts(tempDir);
    assert.strictEqual(remainingDrafts.length, 0);

    // 8. Verify applied file content
    const appliedContent = fs.readFileSync(path.join(tempDir, applied.appliedTo), 'utf8');
    assert.ok(appliedContent.includes('workflow/integration-test'));
    assert.ok(appliedContent.includes('Test all edge cases'));
  });
});
