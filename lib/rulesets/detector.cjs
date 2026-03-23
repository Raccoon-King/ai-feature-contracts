/**
 * Detector - Repo signal detection for proposing candidate rulesets
 * Scans repository for technology signals and proposes applicable rulesets
 */

const fs = require('fs');
const path = require('path');
const {
  TECHNOLOGY_SIGNALS,
  DEFAULT_EXCLUDE,
  checkSignal,
  calculateConfidence,
} = require('./signals.cjs');

/**
 * Recursively collect all files in a directory
 * @param {string} dir - Directory to scan
 * @param {string} cwd - Base working directory
 * @param {string[]} exclude - Directories to exclude
 * @param {number} maxDepth - Maximum directory depth
 * @param {number} currentDepth - Current depth
 * @returns {string[]} List of relative file paths
 */
function collectFiles(dir, cwd, exclude = DEFAULT_EXCLUDE, maxDepth = 5, currentDepth = 0) {
  if (currentDepth > maxDepth) return [];

  const files = [];
  let entries;

  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(cwd, fullPath).replace(/\\/g, '/');

    // Skip excluded directories
    if (entry.isDirectory()) {
      if (exclude.includes(entry.name)) continue;
      files.push(...collectFiles(fullPath, cwd, exclude, maxDepth, currentDepth + 1));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

/**
 * Detect technology signals in a repository
 * @param {string} cwd - Working directory to scan
 * @param {object} options - Detection options
 * @param {string[]} options.exclude - Additional directories to exclude
 * @param {number} options.maxDepth - Maximum scan depth
 * @returns {object[]} Detected signals with confidence scores
 */
function detectSignals(cwd, options = {}) {
  const exclude = [...DEFAULT_EXCLUDE, ...(options.exclude || [])];
  const maxDepth = options.maxDepth || 5;

  // Collect all files
  const files = collectFiles(cwd, cwd, exclude, maxDepth);
  const detections = [];

  // Check each technology's signals
  for (const [techKey, tech] of Object.entries(TECHNOLOGY_SIGNALS)) {
    const matchedSignals = new Map();
    const allMatches = [];

    for (let i = 0; i < tech.signals.length; i++) {
      const signal = tech.signals[i];
      const { matched, matches } = checkSignal(signal, cwd, files);

      if (matched) {
        matchedSignals.set(i, matches);
        allMatches.push(...matches);
      }
    }

    if (matchedSignals.size > 0) {
      const confidence = calculateConfidence(tech.signals, matchedSignals);

      detections.push({
        key: techKey,
        id: tech.id,
        name: tech.name,
        confidence,
        matches: allMatches.slice(0, 5), // Limit to first 5 matches
        matchCount: allMatches.length,
      });
    }
  }

  // Sort by confidence (descending)
  detections.sort((a, b) => b.confidence - a.confidence);

  return detections;
}

/**
 * Propose rulesets based on detected signals
 * @param {string} cwd - Working directory
 * @param {object} options - Detection options
 * @param {number} options.minConfidence - Minimum confidence threshold (default: 0.5)
 * @returns {object[]} Proposed rulesets with reasons
 */
function proposeRulesets(cwd, options = {}) {
  const minConfidence = options.minConfidence || 0.5;
  const detections = detectSignals(cwd, options);

  const proposals = [];
  const seenIds = new Set();

  for (const detection of detections) {
    if (detection.confidence < minConfidence) continue;
    if (seenIds.has(detection.id)) continue;

    seenIds.add(detection.id);

    const matchSummary = detection.matches.slice(0, 3).join(', ');
    const reason = `Found ${matchSummary}${detection.matchCount > 3 ? ` (+${detection.matchCount - 3} more)` : ''}`;

    proposals.push({
      rulesetId: detection.id,
      name: detection.name,
      confidence: Math.round(detection.confidence * 100),
      reason,
    });
  }

  return proposals;
}

/**
 * Format detection results for CLI output
 * @param {object[]} proposals - Proposed rulesets
 * @returns {string} Formatted output
 */
function formatProposals(proposals) {
  if (proposals.length === 0) {
    return 'No technologies detected. Try adding project files or lowering the confidence threshold.';
  }

  const lines = ['Detected technologies:', ''];

  for (const proposal of proposals) {
    const confidence = proposal.confidence >= 80 ? '✓' : proposal.confidence >= 60 ? '~' : '?';
    lines.push(`  ${confidence} ${proposal.name} (confidence: ${proposal.confidence}%)`);
    lines.push(`    ${proposal.reason}`);
    lines.push('');
  }

  lines.push('Proposed rulesets:');
  for (let i = 0; i < proposals.length; i++) {
    lines.push(`  ${i + 1}. ${proposals[i].rulesetId}`);
  }

  lines.push('');
  lines.push("Run 'grabby rules activate <ruleset>' to add a ruleset.");

  return lines.join('\n');
}

/**
 * Get detection results as structured data (for API/dashboard)
 * @param {string} cwd - Working directory
 * @param {object} options - Detection options
 * @returns {object} Detection results
 */
function getDetectionResults(cwd, options = {}) {
  const signals = detectSignals(cwd, options);
  const proposals = proposeRulesets(cwd, options);

  return {
    signals,
    proposals,
    scannedAt: new Date().toISOString(),
  };
}

module.exports = {
  collectFiles,
  detectSignals,
  proposeRulesets,
  formatProposals,
  getDetectionResults,
};
