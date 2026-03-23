/**
 * Draft - Ruleset draft generation, verification, and rendering
 * Generates drafts from AI output with schema validation
 */

const path = require('path');
const fs = require('fs');
const { callLLM, getAvailableProvider } = require('../ai-complete.cjs');
const { createDraftPrompt, createUpdatePrompt, extractJson } = require('./prompts.cjs');
const { validateFrontmatter, renderFrontmatter, VALID_SCOPES, VALID_KINDS } = require('./frontmatter.cjs');
const { ensureDir } = require('../fs-utils.cjs');

const DRAFTS_DIR = '.grabby/rulesets/drafts';

/**
 * Verify draft structure matches expected schema
 * @param {object} draft - Parsed draft object
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function verifyDraft(draft) {
  const errors = [];
  const warnings = [];

  if (!draft || typeof draft !== 'object') {
    errors.push('Draft must be a valid object');
    return { valid: false, errors, warnings };
  }

  // Check metadata
  if (!draft.metadata || typeof draft.metadata !== 'object') {
    errors.push('Draft must have a metadata object');
  } else {
    if (!draft.metadata.id || typeof draft.metadata.id !== 'string') {
      errors.push('metadata.id is required and must be a string');
    } else if (!/^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/.test(draft.metadata.id)) {
      warnings.push('metadata.id should follow category/name format');
    }

    if (draft.metadata.scope && !VALID_SCOPES.includes(draft.metadata.scope)) {
      errors.push(`metadata.scope must be one of: ${VALID_SCOPES.join(', ')}`);
    }

    if (draft.metadata.kind && !VALID_KINDS.includes(draft.metadata.kind)) {
      errors.push(`metadata.kind must be one of: ${VALID_KINDS.join(', ')}`);
    }
  }

  // Check content
  if (!draft.content || typeof draft.content !== 'object') {
    errors.push('Draft must have a content object');
  } else {
    if (!draft.content.name || typeof draft.content.name !== 'string') {
      warnings.push('content.name is recommended');
    }

    if (!Array.isArray(draft.content.standards) || draft.content.standards.length === 0) {
      warnings.push('content.standards should have at least one item');
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Render draft to markdown with frontmatter
 * @param {object} draft - Verified draft object
 * @returns {string} Rendered markdown
 */
function renderDraft(draft) {
  const { metadata, content } = draft;

  // Build frontmatter
  const frontmatterData = {
    id: metadata.id,
    scope: metadata.scope || 'local',
    kind: metadata.kind || 'domain',
  };

  if (metadata.priority) {
    frontmatterData.priority = metadata.priority;
  }
  if (metadata.extends && metadata.extends.length > 0) {
    frontmatterData.extends = metadata.extends;
  }
  if (metadata.include && metadata.include.length > 0) {
    frontmatterData.include = metadata.include;
  }
  if (metadata.signals) {
    frontmatterData.signals = metadata.signals;
  }
  if (metadata.appliesWhen) {
    frontmatterData.appliesWhen = metadata.appliesWhen;
  }

  const frontmatter = renderFrontmatter(frontmatterData);

  // Build markdown content
  const lines = [];
  lines.push(`# RULESET: ${content.name || metadata.id.split('/').pop()}`);
  lines.push('');

  if (content.purpose && content.purpose.length > 0) {
    lines.push('## Purpose');
    content.purpose.forEach(p => lines.push(`- ${p}`));
    lines.push('');
  }

  if (content.standards && content.standards.length > 0) {
    lines.push('## Standards');
    content.standards.forEach(s => lines.push(`- ${s}`));
    lines.push('');
  }

  if (content.securityGates && content.securityGates.length > 0) {
    lines.push('## Security & Quality Gates');
    content.securityGates.forEach(g => lines.push(`- ${g}`));
    lines.push('');
  }

  if (content.nonGoals && content.nonGoals.length > 0) {
    lines.push('## Non-Goals');
    content.nonGoals.forEach(n => lines.push(`- ${n}`));
    lines.push('');
  }

  if (content.references && content.references.length > 0) {
    lines.push('## References');
    content.references.forEach(r => lines.push(`- ${r}`));
    lines.push('');
  }

  return frontmatter + '\n' + lines.join('\n');
}

/**
 * Generate a draft ruleset from a goal description
 * @param {object} options - Generation options
 * @param {string} options.goal - User's goal/description
 * @param {string} options.context - Additional context
 * @param {string} options.category - Suggested category
 * @param {string} options.cwd - Working directory
 * @returns {Promise<{ draft: object, markdown: string, verification: object }>}
 */
async function generateDraft(options = {}) {
  const { goal, context, category, cwd = process.cwd() } = options;

  const provider = getAvailableProvider();
  if (!provider) {
    throw new Error('No AI provider available. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.');
  }

  const prompt = createDraftPrompt({ goal, context, category });

  const response = await callLLM(prompt, {
    maxTokens: 2000,
    temperature: 0.7,
  });

  const draft = extractJson(response);
  if (!draft) {
    throw new Error('Failed to parse AI response as JSON');
  }

  const verification = verifyDraft(draft);
  const markdown = verification.valid ? renderDraft(draft) : '';

  return { draft, markdown, verification };
}

/**
 * Generate an update to an existing ruleset
 * @param {object} options - Update options
 * @param {string} options.goal - What to change
 * @param {string} options.existingFile - Path to existing ruleset
 * @param {string} options.cwd - Working directory
 * @returns {Promise<{ draft: object, markdown: string, verification: object }>}
 */
