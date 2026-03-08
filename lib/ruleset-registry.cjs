/**
 * Ruleset Registry - Remote fetching, caching, and inheritance resolution
 * Enables cross-repo ruleset sharing and composition
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { ensureDir } = require('./fs-utils.cjs');

const CACHE_DIR = '.grabby/rulesets/cache';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Generate cache key from URL
 */
function hashUrl(url) {
  return crypto.createHash('sha256').update(url).digest('hex').slice(0, 16);
}

/**
 * Check if cached file is stale
 */
function isStale(cachePath, maxAgeMs = CACHE_MAX_AGE_MS) {
  try {
    const stats = fs.statSync(cachePath);
    return Date.now() - stats.mtimeMs > maxAgeMs;
  } catch {
    return true;
  }
}

/**
 * Validate ruleset content for safety (no executable code)
 */
function validateRulesetContent(content) {
  // Check for potentially dangerous patterns
  const dangerousPatterns = [
    /<script\b/i,
    /javascript:/i,
    /data:text\/html/i,
    /on\w+\s*=/i, // onclick, onerror, etc.
    /eval\s*\(/i,
    /Function\s*\(/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(content)) {
      throw new Error('Ruleset contains potentially unsafe content');
    }
  }

  // Verify it looks like a ruleset (has expected structure)
  if (!content.includes('# RULESET:') && !content.includes('## Standards') && !content.includes('## Purpose')) {
    throw new Error('Content does not appear to be a valid ruleset');
  }

  return true;
}

/**
 * HTTP GET request with redirect following
 */
function httpGet(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      return reject(new Error('Too many redirects'));
    }

    const protocol = url.startsWith('https') ? https : http;
    const request = protocol.get(url, { timeout: 10000 }, (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return resolve(httpGet(response.headers.location, maxRedirects - 1));
      }

      if (response.statusCode !== 200) {
        return reject(new Error(`HTTP ${response.statusCode}: Failed to fetch ${url}`));
      }

      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => resolve(data));
    });

    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    });
  });
}

/**
 * Fetch ruleset from remote URL with caching
 */
async function fetchRuleset(url, cwd = process.cwd(), options = {}) {
  const cacheDir = path.join(cwd, CACHE_DIR);
  const cacheKey = hashUrl(url);
  const cachePath = path.join(cacheDir, `${cacheKey}.ruleset.md`);
  const metaPath = path.join(cacheDir, `${cacheKey}.meta.json`);

  // Check cache first (unless force refresh)
  if (!options.forceRefresh && fs.existsSync(cachePath) && !isStale(cachePath)) {
    return {
      content: fs.readFileSync(cachePath, 'utf8'),
      source: url,
      cached: true,
      cachePath,
    };
  }

  // Fetch from remote
  const content = await httpGet(url);
  validateRulesetContent(content);

  // Cache the content
  ensureDir(cacheDir);
  fs.writeFileSync(cachePath, content, 'utf8');
  fs.writeFileSync(metaPath, JSON.stringify({
    url,
    fetchedAt: new Date().toISOString(),
    hash: crypto.createHash('sha256').update(content).digest('hex'),
  }, null, 2), 'utf8');

  return {
    content,
    source: url,
    cached: false,
    cachePath,
  };
}

/**
 * Parse extends declaration from ruleset content
 * Format: extends: ruleset-name@v1, other-ruleset@v2
 */
