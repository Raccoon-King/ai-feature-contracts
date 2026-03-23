/**
 * Frontmatter - YAML frontmatter parsing and validation for rulesets
 * Enables hierarchical ruleset composition with structured metadata
 */

const yaml = require('yaml');

/**
 * Default metadata values for rulesets without frontmatter
 */
const DEFAULT_METADATA = {
  id: null,
  scope: 'local',
  kind: 'domain',
  priority: 0,
  signals: null,
  extends: [],
  include: [],
  appliesWhen: null,
};

/**
 * Valid values for metadata fields
 */
const VALID_SCOPES = ['global', 'local'];
const VALID_KINDS = ['language', 'framework', 'domain', 'policy', 'testing', 'tooling'];

/**
 * Parse YAML frontmatter from markdown content
 * @param {string} content - Raw markdown content
 * @returns {{ data: object, content: string }} Parsed frontmatter and remaining content
 */
function parseFrontmatter(content) {
  if (typeof content !== 'string') {
    return { data: {}, content: String(content || '') };
  }

  const trimmed = content.trim();

  // Check for frontmatter delimiter
  if (!trimmed.startsWith('---')) {
    return { data: {}, content };
  }

  // Find closing delimiter
  const endIndex = trimmed.indexOf('---', 3);
  if (endIndex === -1) {
    return { data: {}, content };
  }

  const frontmatterRaw = trimmed.slice(3, endIndex).trim();
  const remainingContent = trimmed.slice(endIndex + 3).trim();

  try {
    const data = yaml.parse(frontmatterRaw) || {};
    return { data, content: remainingContent };
  } catch (err) {
    // Invalid YAML, return empty data
    return { data: {}, content, parseError: err.message };
  }
}

/**
 * Validate signal object structure
 * @param {object} signal - Signal object to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateSignal(signal) {
  const errors = [];

  if (typeof signal !== 'object' || signal === null) {
    errors.push('Signal must be an object');
    return { valid: false, errors };
  }

  const validKeys = ['glob', 'file', 'packageDep', 'content'];
  const signalKeys = Object.keys(signal);

  if (signalKeys.length === 0) {
    errors.push('Signal must have at least one property (glob, file, packageDep, or content)');
  }

  for (const key of signalKeys) {
    if (!validKeys.includes(key) && key !== 'weight') {
      errors.push(`Unknown signal property: ${key}`);
    }
  }

  if (signal.weight !== undefined && (typeof signal.weight !== 'number' || signal.weight < 0 || signal.weight > 1)) {
    errors.push('Signal weight must be a number between 0 and 1');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate condition object structure
 * @param {object} condition - Condition object to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateCondition(condition) {
  const errors = [];

  if (typeof condition !== 'object' || condition === null) {
    errors.push('Condition must be an object');
    return { valid: false, errors };
  }

  const validKeys = ['pathPrefix', 'repoSignal', 'hasFile', 'notHasFile'];
  const conditionKeys = Object.keys(condition);

  if (conditionKeys.length === 0) {
    errors.push('Condition must have at least one property');
  }

  for (const key of conditionKeys) {
    if (!validKeys.includes(key)) {
      errors.push(`Unknown condition property: ${key}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate frontmatter data against the ruleset schema
 * @param {object} data - Parsed frontmatter data
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validateFrontmatter(data) {
  const errors = [];
  const warnings = [];

  if (typeof data !== 'object' || data === null) {
    return { valid: true, errors: [], warnings: [] }; // Empty frontmatter is valid
  }

  // Validate id format (category/name)
  if (data.id !== undefined) {
    if (typeof data.id !== 'string') {
      errors.push('id must be a string');
    } else if (!/^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/.test(data.id)) {
      warnings.push('id should follow category/name format (e.g., "languages/dotnet")');
    }
  }

  // Validate scope
  if (data.scope !== undefined && !VALID_SCOPES.includes(data.scope)) {
    errors.push(`scope must be one of: ${VALID_SCOPES.join(', ')}`);
  }

  // Validate kind
  if (data.kind !== undefined && !VALID_KINDS.includes(data.kind)) {
    errors.push(`kind must be one of: ${VALID_KINDS.join(', ')}`);
  }

  // Validate priority
  if (data.priority !== undefined) {
    if (typeof data.priority !== 'number' || !Number.isInteger(data.priority)) {
      errors.push('priority must be an integer');
    } else if (data.priority < 0 || data.priority > 1000) {
      warnings.push('priority should be between 0 and 1000');
    }
  }

  // Validate signals
  if (data.signals !== undefined) {
    if (typeof data.signals !== 'object' || data.signals === null) {
      errors.push('signals must be an object with "any" or "all" arrays');
    } else {
      const signalArrays = ['any', 'all'];
      for (const key of Object.keys(data.signals)) {
        if (!signalArrays.includes(key)) {
          errors.push(`signals can only have "any" or "all" properties, got: ${key}`);
        }
      }

      for (const key of signalArrays) {
        if (data.signals[key]) {
          if (!Array.isArray(data.signals[key])) {
            errors.push(`signals.${key} must be an array`);
          } else {
            data.signals[key].forEach((signal, index) => {
              const result = validateSignal(signal);
              result.errors.forEach((e) => errors.push(`signals.${key}[${index}]: ${e}`));
            });
          }
        }
      }
    }
  }

  // Validate extends
  if (data.extends !== undefined) {
    if (!Array.isArray(data.extends)) {
      errors.push('extends must be an array of ruleset IDs');
    } else {
      data.extends.forEach((ext, index) => {
        if (typeof ext !== 'string') {
          errors.push(`extends[${index}] must be a string`);
        }
      });
    }
  }

  // Validate include
  if (data.include !== undefined) {
    if (!Array.isArray(data.include)) {
      errors.push('include must be an array of ruleset IDs');
    } else {
      data.include.forEach((inc, index) => {
        if (typeof inc !== 'string') {
          errors.push(`include[${index}] must be a string`);
        }
      });
    }
  }

  // Validate appliesWhen
  if (data.appliesWhen !== undefined) {
    if (typeof data.appliesWhen !== 'object' || data.appliesWhen === null) {
      errors.push('appliesWhen must be an object with "any" or "all" arrays');
    } else {
      const conditionArrays = ['any', 'all'];
      for (const key of Object.keys(data.appliesWhen)) {
        if (!conditionArrays.includes(key)) {
          errors.push(`appliesWhen can only have "any" or "all" properties, got: ${key}`);
        }
      }

      for (const key of conditionArrays) {
        if (data.appliesWhen[key]) {
          if (!Array.isArray(data.appliesWhen[key])) {
            errors.push(`appliesWhen.${key} must be an array`);
          } else {
            data.appliesWhen[key].forEach((cond, index) => {
              const result = validateCondition(cond);
              result.errors.forEach((e) => errors.push(`appliesWhen.${key}[${index}]: ${e}`));
            });
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Extract normalized metadata from frontmatter data
 * @param {object} data - Parsed and validated frontmatter data
 * @returns {object} Normalized metadata with defaults applied
 */
