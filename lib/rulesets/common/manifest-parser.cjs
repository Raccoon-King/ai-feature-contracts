/**
 * Manifest Parser - Parse and validate central ruleset registry manifest.yaml
 *
 * Manifest structure:
 * - version: string
 * - lastUpdated: ISO date
 * - categories: object with category definitions
 * - presets: optional preset bundle definitions
 */

const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

/**
 * Validate manifest version format (semantic versioning)
 */
function validateVersion(version) {
  if (typeof version !== 'string') {
    throw new Error('Manifest version must be a string');
  }

  const semverPattern = /^\d+\.\d+\.\d+$/;
  if (!semverPattern.test(version)) {
    throw new Error(`Invalid version format: ${version}. Expected semantic versioning (e.g., "1.0.0")`);
  }

  return true;
}

/**
 * Validate ISO date string
 */
function validateISODate(dateString, fieldName = 'date') {
  if (typeof dateString !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }

  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid ${fieldName}: ${dateString}. Expected ISO 8601 format`);
  }

  return true;
}

/**
 * Validate ruleset metadata structure
 */
function validateRulesetMetadata(ruleset, categoryName) {
  if (!ruleset.name || typeof ruleset.name !== 'string') {
    throw new Error(`Ruleset in category "${categoryName}" missing required field: name`);
  }

  if (!ruleset.version) {
    throw new Error(`Ruleset "${ruleset.name}" missing required field: version`);
  }

  validateVersion(ruleset.version);

  // Optional fields
  if (ruleset.tags && !Array.isArray(ruleset.tags)) {
    throw new Error(`Ruleset "${ruleset.name}": tags must be an array`);
  }

  if (ruleset.extends && !Array.isArray(ruleset.extends)) {
    throw new Error(`Ruleset "${ruleset.name}": extends must be an array`);
  }

  // Validate extends references format (category/name)
  if (ruleset.extends) {
    ruleset.extends.forEach((ref) => {
      if (typeof ref !== 'string' || !ref.includes('/')) {
        throw new Error(`Ruleset "${ruleset.name}": invalid extends reference "${ref}". Expected format: "category/name"`);
      }
    });
  }

  return true;
}

/**
 * Validate category structure
 */
function validateCategory(category, categoryName) {
  if (!category.description || typeof category.description !== 'string') {
    throw new Error(`Category "${categoryName}" missing required field: description`);
  }

  if (!category.rulesets || !Array.isArray(category.rulesets)) {
    throw new Error(`Category "${categoryName}" missing required field: rulesets (array)`);
  }

  // Validate each ruleset in category
  category.rulesets.forEach((ruleset) => {
    validateRulesetMetadata(ruleset, categoryName);
  });

  // Optional extensible flag
  if (category.extensible !== undefined && typeof category.extensible !== 'boolean') {
    throw new Error(`Category "${categoryName}": extensible must be a boolean`);
  }

  return true;
}

/**
 * Validate preset bundle structure
 */
function validatePreset(preset, presetName) {
  if (!preset.description || typeof preset.description !== 'string') {
    throw new Error(`Preset "${presetName}" missing required field: description`);
  }

  if (!preset.includes || !Array.isArray(preset.includes)) {
    throw new Error(`Preset "${presetName}" missing required field: includes (array)`);
  }

  // Validate includes references format (category/name)
  preset.includes.forEach((ref) => {
    if (typeof ref !== 'string' || !ref.includes('/')) {
      throw new Error(`Preset "${presetName}": invalid includes reference "${ref}". Expected format: "category/name"`);
    }
  });

  return true;
}

/**
 * Validate complete manifest structure
 */
function validateManifest(manifest) {
  // Required top-level fields
  if (!manifest.version) {
    throw new Error('Manifest missing required field: version');
  }

  if (!manifest.lastUpdated) {
    throw new Error('Manifest missing required field: lastUpdated');
  }

  if (!manifest.categories || typeof manifest.categories !== 'object') {
    throw new Error('Manifest missing required field: categories (object)');
  }

  // Validate version and date
  validateVersion(manifest.version);
  validateISODate(manifest.lastUpdated, 'lastUpdated');

  // Validate each category
  Object.keys(manifest.categories).forEach((categoryName) => {
    validateCategory(manifest.categories[categoryName], categoryName);
  });

  // Validate presets if present
  if (manifest.presets) {
    if (typeof manifest.presets !== 'object') {
      throw new Error('Manifest presets must be an object');
    }

    Object.keys(manifest.presets).forEach((presetName) => {
      validatePreset(manifest.presets[presetName], presetName);
    });
  }

  return true;
}

/**
 * Parse manifest from YAML string
 */
function parseManifestString(yamlContent) {
  if (!yamlContent || typeof yamlContent !== 'string') {
    throw new Error('Manifest content must be a non-empty string');
  }

  let manifest;
  try {
    manifest = YAML.parse(yamlContent);
  } catch (error) {
    throw new Error(`Failed to parse manifest YAML: ${error.message}`);
  }

  if (!manifest || typeof manifest !== 'object') {
    throw new Error('Manifest must be a valid YAML object');
  }

  validateManifest(manifest);

  return manifest;
}

/**
 * Parse manifest from file
 */
function parseManifestFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Manifest file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  return parseManifestString(content);
}

/**
 * Find ruleset by category and name in manifest
 */
function findRuleset(manifest, categoryName, rulesetName) {
  const category = manifest.categories[categoryName];

  if (!category) {
    return null;
  }

  return category.rulesets.find((r) => r.name === rulesetName) || null;
}

/**
 * Get all rulesets from manifest (flattened with category prefix)
 */
function getAllRulesets(manifest) {
  const rulesets = [];

  Object.keys(manifest.categories).forEach((categoryName) => {
    const category = manifest.categories[categoryName];

    category.rulesets.forEach((ruleset) => {
      rulesets.push({
        ...ruleset,
        category: categoryName,
        ref: `${categoryName}/${ruleset.name}`
      });
    });
  });

  return rulesets;
}

/**
 * Resolve preset to list of ruleset references
 */
function resolvePreset(manifest, presetName) {
  if (!manifest.presets || !manifest.presets[presetName]) {
    throw new Error(`Preset not found: ${presetName}`);
  }

  const preset = manifest.presets[presetName];

  // Validate all references exist
  preset.includes.forEach((ref) => {
    const [categoryName, rulesetName] = ref.split('/');
    const ruleset = findRuleset(manifest, categoryName, rulesetName);

    if (!ruleset) {
      throw new Error(`Preset "${presetName}" references non-existent ruleset: ${ref}`);
    }
  });

  return {
    name: presetName,
    description: preset.description,
    includes: preset.includes
  };
}

/**
 * Check if manifest has a specific category
 */
function hasCategory(manifest, categoryName) {
  return manifest.categories && manifest.categories[categoryName] !== undefined;
}

/**
 * Get category info
 */
function getCategory(manifest, categoryName) {
  if (!hasCategory(manifest, categoryName)) {
    return null;
  }

  return {
    name: categoryName,
    ...manifest.categories[categoryName]
  };
}

/**
 * List all categories
 */
function listCategories(manifest) {
  return Object.keys(manifest.categories).map((name) => ({
    name,
    description: manifest.categories[name].description,
    extensible: manifest.categories[name].extensible || false,
    rulesetCount: manifest.categories[name].rulesets.length
  }));
}

/**
 * List all presets
 */
function listPresets(manifest) {
  if (!manifest.presets) {
    return [];
  }

  return Object.keys(manifest.presets).map((name) => ({
    name,
    description: manifest.presets[name].description,
    includesCount: manifest.presets[name].includes.length
  }));
}

module.exports = {
  validateVersion,
  validateISODate,
  validateRulesetMetadata,
  validateCategory,
  validatePreset,
  validateManifest,
  parseManifestString,
  parseManifestFile,
  findRuleset,
  getAllRulesets,
  resolvePreset,
  hasCategory,
  getCategory,
  listCategories,
  listPresets
};
