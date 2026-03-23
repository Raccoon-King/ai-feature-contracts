'use strict';

const assert = require('node:assert');

// Mock window.RulesDiff for browser code testing
const RulesDiff = {
  computeDiff(oldText, newText) {
    const oldLines = String(oldText || '').split('\n');
    const newLines = String(newText || '').split('\n');
    const lines = [];
    const stats = { additions: 0, deletions: 0 };

    // Simple diff: show all old as deletions, all new as additions if different
    if (oldText === newText) {
      oldLines.forEach((line) => lines.push({ type: 'context', content: line }));
    } else {
      oldLines.forEach((line) => {
        lines.push({ type: 'remove', content: line });
        stats.deletions++;
      });
      newLines.forEach((line) => {
        lines.push({ type: 'add', content: line });
        stats.additions++;
      });
    }

    return { lines, stats };
  },

  hasChanges(oldText, newText) {
    return String(oldText || '') !== String(newText || '');
  },

  renderDiffHtml(diff, options = {}) {
    if (!diff || diff.lines.length === 0) {
      return '<div class="empty-state">No changes to display</div>';
    }

    let html = `<div class="diff-header"><div class="diff-stats">`;
    html += `<span class="additions">+${diff.stats.additions} additions</span>`;
    html += `<span class="deletions">-${diff.stats.deletions} deletions</span>`;
    html += `</div></div>`;
    html += '<div class="diff-content">';

    diff.lines.forEach((line) => {
      const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
      html += `<div class="diff-line diff-${line.type}">${prefix} ${line.content}</div>`;
    });

    html += '</div>';
    return html;
  },

  escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },
};

// Simulate editor state management
function createEditorState() {
  return {
    drafts: [],
    rulesEditorMode: 'edit',
    rulesEditorContent: '',
    rulesEditorOriginal: '',
    rulesEditorSource: null,
    rulesEditorModified: false,
  };
}

function loadRuleIntoEditor(state, source, content) {
  state.rulesEditorSource = source;
  state.rulesEditorOriginal = content;
  state.rulesEditorContent = content;
  state.rulesEditorModified = false;
  return state;
}

function updateRulesEditorContent(state, content) {
  state.rulesEditorContent = content;
  state.rulesEditorModified = RulesDiff.hasChanges(state.rulesEditorOriginal, content);
  return state;
}

function discardRulesEditorChanges(state) {
  state.rulesEditorContent = state.rulesEditorOriginal;
  state.rulesEditorModified = false;
  return state;
}

function clearRulesEditor(state) {
  state.rulesEditorSource = null;
  state.rulesEditorOriginal = '';
  state.rulesEditorContent = '';
  state.rulesEditorModified = false;
  return state;
}

describe('Rules Editor State Management', () => {
  let state;

  beforeEach(() => {
    state = createEditorState();
  });

  describe('createEditorState', () => {
    it('initializes with empty defaults', () => {
      assert.deepStrictEqual(state.drafts, []);
      assert.strictEqual(state.rulesEditorMode, 'edit');
      assert.strictEqual(state.rulesEditorContent, '');
      assert.strictEqual(state.rulesEditorOriginal, '');
      assert.strictEqual(state.rulesEditorSource, null);
      assert.strictEqual(state.rulesEditorModified, false);
    });
  });

  describe('loadRuleIntoEditor', () => {
    it('loads content into editor state', () => {
      const source = { type: 'local', file: 'test.md' };
      const content = '# Test Rule\n\nThis is test content.';

      loadRuleIntoEditor(state, source, content);

      assert.deepStrictEqual(state.rulesEditorSource, source);
      assert.strictEqual(state.rulesEditorOriginal, content);
      assert.strictEqual(state.rulesEditorContent, content);
      assert.strictEqual(state.rulesEditorModified, false);
    });

    it('replaces existing content', () => {
      const source1 = { type: 'local', file: 'old.md' };
      const source2 = { type: 'draft', id: 'draft-1' };
      loadRuleIntoEditor(state, source1, 'old content');
      loadRuleIntoEditor(state, source2, 'new content');

      assert.deepStrictEqual(state.rulesEditorSource, source2);
      assert.strictEqual(state.rulesEditorContent, 'new content');
      assert.strictEqual(state.rulesEditorModified, false);
    });

    it('handles empty content', () => {
      loadRuleIntoEditor(state, { type: 'local', file: 'empty.md' }, '');

      assert.strictEqual(state.rulesEditorContent, '');
      assert.strictEqual(state.rulesEditorOriginal, '');
      assert.strictEqual(state.rulesEditorModified, false);
    });
  });

  describe('updateRulesEditorContent', () => {
    it('marks as modified when content changes', () => {
      loadRuleIntoEditor(state, { type: 'local', file: 'test.md' }, 'original');
      updateRulesEditorContent(state, 'modified');

      assert.strictEqual(state.rulesEditorContent, 'modified');
      assert.strictEqual(state.rulesEditorOriginal, 'original');
      assert.strictEqual(state.rulesEditorModified, true);
    });

    it('does not mark as modified when content matches original', () => {
      loadRuleIntoEditor(state, { type: 'local', file: 'test.md' }, 'original');
      updateRulesEditorContent(state, 'changed');
      updateRulesEditorContent(state, 'original');

      assert.strictEqual(state.rulesEditorContent, 'original');
      assert.strictEqual(state.rulesEditorModified, false);
    });

    it('handles whitespace-only differences', () => {
      loadRuleIntoEditor(state, { type: 'local', file: 'test.md' }, 'line1\nline2');
      updateRulesEditorContent(state, 'line1\nline2\n');

      assert.strictEqual(state.rulesEditorModified, true);
    });
  });

  describe('discardRulesEditorChanges', () => {
    it('reverts content to original', () => {
      loadRuleIntoEditor(state, { type: 'local', file: 'test.md' }, 'original');
      updateRulesEditorContent(state, 'modified');
      discardRulesEditorChanges(state);

      assert.strictEqual(state.rulesEditorContent, 'original');
      assert.strictEqual(state.rulesEditorModified, false);
    });

    it('preserves source after discard', () => {
      const source = { type: 'draft', id: 'draft-1' };
      loadRuleIntoEditor(state, source, 'original');
      updateRulesEditorContent(state, 'modified');
      discardRulesEditorChanges(state);

      assert.deepStrictEqual(state.rulesEditorSource, source);
    });
  });

  describe('clearRulesEditor', () => {
    it('clears all editor state', () => {
      loadRuleIntoEditor(state, { type: 'local', file: 'test.md' }, 'content');
      updateRulesEditorContent(state, 'modified');
      clearRulesEditor(state);

      assert.strictEqual(state.rulesEditorSource, null);
      assert.strictEqual(state.rulesEditorOriginal, '');
      assert.strictEqual(state.rulesEditorContent, '');
      assert.strictEqual(state.rulesEditorModified, false);
    });
  });
});