function parseExtends(content) {
  const match = content.match(/^extends:\s*(.+)$/im);
  if (!match) return [];

  return match[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Parse ruleset sections from content
 */
function parseRuleset(content, source = 'unknown') {
  const name = content.match(/^#\s+RULESET:\s*(.+)$/im)?.[1]?.trim() || 'unnamed';
  const extends_ = parseExtends(content);

  const sections = {
    purpose: [],
    standards: [],
    security: [],
    quality: [],
    nonGoals: [],
    references: [],
    contractGuidance: [],
  };

  // Extract section content
  // Use [^\n]* instead of [^#]* to only match to end of heading line
  const sectionPatterns = [
    { key: 'purpose', pattern: /##\s+Purpose[^\n]*\n([\s\S]*?)(?=\n##|\n#\s|$)/i },
    { key: 'standards', pattern: /##\s+Standards?[^\n]*\n([\s\S]*?)(?=\n##|\n#\s|$)/i },
    { key: 'security', pattern: /##\s+Security[^\n]*\n([\s\S]*?)(?=\n##|\n#\s|$)/i },
    { key: 'quality', pattern: /##\s+Quality[^\n]*\n([\s\S]*?)(?=\n##|\n#\s|$)/i },
    { key: 'nonGoals', pattern: /##\s+Non-?Goals?[^\n]*\n([\s\S]*?)(?=\n##|\n#\s|$)/i },
    { key: 'references', pattern: /##\s+References?[^\n]*\n([\s\S]*?)(?=\n##|\n#\s|$)/i },
    { key: 'contractGuidance', pattern: /##\s+Contract\s+Guidance[^\n]*\n([\s\S]*?)(?=\n##|\n#\s|$)/i },
  ];

  for (const { key, pattern } of sectionPatterns) {
    const match = content.match(pattern);
    if (match) {
      sections[key] = extractBulletPoints(match[1]);
    }
  }

  return {
    name,
    source,
    extends: extends_,
    sections,
    raw: content,
  };
}

/**
 * Extract bullet points from markdown section
 */
function extractBulletPoints(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('-') || line.startsWith('*') || line.match(/^\d+\./))
    .map((line) => line.replace(/^[-*]\s*/, '').replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean);
}

/**
 * Merge two rulesets (child overrides parent)
 */
function mergeRulesets(parent, child) {
  const merged = {
    name: child.name,
    source: child.source,
    extends: [...parent.extends, ...child.extends],
    sections: {},
    inheritedFrom: parent.name ? [parent.name, ...(parent.inheritedFrom || [])] : [],
  };

  // Merge each section
  const sectionKeys = ['purpose', 'standards', 'security', 'quality', 'nonGoals', 'references', 'contractGuidance'];
  for (const key of sectionKeys) {
    const parentItems = parent.sections?.[key] || [];
    const childItems = child.sections?.[key] || [];

    // Child items override parent items with same prefix
    const parentFiltered = parentItems.filter((parentItem) => {
      const parentPrefix = parentItem.split(':')[0].toLowerCase();
      return !childItems.some((childItem) => childItem.toLowerCase().startsWith(parentPrefix));
    });

    merged.sections[key] = [...parentFiltered, ...childItems];
  }

  return merged;
}

/**
 * Resolve local ruleset by name
 */
function resolveLocalRuleset(name, cwd = process.cwd()) {
  // Check standard locations
  const locations = [
    path.join(cwd, '.grabby', 'rulesets', `${name}.ruleset.md`),
    path.join(cwd, 'docs', 'rulesets', `${name}.ruleset.md`),
    path.join(cwd, 'docs', `RULESET_${name.toUpperCase().replace(/-/g, '_')}.md`),
  ];

  for (const location of locations) {
    if (fs.existsSync(location)) {
      return {
        content: fs.readFileSync(location, 'utf8'),
        source: path.relative(cwd, location),
        local: true,
      };
    }
  }

  return null;
}

/**
 * Resolve ruleset reference (name@version or URL)
 */
async function resolveRuleset(ref, cwd = process.cwd(), trustedSources = []) {
  const refTrimmed = ref.trim();

  // Check if it's a URL
  if (refTrimmed.startsWith('http://') || refTrimmed.startsWith('https://')) {
    // Validate against trusted sources if configured
    if (trustedSources.length > 0) {
      const isTrusted = trustedSources.some((source) => refTrimmed.startsWith(source));
      if (!isTrusted) {
        throw new Error(`Untrusted ruleset source: ${refTrimmed}. Add to governance.trustedSources in config.`);
      }
    }
    return fetchRuleset(refTrimmed, cwd);
  }

  // Check if it's a file:// URL
  if (refTrimmed.startsWith('file://')) {
    const filePath = refTrimmed.replace('file://', '');
    const resolvedPath = path.resolve(cwd, filePath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Local ruleset not found: ${resolvedPath}`);
    }
    return {
      content: fs.readFileSync(resolvedPath, 'utf8'),
      source: filePath,
      local: true,
    };
  }

  // Parse name@version format
  const [name, version] = refTrimmed.split('@');
  const local = resolveLocalRuleset(name, cwd);

  if (local) {
    return local;
  }

  throw new Error(`Ruleset not found: ${refTrimmed}. Try 'grabby ruleset fetch <url>' first.`);
}

/**
 * Resolve full ruleset inheritance chain
 */
async function resolveRulesetChain(rulesetRef, cwd = process.cwd(), config = {}, visited = new Set()) {
  // Prevent circular dependencies
  const refKey = rulesetRef.toLowerCase();
  if (visited.has(refKey)) {
    throw new Error(`Circular ruleset dependency detected: ${rulesetRef}`);
  }
  visited.add(refKey);

  const resolved = await resolveRuleset(rulesetRef, cwd, config.trustedSources || []);
  const parsed = parseRuleset(resolved.content, resolved.source);

  // If no extends, return as-is
  if (parsed.extends.length === 0) {
    return parsed;
  }

  // Resolve parent rulesets and merge
  let merged = { name: '', source: '', extends: [], sections: {}, inheritedFrom: [] };

  for (const parentRef of parsed.extends) {
    const parentResolved = await resolveRulesetChain(parentRef, cwd, config, visited);
    merged = mergeRulesets(merged, parentResolved);
  }

  // Merge child on top
  return mergeRulesets(merged, parsed);
}

/**
 * List all available rulesets (local + cached)
 */
function listRulesets(cwd = process.cwd()) {
  const rulesets = [];

  // Local rulesets in .grabby/rulesets
  const localDir = path.join(cwd, '.grabby', 'rulesets');
  if (fs.existsSync(localDir)) {
    fs.readdirSync(localDir)
      .filter((f) => f.endsWith('.ruleset.md'))
      .forEach((f) => {
        const content = fs.readFileSync(path.join(localDir, f), 'utf8');
        const parsed = parseRuleset(content, f);
        rulesets.push({
          name: parsed.name,
          file: path.join('.grabby/rulesets', f),
          type: 'local',
          extends: parsed.extends,
        });
      });
  }

  // Shared rulesets in docs/rulesets
  const sharedDir = path.join(cwd, 'docs', 'rulesets');
  if (fs.existsSync(sharedDir)) {
    fs.readdirSync(sharedDir)
      .filter((f) => f.endsWith('.ruleset.md'))
      .forEach((f) => {
        const content = fs.readFileSync(path.join(sharedDir, f), 'utf8');
        const parsed = parseRuleset(content, f);
        rulesets.push({
          name: parsed.name,
          file: path.join('docs/rulesets', f),
          type: 'shared',
          extends: parsed.extends,
        });
      });
  }

  // Built-in rulesets in docs/RULESET_*.md
  const docsDir = path.join(cwd, 'docs');
  if (fs.existsSync(docsDir)) {
    fs.readdirSync(docsDir)
      .filter((f) => f.startsWith('RULESET_') && f.endsWith('.md'))
      .forEach((f) => {
        const content = fs.readFileSync(path.join(docsDir, f), 'utf8');
        const name = f.replace('RULESET_', '').replace('.md', '').toLowerCase().replace(/_/g, '-');
        rulesets.push({
          name,
          file: path.join('docs', f),
          type: 'builtin',
          extends: parseExtends(content),
        });
      });
  }

  // Cached remote rulesets
  const cacheDir = path.join(cwd, CACHE_DIR);
  if (fs.existsSync(cacheDir)) {
    fs.readdirSync(cacheDir)
      .filter((f) => f.endsWith('.meta.json'))
      .forEach((f) => {
        try {
          const meta = JSON.parse(fs.readFileSync(path.join(cacheDir, f), 'utf8'));
          const contentFile = f.replace('.meta.json', '.ruleset.md');
          if (fs.existsSync(path.join(cacheDir, contentFile))) {
            const content = fs.readFileSync(path.join(cacheDir, contentFile), 'utf8');
            const parsed = parseRuleset(content, meta.url);
            rulesets.push({
              name: parsed.name,
              file: meta.url,
              type: 'remote',
              extends: parsed.extends,
              fetchedAt: meta.fetchedAt,
            });
          }
        } catch {
          // Skip invalid cache entries
        }
      });
  }

  return rulesets;
}

/**
 * Generate contract guidance from resolved ruleset
 */
function generateContractGuidance(resolvedRuleset) {
  const guidance = [];

  // Add standards as contract requirements
  if (resolvedRuleset.sections.standards?.length > 0) {
    guidance.push('## Required Standards (from ruleset)');
    resolvedRuleset.sections.standards.forEach((s) => {
      guidance.push(`- ${s}`);
    });
  }

  // Add security requirements
  if (resolvedRuleset.sections.security?.length > 0) {
    guidance.push('\n## Security Requirements (from ruleset)');
    resolvedRuleset.sections.security.forEach((s) => {
      guidance.push(`- ${s}`);
    });
  }

  // Add quality gates
  if (resolvedRuleset.sections.quality?.length > 0) {
    guidance.push('\n## Quality Gates (from ruleset)');
    resolvedRuleset.sections.quality.forEach((s) => {
      guidance.push(`- ${s}`);
    });
  }

  // Add explicit contract guidance
  if (resolvedRuleset.sections.contractGuidance?.length > 0) {
    guidance.push('\n## Contract Guidance (from ruleset)');
    resolvedRuleset.sections.contractGuidance.forEach((s) => {
      guidance.push(`- ${s}`);
    });
  }

  return guidance.join('\n');
}

/**
 * Clear cached rulesets
 */
function clearCache(cwd = process.cwd()) {
  const cacheDir = path.join(cwd, CACHE_DIR);
  if (fs.existsSync(cacheDir)) {
    fs.rmSync(cacheDir, { recursive: true, force: true });
    return true;
  }
  return false;
}

module.exports = {
  fetchRuleset,
  parseRuleset,
  parseExtends,
  mergeRulesets,
  resolveRuleset,
  resolveLocalRuleset,
  resolveRulesetChain,
  listRulesets,
  generateContractGuidance,
  validateRulesetContent,
  clearCache,
  CACHE_DIR,
};