async function generateUpdate(options = {}) {
  const { goal, existingFile, cwd = process.cwd() } = options;

  let existingContent = '';
  if (existingFile) {
    const filePath = path.isAbsolute(existingFile) ? existingFile : path.join(cwd, existingFile);
    if (fs.existsSync(filePath)) {
      existingContent = fs.readFileSync(filePath, 'utf8');
    }
  }

  const provider = getAvailableProvider();
  if (!provider) {
    throw new Error('No AI provider available. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.');
  }

  const prompt = createUpdatePrompt({ goal, existingContent });

  const response = await callLLM(prompt, {
    maxTokens: 2000,
    temperature: 0.7,
  });

  const draft = extractJson(response);
  if (!draft) {
    throw new Error('Failed to parse AI response as JSON');
  }

  const verification = verifyDraft(draft);
  const markdown = verification.valid ? renderDraft(draft) : '';

  return { draft, markdown, verification };
}

/**
 * Save a draft to the drafts directory
 * @param {object} draft - Draft object
 * @param {string} markdown - Rendered markdown
 * @param {string} cwd - Working directory
 * @returns {{ draftPath: string, jsonPath: string }}
 */
function saveDraft(draft, markdown, cwd = process.cwd()) {
  const draftsDir = path.join(cwd, DRAFTS_DIR);
  ensureDir(draftsDir);

  const slug = draft.metadata.id.replace(/\//g, '-');
  const timestamp = Date.now();
  let suffix = 0;
  let draftPath;
  let jsonPath;

  do {
    const baseName = `${slug}-${timestamp}${suffix > 0 ? `-${suffix}` : ''}`;
    draftPath = path.join(draftsDir, `${baseName}.md`);
    jsonPath = path.join(draftsDir, `${baseName}.json`);
    suffix += 1;
  } while (fs.existsSync(draftPath) || fs.existsSync(jsonPath));

  fs.writeFileSync(draftPath, markdown, 'utf8');
  fs.writeFileSync(jsonPath, JSON.stringify(draft, null, 2), 'utf8');

  return {
    draftPath: path.relative(cwd, draftPath).replace(/\\/g, '/'),
    jsonPath: path.relative(cwd, jsonPath).replace(/\\/g, '/'),
  };
}

/**
 * List pending drafts
 * @param {string} cwd - Working directory
 * @returns {object[]} List of draft info
 */
function listDrafts(cwd = process.cwd()) {
  const draftsDir = path.join(cwd, DRAFTS_DIR);

  if (!fs.existsSync(draftsDir)) {
    return [];
  }

  const files = fs.readdirSync(draftsDir).filter(f => f.endsWith('.json'));

  return files.map(f => {
    const jsonPath = path.join(draftsDir, f);
    const mdPath = jsonPath.replace('.json', '.md');

    try {
      const draft = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      return {
        id: draft.metadata?.id || 'unknown',
        file: f.replace('.json', '.md'),
        jsonFile: f,
        createdAt: fs.statSync(jsonPath).mtime.toISOString(),
      };
    } catch {
      return null;
    }
  }).filter(Boolean);
}

/**
 * Apply a draft (move from drafts to shared)
 * @param {string} draftFile - Draft file name
 * @param {string} cwd - Working directory
 * @returns {{ appliedTo: string }}
 */
function applyDraft(draftFile, cwd = process.cwd()) {
  const draftsDir = path.join(cwd, DRAFTS_DIR);
  const sharedDir = path.join(cwd, '.grabby', 'rulesets', 'shared');

  const draftPath = path.join(draftsDir, draftFile);
  const jsonPath = draftPath.replace('.md', '.json');

  if (!fs.existsSync(draftPath)) {
    throw new Error(`Draft not found: ${draftFile}`);
  }

  // Read draft to get proper path
  let targetName = draftFile;
  if (fs.existsSync(jsonPath)) {
    try {
      const draft = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      if (draft.metadata?.id) {
        targetName = draft.metadata.id.replace(/\//g, '-') + '.md';
      }
    } catch {
      // Use original name
    }
  }

  ensureDir(sharedDir);
  const targetPath = path.join(sharedDir, targetName);

  fs.copyFileSync(draftPath, targetPath);

  // Clean up draft files
  fs.unlinkSync(draftPath);
  if (fs.existsSync(jsonPath)) {
    fs.unlinkSync(jsonPath);
  }

  return {
    appliedTo: path.relative(cwd, targetPath).replace(/\\/g, '/'),
  };
}

/**
 * Discard a draft
 * @param {string} draftFile - Draft file name
 * @param {string} cwd - Working directory
 */
function discardDraft(draftFile, cwd = process.cwd()) {
  const draftsDir = path.join(cwd, DRAFTS_DIR);

  const draftPath = path.join(draftsDir, draftFile);
  const jsonPath = draftPath.replace('.md', '.json');

  if (fs.existsSync(draftPath)) {
    fs.unlinkSync(draftPath);
  }
  if (fs.existsSync(jsonPath)) {
    fs.unlinkSync(jsonPath);
  }
}

module.exports = {
  verifyDraft,
  renderDraft,
  generateDraft,
  generateUpdate,
  saveDraft,
  listDrafts,
  applyDraft,
  discardDraft,
  DRAFTS_DIR,
};