describe('RulesDiff Module', () => {
  describe('hasChanges', () => {
    it('returns false for identical strings', () => {
      assert.strictEqual(RulesDiff.hasChanges('same', 'same'), false);
    });

    it('returns true for different strings', () => {
      assert.strictEqual(RulesDiff.hasChanges('old', 'new'), true);
    });

    it('handles empty strings', () => {
      assert.strictEqual(RulesDiff.hasChanges('', ''), false);
      assert.strictEqual(RulesDiff.hasChanges('', 'something'), true);
      assert.strictEqual(RulesDiff.hasChanges('something', ''), true);
    });

    it('handles null/undefined values', () => {
      assert.strictEqual(RulesDiff.hasChanges(null, null), false);
      assert.strictEqual(RulesDiff.hasChanges(undefined, undefined), false);
      assert.strictEqual(RulesDiff.hasChanges(null, ''), false);
      assert.strictEqual(RulesDiff.hasChanges(null, 'text'), true);
    });
  });

  describe('computeDiff', () => {
    it('returns context lines for identical content', () => {
      const diff = RulesDiff.computeDiff('line1\nline2', 'line1\nline2');

      assert.strictEqual(diff.stats.additions, 0);
      assert.strictEqual(diff.stats.deletions, 0);
      assert.ok(diff.lines.every((line) => line.type === 'context'));
    });

    it('detects additions and deletions', () => {
      const diff = RulesDiff.computeDiff('old', 'new');

      assert.ok(diff.stats.deletions > 0);
      assert.ok(diff.stats.additions > 0);
    });

    it('handles empty input', () => {
      const diff = RulesDiff.computeDiff('', '');

      assert.strictEqual(diff.stats.additions, 0);
      assert.strictEqual(diff.stats.deletions, 0);
    });

    it('handles new file (empty to content)', () => {
      const diff = RulesDiff.computeDiff('', 'new content');

      assert.ok(diff.stats.additions > 0);
    });

    it('handles file deletion (content to empty)', () => {
      const diff = RulesDiff.computeDiff('old content', '');

      assert.ok(diff.stats.deletions > 0);
    });
  });

  describe('renderDiffHtml', () => {
    it('returns empty state for null diff', () => {
      const html = RulesDiff.renderDiffHtml(null);

      assert.ok(html.includes('No changes to display'));
    });

    it('returns empty state for empty lines', () => {
      const html = RulesDiff.renderDiffHtml({ lines: [], stats: { additions: 0, deletions: 0 } });

      assert.ok(html.includes('No changes to display'));
    });

    it('includes stats header', () => {
      const diff = RulesDiff.computeDiff('old', 'new');
      const html = RulesDiff.renderDiffHtml(diff);

      assert.ok(html.includes('diff-stats'));
      assert.ok(html.includes('additions'));
      assert.ok(html.includes('deletions'));
    });

    it('includes diff lines with correct classes', () => {
      const diff = RulesDiff.computeDiff('old', 'new');
      const html = RulesDiff.renderDiffHtml(diff);

      assert.ok(html.includes('diff-line'));
      assert.ok(html.includes('diff-content'));
    });
  });

  describe('escapeHtml', () => {
    it('escapes HTML special characters', () => {
      const input = '<script>alert("xss")</script>';
      const escaped = RulesDiff.escapeHtml(input);

      assert.ok(!escaped.includes('<'));
      assert.ok(!escaped.includes('>'));
      assert.ok(escaped.includes('&lt;'));
      assert.ok(escaped.includes('&gt;'));
    });

    it('escapes ampersands', () => {
      assert.ok(RulesDiff.escapeHtml('a & b').includes('&amp;'));
    });

    it('escapes quotes', () => {
      const escaped = RulesDiff.escapeHtml('"hello" \'world\'');

      assert.ok(escaped.includes('&quot;'));
      assert.ok(escaped.includes('&#39;'));
    });

    it('handles empty/null input', () => {
      assert.strictEqual(RulesDiff.escapeHtml(''), '');
      assert.strictEqual(RulesDiff.escapeHtml(null), '');
      assert.strictEqual(RulesDiff.escapeHtml(undefined), '');
    });
  });
});

