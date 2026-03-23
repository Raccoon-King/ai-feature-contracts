/**
 * Merger - Rule composition and conflict detection
 * Merges standards from multiple rulesets with precedence handling
 */

/**
 * Extract bullet points from markdown section
 * @param {string} content - Markdown content
 * @param {string} sectionName - Section name to extract
 * @returns {string[]}
 */
function extractSection(content, sectionName) {
  const pattern = new RegExp(`##\\s+${sectionName}[^\\n]*\\n([\\s\\S]*?)(?=\\n##|\\n#\\s|$)`, 'i');
  const match = content.match(pattern);

  if (!match) return [];

  return match[1]
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('-') || line.startsWith('*'))
    .map(line => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
}

/**
 * Create a unique key for a standard (for conflict detection)
 * @param {string} standard - Standard text
 * @returns {string}
 */
function standardKey(standard) {
  // Use first few words as key, normalized
  return standard
    .toLowerCase()
    .split(/[:\-,]/)
    [0]
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .slice(0, 3)
    .join('-');
}

/**
 * Evaluate appliesWhen conditions against context
 * @param {object} appliesWhen - Conditions object
 * @param {object} context - Current context
 * @returns {boolean}
 */
function evaluateConditions(appliesWhen, context = {}) {
  if (!appliesWhen) return true;

  const conditions = appliesWhen.any || appliesWhen.all || [];
  if (conditions.length === 0) return true;

  const mode = appliesWhen.any ? 'any' : 'all';

  const results = conditions.map(cond => {
    if (cond.pathPrefix && context.path) {
      return context.path.startsWith(cond.pathPrefix);
    }
    if (cond.repoSignal && context.signals) {
      return context.signals.includes(cond.repoSignal);
    }
    if (cond.hasFile && context.files) {
      return context.files.includes(cond.hasFile);
    }
    if (cond.notHasFile && context.files) {
      return !context.files.includes(cond.notHasFile);
    }
    return false;
  });

  return mode === 'any'
    ? results.some(r => r)
    : results.every(r => r);
}

/**
 * Merge resolved rulesets into effective rules
 * @param {object[]} rulesets - Rulesets in resolution order (low to high priority)
 * @param {object} context - Current context for appliesWhen evaluation
 * @returns {object} Merged effective rules
 */
function mergeRulesets(rulesets, context = {}) {
  const effective = {
    standards: new Map(),
    securityGates: new Map(),
    purpose: [],
    nonGoals: [],
    references: [],
    sources: [],
    conflicts: [],
  };

  for (const ruleset of rulesets) {
    // Check appliesWhen conditions
    if (!evaluateConditions(ruleset.metadata?.appliesWhen, context)) {
      continue;
    }

    // Extract sections from content
    const standards = extractSection(ruleset.content, 'Standards?');
    const security = extractSection(ruleset.content, 'Security');
    const purpose = extractSection(ruleset.content, 'Purpose');
    const nonGoals = extractSection(ruleset.content, 'Non-?Goals?');
    const refs = extractSection(ruleset.content, 'References?');

    // Merge standards (higher priority overrides)
    for (const standard of standards) {
      const key = standardKey(standard);
      const existing = effective.standards.get(key);

      if (existing && existing.source !== ruleset.id) {
        effective.conflicts.push({
          field: 'standards',
          key,
          from: existing.source,
          to: ruleset.id,
          oldValue: existing.value,
          newValue: standard,
          resolution: 'override',
        });
      }

      effective.standards.set(key, {
        value: standard,
        source: ruleset.id,
        priority: ruleset.priority,
      });
    }

    // Merge security gates
    for (const gate of security) {
      const key = standardKey(gate);
      const existing = effective.securityGates.get(key);

      if (existing && existing.source !== ruleset.id) {
        effective.conflicts.push({
          field: 'securityGates',
          key,
          from: existing.source,
          to: ruleset.id,
          oldValue: existing.value,
          newValue: gate,
          resolution: 'override',
        });
      }

      effective.securityGates.set(key, {
        value: gate,
        source: ruleset.id,
        priority: ruleset.priority,
      });
    }

    // Accumulate purpose, nonGoals, references (additive)
    effective.purpose.push(...purpose.map(p => ({ value: p, source: ruleset.id })));
    effective.nonGoals.push(...nonGoals.map(n => ({ value: n, source: ruleset.id })));
    effective.references.push(...refs.map(r => ({ value: r, source: ruleset.id })));

    effective.sources.push(ruleset.id);
  }

  // Convert maps to arrays
  return {
    standards: Array.from(effective.standards.values()),
    securityGates: Array.from(effective.securityGates.values()),
    purpose: effective.purpose,
    nonGoals: effective.nonGoals,
    references: effective.references,
    sources: effective.sources,
    conflicts: effective.conflicts,
  };
}

/**
 * Format effective rules for CLI output
 * @param {object} effective - Merged effective rules
 * @param {object} options - Formatting options
 * @returns {string}
 */
function formatEffectiveRules(effective, options = {}) {
  const lines = [];
  const verbose = options.verbose || false;

  if (effective.sources.length === 0) {
    return 'No applicable rulesets found.';
  }

  lines.push('Resolution chain:');
  effective.sources.forEach((source, i) => {
    lines.push(`  ${i + 1}. ${source}`);
  });
  lines.push('');

  if (effective.standards.length > 0) {
    lines.push('Standards:');
    for (const std of effective.standards) {
      const conflict = effective.conflicts.find(c => c.field === 'standards' && c.to === std.source && c.newValue === std.value);
      const indicator = conflict ? '\u26a0' : '\u2713';
      lines.push(`  ${indicator} ${std.value} (from: ${std.source})`);
      if (verbose && conflict) {
        lines.push(`    \u2192 Overrides: "${conflict.oldValue}" from ${conflict.from}`);
      }
    }
    lines.push('');
  }

  if (effective.securityGates.length > 0) {
    lines.push('Security Gates:');
    for (const gate of effective.securityGates) {
      lines.push(`  \u2713 ${gate.value}`);
    }
    lines.push('');
  }

  if (effective.conflicts.length > 0 && verbose) {
    lines.push(`Conflicts: ${effective.conflicts.length} (resolved by priority)`);
  }

  return lines.join('\n');
}

/**
 * Get effective rules for API response
 * @param {object[]} rulesets - Resolved rulesets
 * @param {object} context - Context for evaluation
 * @returns {object}
 */
function getEffectiveRules(rulesets, context = {}) {
  const merged = mergeRulesets(rulesets, context);

  return {
    context,
    resolution: {
      chain: merged.sources,
      effective: {
        standards: merged.standards,
        securityGates: merged.securityGates,
        purpose: merged.purpose,
        nonGoals: merged.nonGoals,
      },
      conflicts: merged.conflicts,
    },
  };
}

module.exports = {
  mergeRulesets,
  evaluateConditions,
  extractSection,
  standardKey,
  formatEffectiveRules,
  getEffectiveRules,
};