function extractMetadata(data) {
  if (typeof data !== 'object' || data === null) {
    return { ...DEFAULT_METADATA };
  }

  return {
    id: data.id || DEFAULT_METADATA.id,
    scope: VALID_SCOPES.includes(data.scope) ? data.scope : DEFAULT_METADATA.scope,
    kind: VALID_KINDS.includes(data.kind) ? data.kind : DEFAULT_METADATA.kind,
    priority: typeof data.priority === 'number' ? data.priority : DEFAULT_METADATA.priority,
    signals: data.signals || DEFAULT_METADATA.signals,
    extends: Array.isArray(data.extends) ? data.extends : DEFAULT_METADATA.extends,
    include: Array.isArray(data.include) ? data.include : DEFAULT_METADATA.include,
    appliesWhen: data.appliesWhen || DEFAULT_METADATA.appliesWhen,
  };
}

/**
 * Parse ruleset content and extract both frontmatter metadata and markdown content
 * @param {string} rawContent - Raw ruleset file content
 * @returns {{ metadata: object, content: string, validation: object }}
 */
function parseRulesetWithFrontmatter(rawContent) {
  const { data, content, parseError } = parseFrontmatter(rawContent);

  if (parseError) {
    return {
      metadata: { ...DEFAULT_METADATA },
      content: rawContent,
      validation: { valid: false, errors: [`Frontmatter parse error: ${parseError}`], warnings: [] },
    };
  }

  const validation = validateFrontmatter(data);
  const metadata = extractMetadata(data);

  return { metadata, content, validation };
}

/**
 * Render metadata back to YAML frontmatter string
 * @param {object} metadata - Metadata object
 * @returns {string} YAML frontmatter string (including delimiters)
 */
function renderFrontmatter(metadata) {
  if (!metadata || Object.keys(metadata).length === 0) {
    return '';
  }

  // Filter out null/undefined/empty values
  const filtered = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value !== null && value !== undefined) {
      if (Array.isArray(value) && value.length === 0) {
        continue;
      }
      filtered[key] = value;
    }
  }

  if (Object.keys(filtered).length === 0) {
    return '';
  }

  const yamlContent = yaml.stringify(filtered, { indent: 2 });
  return `---\n${yamlContent}---\n`;
}

module.exports = {
  parseFrontmatter,
  validateFrontmatter,
  extractMetadata,
  parseRulesetWithFrontmatter,
  renderFrontmatter,
  DEFAULT_METADATA,
  VALID_SCOPES,
  VALID_KINDS,
};
