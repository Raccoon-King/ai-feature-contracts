'use strict';

/**
 * Simple line-based diff for ruleset editor
 * Computes additions, deletions, and unchanged lines
 */

/**
 * Compute diff between two text strings
 * @param {string} oldText - Original text
 * @param {string} newText - Modified text
 * @returns {{ lines: Array<{type: string, content: string}>, stats: {additions: number, deletions: number} }}
 */
function computeDiff(oldText, newText) {
  const oldLines = String(oldText || '').split('\n');
  const newLines = String(newText || '').split('\n');

  const result = {
    lines: [],
    stats: { additions: 0, deletions: 0 },
  };

  // Simple LCS-based diff
  const lcs = computeLCS(oldLines, newLines);

  let oldIndex = 0;
  let newIndex = 0;
  let lcsIndex = 0;

  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    if (lcsIndex < lcs.length && oldIndex < oldLines.length && oldLines[oldIndex] === lcs[lcsIndex]) {
      // Check if new also matches
      if (newIndex < newLines.length && newLines[newIndex] === lcs[lcsIndex]) {
        // Context line (unchanged)
        result.lines.push({ type: 'context', content: oldLines[oldIndex] });
        oldIndex++;
        newIndex++;
        lcsIndex++;
      } else {
        // Addition in new
        result.lines.push({ type: 'add', content: newLines[newIndex] });
        result.stats.additions++;
        newIndex++;
      }
    } else if (lcsIndex < lcs.length && newIndex < newLines.length && newLines[newIndex] === lcs[lcsIndex]) {
      // Deletion from old
      result.lines.push({ type: 'remove', content: oldLines[oldIndex] });
      result.stats.deletions++;
      oldIndex++;
    } else if (oldIndex < oldLines.length && newIndex < newLines.length) {
      // Both differ - show removal then addition
      result.lines.push({ type: 'remove', content: oldLines[oldIndex] });
      result.stats.deletions++;
      oldIndex++;
      result.lines.push({ type: 'add', content: newLines[newIndex] });
      result.stats.additions++;
      newIndex++;
    } else if (oldIndex < oldLines.length) {
      // Remaining deletions
      result.lines.push({ type: 'remove', content: oldLines[oldIndex] });
      result.stats.deletions++;
      oldIndex++;
    } else if (newIndex < newLines.length) {
      // Remaining additions
      result.lines.push({ type: 'add', content: newLines[newIndex] });
      result.stats.additions++;
      newIndex++;
    }
  }

  return result;
}

/**
 * Compute Longest Common Subsequence of lines
 * @param {string[]} a - First array of lines
 * @param {string[]} b - Second array of lines
 * @returns {string[]} LCS lines
 */
function computeLCS(a, b) {
  const m = a.length;
  const n = b.length;

  // Build DP table
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find LCS
  const lcs = [];
  let i = m;
  let j = n;

  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      lcs.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return lcs;
}

/**
 * Render diff to HTML
 * @param {{ lines: Array, stats: object }} diff - Diff result
 * @param {object} options - Render options
 * @returns {string} HTML string
 */
function renderDiffHtml(diff, options = {}) {
  if (!diff || diff.lines.length === 0) {
    return '<div class="empty-state">No changes to display</div>';
  }

  const { showStats = true, contextLines = 3 } = options;

  let html = '';

  if (showStats) {
    html += `<div class="diff-header">
      <div class="diff-stats">
        <span class="additions">+${diff.stats.additions} additions</span>
        <span class="deletions">-${diff.stats.deletions} deletions</span>
      </div>
    </div>`;
  }

  html += '<div class="diff-content">';

  diff.lines.forEach((line) => {
    const prefix = line.type === 'add' ? '+' : (line.type === 'remove' ? '-' : ' ');
    const escaped = escapeHtml(line.content);
    html += `<div class="diff-line diff-${line.type}">${prefix} ${escaped}</div>`;
  });

  html += '</div>';

  return html;
}

/**
 * Escape HTML special characters
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Check if there are any changes between two texts
 * @param {string} oldText
 * @param {string} newText
 * @returns {boolean}
 */
function hasChanges(oldText, newText) {
  return String(oldText || '') !== String(newText || '');
}

// Export for use in app.js
window.RulesDiff = {
  computeDiff,
  renderDiffHtml,
  hasChanges,
  escapeHtml,
};
