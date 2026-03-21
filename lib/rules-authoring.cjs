/**
 * Rules Authoring - Dedicated helpers for generating and updating shared project rules
 *
 * This module provides:
 * - Generation of shared rules from repo guidance sources (AGENTS.md, docs/, etc.)
 * - Update of existing shared rules in place
 * - Write boundary enforcement (protected shared-rules path)
 *
 * IMPORTANT: The shared rules repo path is protected from writes by normal Grabby
 * operations. Only explicit authoring commands (generate/update) can write to
 * this location. Manual file edits outside Grabby are still allowed.
 */

const fs = require('fs');
const path = require('path');
const { ensureDir } = require('./fs-utils.cjs');
const { loadConfig } = require('./config.cjs');
const { discoverRulesetCandidates, resolveInputFiles, summarizeFiles } = require('./ruleset-builder.cjs');
const { callLLM, getAvailableProvider } = require('./ai-complete.cjs');

/**
 * Authoring context flag - when true, allows writes to protected paths
 * This is set by explicit authoring commands and checked by write guards
 */
let authoringContext = false;

/**
 * Set the authoring context flag
 * @param {boolean} enabled - Whether authoring mode is active
 */
function setAuthoringContext(enabled) {
  authoringContext = enabled;
}

/**
 * Check if authoring context is currently active
 * @returns {boolean}
 */
function isAuthoringContext() {
  return authoringContext;
}

/**
 * Get the default protected rules path
 * @param {string} cwd - Current working directory
 * @returns {string} Absolute path to the protected shared rules directory
 */
function getDefaultProtectedPath(cwd = process.cwd()) {
  return path.join(cwd, '.grabby', 'rulesets', 'shared');
}

/**
 * Get the configured protected rules path
 * @param {string} cwd - Current working directory
 * @returns {string} Absolute path to the protected shared rules directory
 */
function getProtectedRulesPath(cwd = process.cwd()) {
  const config = loadConfig(cwd);
  const configuredPath = config?.rulesets?.authoring?.protectedPath;
  if (configuredPath) {
    return path.isAbsolute(configuredPath)
      ? configuredPath
      : path.join(cwd, configuredPath);
  }
  return getDefaultProtectedPath(cwd);
}

/**
 * Check if a path is within the protected shared rules directory
 * @param {string} targetPath - Path to check
 * @param {string} cwd - Current working directory
 * @returns {boolean}
 */
function isProtectedRulesPath(targetPath, cwd = process.cwd()) {
  const protectedPath = getProtectedRulesPath(cwd);
  const absoluteTarget = path.isAbsolute(targetPath)
    ? targetPath
    : path.join(cwd, targetPath);
  const normalizedTarget = path.normalize(absoluteTarget);
  const normalizedProtected = path.normalize(protectedPath);

  return normalizedTarget.startsWith(normalizedProtected + path.sep) ||
         normalizedTarget === normalizedProtected;
}

/**
 * Assert that writes to a path are allowed
 * Throws an error if the path is protected and authoring context is not active
 * @param {string} targetPath - Path to check
 * @param {string} cwd - Current working directory
 * @param {string} operation - Description of the operation being attempted
 * @throws {Error} If write is not allowed
 */
function assertWriteAllowed(targetPath, cwd = process.cwd(), operation = 'write') {
  if (isProtectedRulesPath(targetPath, cwd) && !authoringContext) {
    const protectedPath = getProtectedRulesPath(cwd);
    throw new Error(
      `Cannot ${operation} to protected shared rules path: ${targetPath}\n` +
      `Protected directory: ${protectedPath}\n` +
      `Use 'grabby rules generate' or 'grabby rules update' to modify shared rules.`
    );
  }
}

/**
 * Get the configured guidance sources for rules generation
 * @param {string} cwd - Current working directory
 * @returns {string[]} Array of relative paths to check for guidance
 */