describe('Editor Mode Switching', () => {
  let state;

  beforeEach(() => {
    state = createEditorState();
  });

  it('defaults to edit mode', () => {
    assert.strictEqual(state.rulesEditorMode, 'edit');
  });

  it('can switch to preview mode', () => {
    state.rulesEditorMode = 'preview';
    assert.strictEqual(state.rulesEditorMode, 'preview');
  });

  it('can switch back to edit mode', () => {
    state.rulesEditorMode = 'preview';
    state.rulesEditorMode = 'edit';
    assert.strictEqual(state.rulesEditorMode, 'edit');
  });

  it('preserves content when switching modes', () => {
    loadRuleIntoEditor(state, { type: 'local', file: 'test.md' }, 'content');
    updateRulesEditorContent(state, 'modified content');

    state.rulesEditorMode = 'preview';

    assert.strictEqual(state.rulesEditorContent, 'modified content');
    assert.strictEqual(state.rulesEditorModified, true);
  });
});

describe('Draft Management', () => {
  let state;

  beforeEach(() => {
    state = createEditorState();
  });

  it('initializes with empty drafts array', () => {
    assert.deepStrictEqual(state.drafts, []);
  });

  it('can add drafts to state', () => {
    const draft = {
      id: 'draft-001',
      file: '.grabby/drafts/draft-001.md',
      content: '# Draft\n\nContent here',
      createdAt: new Date().toISOString(),
    };

    state.drafts.push(draft);

    assert.strictEqual(state.drafts.length, 1);
    assert.strictEqual(state.drafts[0].id, 'draft-001');
  });

  it('can load draft into editor', () => {
    const draft = {
      id: 'draft-001',
      file: '.grabby/drafts/draft-001.md',
      content: '# Draft Content',
    };

    loadRuleIntoEditor(
      state,
      { type: 'draft', id: draft.id, file: draft.file },
      draft.content
    );

    assert.strictEqual(state.rulesEditorSource.type, 'draft');
    assert.strictEqual(state.rulesEditorSource.id, 'draft-001');
    assert.strictEqual(state.rulesEditorContent, '# Draft Content');
  });

  it('tracks modification of loaded draft', () => {
    const draft = { id: 'draft-001', content: 'original' };
    loadRuleIntoEditor(state, { type: 'draft', id: draft.id }, draft.content);

    assert.strictEqual(state.rulesEditorModified, false);

    updateRulesEditorContent(state, 'modified');

    assert.strictEqual(state.rulesEditorModified, true);
  });
});

describe('Source Type Handling', () => {
  let state;

  beforeEach(() => {
    state = createEditorState();
  });

  it('handles local source type', () => {
    loadRuleIntoEditor(
      state,
      { type: 'local', file: 'CLAUDE.md', scope: 'local' },
      '# Local Rule'
    );

    assert.strictEqual(state.rulesEditorSource.type, 'local');
    assert.strictEqual(state.rulesEditorSource.file, 'CLAUDE.md');
  });

  it('handles draft source type', () => {
    loadRuleIntoEditor(
      state,
      { type: 'draft', id: 'draft-123', file: '.grabby/drafts/draft-123.md' },
      '# Draft'
    );

    assert.strictEqual(state.rulesEditorSource.type, 'draft');
    assert.strictEqual(state.rulesEditorSource.id, 'draft-123');
  });

  it('handles new source type for generated drafts', () => {
    loadRuleIntoEditor(
      state,
      { type: 'new', id: 'new-draft' },
      '# Newly Generated'
    );

    assert.strictEqual(state.rulesEditorSource.type, 'new');
  });
});
