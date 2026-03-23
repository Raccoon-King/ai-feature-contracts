/**
 * Prompts - Structured prompts for AI-powered ruleset generation
 * Generates prompts that request JSON output conforming to the ruleset schema
 */

const fs = require('fs');
const path = require('path');

/**
 * Load the ruleset frontmatter schema
 * @returns {object} JSON schema
 */
function loadSchema() {
  const schemaPath = path.join(__dirname, '..', '..', 'definitions', 'ruleset-frontmatter.json');
  try {
    return JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  } catch {
    // Return minimal schema if file not found
    return {
      properties: {
        id: { type: 'string', description: 'Unique identifier (category/name)' },
        scope: { enum: ['global', 'local'] },
        kind: { enum: ['language', 'framework', 'domain', 'policy', 'testing', 'tooling'] },
        priority: { type: 'integer', minimum: 0, maximum: 1000 },
        extends: { type: 'array', items: { type: 'string' } },
        include: { type: 'array', items: { type: 'string' } },
      },
    };
  }
}

/**
 * Create a prompt for generating a new ruleset draft
 * @param {object} options - Generation options
 * @param {string} options.goal - User's goal/description for the ruleset
 * @param {string} options.context - Additional context from existing files
 * @param {string} options.category - Suggested category (languages, frameworks, etc.)
 * @returns {string} Formatted prompt
 */
function createDraftPrompt(options = {}) {
  const { goal, context, category } = options;
  const schema = loadSchema();

  return `You are helping create a Grabby ruleset for engineering standards.

USER GOAL:
${goal || 'Create a new ruleset with best practices'}

${context ? `CONTEXT FROM EXISTING FILES:\n${context}\n` : ''}

Generate a JSON object with this structure:

{
  "metadata": {
    "id": "${category || 'domain'}/ruleset-name",
    "scope": "global" or "local",
    "kind": "language" | "framework" | "domain" | "policy" | "testing" | "tooling",
    "priority": 0-1000 (higher = takes precedence),
    "extends": ["optional/parent-rulesets"],
    "signals": {
      "any": [
        { "glob": "**/*.ext", "weight": 0.0-1.0 },
        { "file": "config.json" },
        { "packageDep": "package-name" }
      ]
    }
  },
  "content": {
    "name": "Ruleset Display Name",
    "purpose": ["Bullet point 1", "Bullet point 2"],
    "standards": ["Enforceable standard 1", "Enforceable standard 2"],
    "securityGates": ["Security requirement 1", "Quality gate 2"],
    "nonGoals": ["Explicit boundary 1"],
    "references": ["Reference doc or file"]
  }
}

RULES:
- id format: category/name (lowercase, hyphens)
- scope: "global" for reusable packs, "local" for repo-specific activation
- standards should be clear, actionable, and enforceable
- Keep it practical and implementation-focused

Output ONLY valid JSON, no markdown fences or explanation.`;
}

/**
 * Create a prompt for updating an existing ruleset
 * @param {object} options - Update options
 * @param {string} options.goal - What to change/improve
 * @param {string} options.existingContent - Current ruleset content
 * @param {string} options.context - Additional context
 * @returns {string} Formatted prompt
 */
function createUpdatePrompt(options = {}) {
  const { goal, existingContent, context } = options;

  return `You are helping update an existing Grabby ruleset.

EXISTING RULESET:
${existingContent || '(no existing content)'}

REQUESTED CHANGES:
${goal || 'Improve and update the ruleset'}

${context ? `ADDITIONAL CONTEXT:\n${context}\n` : ''}

Generate a JSON object with the updated ruleset:

{
  "metadata": {
    "id": "category/name",
    "scope": "global" or "local",
    "kind": "language" | "framework" | "domain" | "policy" | "testing" | "tooling",
    "priority": 0-1000,
    "extends": ["optional/parent-rulesets"]
  },
  "content": {
    "name": "Ruleset Display Name",
    "purpose": ["Updated purpose bullets"],
    "standards": ["Updated standards"],
    "securityGates": ["Updated security/quality gates"],
    "nonGoals": ["Updated boundaries"],
    "references": ["Updated references"]
  }
}

Preserve existing values unless the change specifically requires modification.
Output ONLY valid JSON, no markdown fences or explanation.`;
}

/**
 * Create a prompt for suggesting rulesets based on detected signals
 * @param {object[]} detections - Detected technology signals
 * @returns {string} Formatted prompt
 */
function createSuggestionPrompt(detections = []) {
  const detectionSummary = detections
    .map(d => `- ${d.name} (${d.id}): ${d.reason || 'detected'}`)
    .join('\n');

  return `Based on these detected technologies in a repository:

${detectionSummary || '(no technologies detected)'}

Suggest which rulesets would be most beneficial and why.
Consider:
1. Which standards would prevent common issues
2. Security considerations for the tech stack
3. Testing and quality requirements

Respond with a JSON array:
[
  {
    "rulesetId": "category/name",
    "reason": "Why this ruleset is recommended",
    "priority": "high" | "medium" | "low"
  }
]

Output ONLY valid JSON.`;
}

/**
 * Extract JSON from LLM response (handles markdown fences)
 * @param {string} response - Raw LLM response
 * @returns {object|null} Parsed JSON or null
 */
function extractJson(response) {
  if (!response || typeof response !== 'string') {
    return null;
  }

  let content = response.trim();

  // Remove markdown code fences if present
  const jsonFenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonFenceMatch) {
    content = jsonFenceMatch[1].trim();
  }

  // Try to find JSON object or array
  const jsonMatch = content.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    content = jsonMatch[1];
  }

  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

module.exports = {
  loadSchema,
  createDraftPrompt,
  createUpdatePrompt,
  createSuggestionPrompt,
  extractJson,
};