function getGuidanceSources(cwd = process.cwd()) {
  const config = loadConfig(cwd);
  const configuredSources = config?.rulesets?.authoring?.guidanceSources;
  if (Array.isArray(configuredSources) && configuredSources.length > 0) {
    return configuredSources;
  }
  return [
    'AGENTS.md',
    'docs',
    '.cursor/rules',
    '.clinerules',
    '.continue/rules',
    '.codex/rules',
    'README.md',
  ];
}

/**
 * Discover available guidance files in the repository
 * @param {string} cwd - Current working directory
 * @returns {string[]} Array of relative paths to available guidance files
 */
function discoverGuidanceFiles(cwd = process.cwd()) {
  const sources = getGuidanceSources(cwd);
  return discoverRulesetCandidates(cwd).filter(candidate =>
    sources.some(source => candidate.startsWith(source) || candidate === source)
  );
}

/**
 * Build the LLM prompt for generating shared rules
 * @param {string} goal - User-provided goal for the ruleset
 * @param {string} contextSummary - Summary of guidance files content
 * @returns {string}
 */
function buildGeneratePrompt(goal, contextSummary) {
  return `You are helping generate a shared project ruleset from existing repository guidance.

User goal:
${goal || 'Create comprehensive project engineering rules from existing guidance'}

Existing repository guidance:
${contextSummary || '(none provided)'}

Generate a complete markdown ruleset using this structure:

# SHARED RULESET: <name>

## Purpose
- What this ruleset enforces and why
- Target audience and use cases

## Standards
- Clear, enforceable rules
- Specific conventions to follow
- Naming patterns and architecture guidelines

## Quality Gates
- Test requirements
- Lint/build checks
- Code review expectations

## Security Requirements
- Security standards to enforce
- Validation and sanitization rules
- Credential handling guidelines

## Non-Goals
- Explicit boundaries
- What this ruleset does NOT cover

## Source References
- List of files this was derived from

Keep it practical, implementation-focused, and specific to this project's patterns.`;
}

/**
 * Build the LLM prompt for updating existing shared rules
 * @param {string} existingContent - Current ruleset content
 * @param {string} updateGoal - What should be updated/changed
 * @param {string} newContext - Additional context from guidance files
 * @returns {string}
 */
function buildUpdatePrompt(existingContent, updateGoal, newContext) {
  return `You are helping update an existing shared project ruleset.

Current ruleset content:
${existingContent}

Update goal:
${updateGoal || 'Refresh and improve the ruleset based on current guidance'}

Additional/updated guidance:
${newContext || '(none provided)'}

Update the ruleset to incorporate the changes while:
- Preserving the existing structure and format
- Keeping rules that are still valid
- Adding new rules from updated guidance
- Removing outdated rules
- Updating references

Return the complete updated ruleset in markdown format.`;
}

/**
 * Generate a new shared ruleset from repository guidance
 * @param {Object} options - Generation options
 * @param {string} options.cwd - Current working directory
 * @param {string} options.goal - Goal for the ruleset
 * @param {string} options.title - Title for the ruleset
 * @param {string[]} options.sources - Specific sources to use (optional)
 * @param {Object} options.logger - Logger instance
 * @returns {Promise<{path: string, content: string}>}
 */
