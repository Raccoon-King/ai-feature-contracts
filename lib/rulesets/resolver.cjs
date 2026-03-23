/**
 * Resolver - Dependency resolution for hierarchical rulesets
 * Resolves extends/include chains with circular dependency detection
 */

const path = require('path');
const fs = require('fs');
const { parseRulesetWithFrontmatter } = require('./frontmatter.cjs');

/**
 * Maximum resolution depth to prevent stack overflow
 */
const MAX_RESOLUTION_DEPTH = 10;

/**
 * Priority levels for different ruleset sources
 */
const PRIORITY_LEVELS = {
  'repo-local': 1000,
  'user-global': 500,
  'org-central': 100,
  'built-in': 0,
};

/**
 * Load a ruleset by ID from known locations
 * @param {string} rulesetId - Ruleset ID (e.g., "languages/dotnet")
 * @param {string} cwd - Working directory
 * @returns {{ content: string, source: string, priority: number } | null}
 */
function loadRulesetById(rulesetId, cwd) {
  const locations = [
    // Repo-local rulesets
    { dir: path.join(cwd, '.grabby', 'rulesets', 'local'), priority: PRIORITY_LEVELS['repo-local'] },
    { dir: path.join(cwd, '.grabby', 'rulesets', 'shared'), priority: PRIORITY_LEVELS['repo-local'] },
    // User-global rulesets
    { dir: path.join(process.env.HOME || process.env.USERPROFILE || '', '.grabby', 'rulesets'), priority: PRIORITY_LEVELS['user-global'] },
    // Org-central (cached from sync)
    { dir: path.join(cwd, '.grabby', 'rulesets', 'cache', 'central-repo'), priority: PRIORITY_LEVELS['org-central'] },
    // Built-in templates
    { dir: path.join(__dirname, '..', '..', 'templates', 'rulesets'), priority: PRIORITY_LEVELS['built-in'] },
  ];

  // Convert ID to possible file names
  const idParts = rulesetId.split('/');
  const possibleNames = [
    `${idParts.join('/')}.md`,
    `${idParts.join('/')}.ruleset.md`,
    `${idParts[idParts.length - 1]}.md`,
    `${idParts[idParts.length - 1]}.ruleset.md`,
  ];

  for (const { dir, priority } of locations) {
    if (!fs.existsSync(dir)) continue;

    for (const name of possibleNames) {
      const filePath = path.join(dir, name);
      if (fs.existsSync(filePath)) {
        return {
          content: fs.readFileSync(filePath, 'utf8'),
          source: path.relative(cwd, filePath).replace(/\\/g, '/'),
          priority,
        };
      }
    }
  }

  return null;
}

/**
 * Resolve a ruleset and all its dependencies
 * @param {string} rulesetId - The ruleset ID to resolve
 * @param {string} cwd - Working directory
 * @param {object} options - Resolution options
 * @param {Set<string>} visited - Already visited IDs (for cycle detection)
 * @param {string[]} chain - Current resolution chain
 * @param {number} depth - Current depth
 * @returns {{ resolved: object[], errors: string[] }}
 */
function resolveRuleset(rulesetId, cwd, options = {}, visited = new Set(), chain = [], depth = 0) {
  const errors = [];
  const resolved = [];
  const maxDepth = options.maxDepth || MAX_RESOLUTION_DEPTH;

  // Check depth limit
  if (depth > maxDepth) {
    errors.push(`Maximum resolution depth exceeded: ${chain.join(' -> ')} -> ${rulesetId}`);
    return { resolved, errors };
  }

  // Check for circular dependency
  const normalizedId = rulesetId.toLowerCase();
  if (chain.map(c => c.toLowerCase()).includes(normalizedId)) {
    errors.push(`Circular dependency detected: ${chain.join(' -> ')} -> ${rulesetId}`);
    return { resolved, errors };
  }

  // Skip if already resolved
  if (visited.has(normalizedId)) {
    return { resolved, errors };
  }

  // Load the ruleset
  const loaded = loadRulesetById(rulesetId, cwd);
  if (!loaded) {
    errors.push(`Ruleset not found: ${rulesetId}`);
    return { resolved, errors };
  }

  // Parse the ruleset
  const { metadata, content, validation } = parseRulesetWithFrontmatter(loaded.content);

  if (!validation.valid) {
    errors.push(`Invalid ruleset ${rulesetId}: ${validation.errors.join(', ')}`);
  }

  const newChain = [...chain, rulesetId];
  visited.add(normalizedId);

  // Resolve extends (inherited rules - always applied)
  const extendsIds = metadata.extends || [];
  for (const extendId of extendsIds) {
    const result = resolveRuleset(extendId, cwd, options, visited, newChain, depth + 1);
    resolved.push(...result.resolved);
    errors.push(...result.errors);
  }

  // Resolve includes (activated global packs - for local rules)
  const includeIds = metadata.include || [];
  for (const includeId of includeIds) {
    const result = resolveRuleset(includeId, cwd, options, visited, newChain, depth + 1);
    resolved.push(...result.resolved);
    errors.push(...result.errors);
  }

  // Add this ruleset to resolved list
  resolved.push({
    id: metadata.id || rulesetId,
    source: loaded.source,
    priority: metadata.priority || loaded.priority,
    scope: metadata.scope || 'local',
    kind: metadata.kind || 'domain',
    metadata,
    content,
    raw: loaded.content,
  });

  return { resolved, errors };
}

/**
 * Resolve multiple rulesets and return in resolution order
 * @param {string[]} rulesetIds - Ruleset IDs to resolve
 * @param {string} cwd - Working directory
 * @param {object} options - Resolution options
 * @returns {{ chain: object[], errors: string[] }}
 */
function resolveRulesetChain(rulesetIds, cwd, options = {}) {
  const allResolved = [];
  const allErrors = [];
  const visited = new Set();

  for (const rulesetId of rulesetIds) {
    const { resolved, errors } = resolveRuleset(rulesetId, cwd, options, visited, [], 0);
    allResolved.push(...resolved);
    allErrors.push(...errors);
  }

  // Sort by priority (lower priority first, so higher can override)
  allResolved.sort((a, b) => (a.priority || 0) - (b.priority || 0));

  return { chain: allResolved, errors: allErrors };
}

/**
 * Get the effective priority for a ruleset source
 * @param {string} source - Source path
 * @param {string} cwd - Working directory
 * @returns {number}
 */
function getSourcePriority(source, cwd) {
  const normalizedSource = source.replace(/\\/g, '/');

  if (normalizedSource.includes('.grabby/rulesets/local')) {
    return PRIORITY_LEVELS['repo-local'];
  }
  if (normalizedSource.includes('.grabby/rulesets/shared')) {
    return PRIORITY_LEVELS['repo-local'];
  }
  if (normalizedSource.includes('.grabby/rulesets/cache')) {
    return PRIORITY_LEVELS['org-central'];
  }
  if (normalizedSource.includes('templates/rulesets')) {
    return PRIORITY_LEVELS['built-in'];
  }

  return PRIORITY_LEVELS['repo-local'];
}

module.exports = {
  resolveRuleset,
  resolveRulesetChain,
  loadRulesetById,
  getSourcePriority,
  MAX_RESOLUTION_DEPTH,
  PRIORITY_LEVELS,
};