async function generateSharedRules(options = {}) {
  const cwd = options.cwd || process.cwd();
  const logger = options.logger || console;
  const title = options.title || 'Shared Project Rules';

  // Discover guidance files
  const guidanceFiles = options.sources
    ? resolveInputFiles(cwd, options.sources)
    : resolveInputFiles(cwd, discoverGuidanceFiles(cwd));

  if (guidanceFiles.length === 0) {
    logger.log('No guidance files found. Creating a baseline ruleset.');
  } else {
    logger.log(`Found ${guidanceFiles.length} guidance file(s) to process.`);
  }

  // Summarize guidance content
  const contextSummary = summarizeFiles(cwd, guidanceFiles, 15000);

  // Generate ruleset content
  let content;
  const provider = getAvailableProvider();

  if (provider) {
    const prompt = buildGeneratePrompt(options.goal, contextSummary);
    content = await callLLM(prompt, { provider, maxTokens: 2000, temperature: 0.3 });
  } else {
    // Fallback to template if no LLM available
    content = createFallbackSharedRuleset({
      title,
      goal: options.goal,
      references: guidanceFiles.map(f => path.relative(cwd, f).replace(/\\/g, '/')),
    });
  }

  // Ensure content starts with a header
  if (!content.startsWith('#')) {
    content = `# SHARED RULESET: ${title}\n\n${content}`;
  }

  // Write to protected path (authoring context must be set)
  const outputDir = getProtectedRulesPath(cwd);
  const slug = slugifyTitle(title);
  const outputPath = path.join(outputDir, `${slug}.ruleset.md`);

  // Enable authoring context for the write
  setAuthoringContext(true);
  try {
    ensureDir(outputDir);
    fs.writeFileSync(outputPath, `${content.trim()}\n`, 'utf8');
  } finally {
    setAuthoringContext(false);
  }

  return {
    path: outputPath,
    relativePath: path.relative(cwd, outputPath).replace(/\\/g, '/'),
    content,
    sourcesUsed: guidanceFiles.length,
  };
}

/**
 * Update an existing shared ruleset
 * @param {Object} options - Update options
 * @param {string} options.cwd - Current working directory
 * @param {string} options.rulesetPath - Path to the ruleset to update
 * @param {string} options.goal - What to update/change
 * @param {string[]} options.sources - Additional sources to incorporate
 * @param {Object} options.logger - Logger instance
 * @returns {Promise<{path: string, content: string, updated: boolean}>}
 */
async function updateSharedRules(options = {}) {
  const cwd = options.cwd || process.cwd();
  const logger = options.logger || console;

  // Resolve the ruleset path
  let rulesetPath = options.rulesetPath;
  if (!rulesetPath) {
    // Try to find existing shared ruleset
    const protectedPath = getProtectedRulesPath(cwd);
    if (fs.existsSync(protectedPath)) {
      const files = fs.readdirSync(protectedPath).filter(f => f.endsWith('.ruleset.md'));
      if (files.length === 1) {
        rulesetPath = path.join(protectedPath, files[0]);
      } else if (files.length > 1) {
        throw new Error(
          `Multiple rulesets found in ${protectedPath}. ` +
          `Please specify which one to update with --file <path>`
        );
      } else {
        throw new Error(
          `No rulesets found in ${protectedPath}. ` +
          `Use 'grabby rules generate' to create one first.`
        );
      }
    } else {
      throw new Error(
        `Protected rules path does not exist: ${protectedPath}\n` +
        `Use 'grabby rules generate' to create a shared ruleset first.`
      );
    }
  }

  // Resolve to absolute path
  const absolutePath = path.isAbsolute(rulesetPath)
    ? rulesetPath
    : path.join(cwd, rulesetPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Ruleset file not found: ${absolutePath}`);
  }

  // Read existing content
  const existingContent = fs.readFileSync(absolutePath, 'utf8');

  // Discover additional guidance
  const guidanceFiles = options.sources
    ? resolveInputFiles(cwd, options.sources)
    : resolveInputFiles(cwd, discoverGuidanceFiles(cwd));

  const newContext = summarizeFiles(cwd, guidanceFiles, 10000);

  // Generate updated content
  let updatedContent;
  const provider = getAvailableProvider();

  if (provider) {
    const prompt = buildUpdatePrompt(existingContent, options.goal, newContext);
    updatedContent = await callLLM(prompt, { provider, maxTokens: 2500, temperature: 0.3 });
  } else {
    // Without LLM, we can only append a note about the update request
    updatedContent = existingContent +
      `\n\n---\n\n## Update Request (${new Date().toISOString()})\n\n` +
      `Goal: ${options.goal || 'General update'}\n` +
      `Note: Manual update required - no LLM available.\n`;
  }

  // Write updated content
  setAuthoringContext(true);
  try {
    fs.writeFileSync(absolutePath, `${updatedContent.trim()}\n`, 'utf8');
  } finally {
    setAuthoringContext(false);
  }

  return {
    path: absolutePath,
    relativePath: path.relative(cwd, absolutePath).replace(/\\/g, '/'),
    content: updatedContent,
    updated: true,
    sourcesUsed: guidanceFiles.length,
  };
}

/**
 * Create a fallback shared ruleset when no LLM is available
 * @param {Object} options
 * @returns {string}
 */
function createFallbackSharedRuleset({ title, goal, references }) {
  const refs = references.length > 0
    ? references.map(file => `- ${file}`).join('\n')
    : '- None';

  return `# SHARED RULESET: ${title}

## Purpose
- ${goal || 'Define reusable project standards for consistent governance'}
- Serve as the single source of truth for engineering rules

## Standards
- Keep changes scoped and test-backed
- Follow existing architecture and naming conventions
- Prefer guided setup flows over ad hoc flags
- Document breaking changes and migration paths

## Quality Gates
- Require tests for behavior changes
- Require lint/build checks to pass
- Avoid hidden scope expansion
- Maintain backward compatibility when possible

## Security Requirements
- Validate all user input
- Escape output appropriately
- Use parameterized queries (no SQL injection)
- Store no secrets in code
- Pass npm audit with no high/critical vulnerabilities

## Non-Goals
- No unrelated refactors during feature work
- No undocumented workflow drift
- No automatic pushing to remote repositories

## Source References
${refs}

---
Generated: ${new Date().toISOString()}
`;
}

/**
 * Slugify a title for use as a filename
 * @param {string} title
 * @returns {string}
 */
function slugifyTitle(title) {
  if (title == null || title === '') {
    return 'shared-rules';
  }
  const slug = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'shared-rules';
}

/**
 * List all shared rulesets in the protected path
 * @param {string} cwd - Current working directory
 * @returns {Array<{name: string, path: string, modified: Date}>}
 */
function listSharedRulesets(cwd = process.cwd()) {
  const protectedPath = getProtectedRulesPath(cwd);
  if (!fs.existsSync(protectedPath)) {
    return [];
  }

  return fs.readdirSync(protectedPath)
    .filter(f => f.endsWith('.ruleset.md'))
    .map(f => {
      const fullPath = path.join(protectedPath, f);
      const stat = fs.statSync(fullPath);
      return {
        name: f.replace('.ruleset.md', ''),
        path: fullPath,
        relativePath: path.relative(cwd, fullPath).replace(/\\/g, '/'),
        modified: stat.mtime,
      };
    })
    .sort((a, b) => b.modified - a.modified);
}

/**
 * Check if authoring is enabled in config
 * @param {string} cwd - Current working directory
 * @returns {boolean}
 */
function isAuthoringEnabled(cwd = process.cwd()) {
  const config = loadConfig(cwd);
  return config?.rulesets?.authoring?.enabled !== false;
}

module.exports = {
  // Context management
  setAuthoringContext,
  isAuthoringContext,

  // Path utilities
  getProtectedRulesPath,
  getDefaultProtectedPath,
  isProtectedRulesPath,
  assertWriteAllowed,

  // Guidance discovery
  getGuidanceSources,
  discoverGuidanceFiles,

  // Core operations
  generateSharedRules,
  updateSharedRules,
  listSharedRulesets,

  // Config
  isAuthoringEnabled,

  // Internal (exported for testing)
  buildGeneratePrompt,
  buildUpdatePrompt,
  createFallbackSharedRuleset,
  slugifyTitle,
};
