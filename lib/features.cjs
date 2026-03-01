/**
 * Feature Management System
 * Tracks, manages, and organizes application features
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

const FEATURES_FILE = '.grabby/features.yaml';

/**
 * Initialize features file if it doesn't exist
 */
function initFeaturesFile(baseDir = process.cwd()) {
  const featuresPath = path.join(baseDir, FEATURES_FILE);
  const grabbyDir = path.join(baseDir, '.grabby');

  if (!fs.existsSync(grabbyDir)) {
    fs.mkdirSync(grabbyDir, { recursive: true });
  }

  if (!fs.existsSync(featuresPath)) {
    const initial = {
      version: '1.0',
      features: [],
      lastUpdated: new Date().toISOString()
    };
    fs.writeFileSync(featuresPath, yaml.stringify(initial), 'utf8');
  }

  return featuresPath;
}

/**
 * Load features from file
 */
function loadFeatures(baseDir = process.cwd()) {
  const featuresPath = initFeaturesFile(baseDir);
  const content = fs.readFileSync(featuresPath, 'utf8');
  return yaml.parse(content) || { version: '1.0', features: [] };
}

/**
 * Save features to file
 */
function saveFeatures(data, baseDir = process.cwd()) {
  const featuresPath = initFeaturesFile(baseDir);
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(featuresPath, yaml.stringify(data), 'utf8');
}

/**
 * Generate next feature ID
 */
function generateFeatureId(features) {
  const maxId = features.reduce((max, f) => {
    const num = parseInt(f.id.replace('F-', ''), 10);
    return num > max ? num : max;
  }, 0);
  return `F-${String(maxId + 1).padStart(3, '0')}`;
}

/**
 * Generate next enhancement ID for a feature
 */
function generateEnhancementId(feature) {
  const enhancements = feature.enhancements || [];
  const maxId = enhancements.reduce((max, e) => {
    const num = parseInt(e.id.replace('E-', ''), 10);
    return num > max ? num : max;
  }, 0);
  return `E-${String(maxId + 1).padStart(3, '0')}`;
}

/**
 * Sanitize feature name for security
 */
function sanitizeName(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\.\./g, '')
    .trim()
    .slice(0, 100);
}

/**
 * List all features
 */
function listFeatures(baseDir = process.cwd(), filters = {}) {
  const data = loadFeatures(baseDir);
  let features = data.features || [];

  // Apply filters
  if (filters.status) {
    features = features.filter(f => f.status === filters.status);
  }
  if (filters.tag) {
    features = features.filter(f => (f.tags || []).includes(filters.tag));
  }
  if (filters.search) {
    const term = filters.search.toLowerCase();
    features = features.filter(f =>
      f.name.toLowerCase().includes(term) ||
      (f.description || '').toLowerCase().includes(term)
    );
  }

  return features;
}

/**
 * Get a single feature by ID
 */
function getFeature(id, baseDir = process.cwd()) {
  const data = loadFeatures(baseDir);
  return data.features.find(f => f.id === id);
}

/**
 * Add a new feature
 */
function addFeature(featureData, baseDir = process.cwd()) {
  const data = loadFeatures(baseDir);

  const feature = {
    id: generateFeatureId(data.features),
    name: sanitizeName(featureData.name),
    description: featureData.description || '',
    status: featureData.status || 'proposed',
    contracts: featureData.contracts || [],
    tags: featureData.tags || [],
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    enhancements: [],
    notes: featureData.notes || ''
  };

  data.features.push(feature);
  saveFeatures(data, baseDir);

  return feature;
}

/**
 * Update an existing feature
 */
function updateFeature(id, updates, baseDir = process.cwd()) {
  const data = loadFeatures(baseDir);
  const index = data.features.findIndex(f => f.id === id);

  if (index === -1) {
    throw new Error(`Feature ${id} not found`);
  }

  // Sanitize name if provided
  if (updates.name) {
    updates.name = sanitizeName(updates.name);
  }

  data.features[index] = {
    ...data.features[index],
    ...updates,
    updated: new Date().toISOString()
  };

  saveFeatures(data, baseDir);
  return data.features[index];
}

/**
 * Delete a feature
 */
function deleteFeature(id, baseDir = process.cwd()) {
  const data = loadFeatures(baseDir);
  const index = data.features.findIndex(f => f.id === id);

  if (index === -1) {
    throw new Error(`Feature ${id} not found`);
  }

  const deleted = data.features.splice(index, 1)[0];
  saveFeatures(data, baseDir);
  return deleted;
}

/**
 * Add an enhancement to a feature
 */
function addEnhancement(featureId, enhancementData, baseDir = process.cwd()) {
  const data = loadFeatures(baseDir);
  const feature = data.features.find(f => f.id === featureId);

  if (!feature) {
    throw new Error(`Feature ${featureId} not found`);
  }

  if (!feature.enhancements) {
    feature.enhancements = [];
  }

  const enhancement = {
    id: generateEnhancementId(feature),
    description: enhancementData.description,
    status: enhancementData.status || 'proposed',
    priority: enhancementData.priority || 'medium',
    created: new Date().toISOString(),
    contracts: enhancementData.contracts || []
  };

  feature.enhancements.push(enhancement);
  feature.updated = new Date().toISOString();
  saveFeatures(data, baseDir);

  return enhancement;
}

/**
 * Link a contract to a feature
 */
function linkContract(featureId, contractId, baseDir = process.cwd()) {
  const data = loadFeatures(baseDir);
  const feature = data.features.find(f => f.id === featureId);

  if (!feature) {
    throw new Error(`Feature ${featureId} not found`);
  }

  if (!feature.contracts.includes(contractId)) {
    feature.contracts.push(contractId);
    feature.updated = new Date().toISOString();
    saveFeatures(data, baseDir);
  }

  return feature;
}

/**
 * Discover features from existing contracts
 */
function discoverFeatures(baseDir = process.cwd()) {
  const contractsDir = path.join(baseDir, 'contracts');
  const discovered = [];

  if (!fs.existsSync(contractsDir)) {
    return discovered;
  }

  const files = fs.readdirSync(contractsDir)
    .filter(f => f.endsWith('.fc.md'));

  for (const file of files) {
    const content = fs.readFileSync(path.join(contractsDir, file), 'utf8');

    // Extract contract ID
    const idMatch = content.match(/\*\*ID:\*\*\s*([A-Z]+-\d+)/);
    const contractId = idMatch ? idMatch[1] : file.replace('.fc.md', '');

    // Extract title
    const titleMatch = content.match(/^#\s+Feature Contract:\s*(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : file.replace('.fc.md', '');

    // Extract objective/summary
    const objectiveMatch = content.match(/## Objective\s+(.+?)(?=\n##|\n\n##)/s);
    const summaryMatch = content.match(/## Summary\s+(.+?)(?=\n##|\n\n##)/s);
    const description = (objectiveMatch?.[1] || summaryMatch?.[1] || '').trim();

    // Extract status
    const statusMatch = content.match(/\*\*Status:\*\*\s*(\w+)/);
    const status = statusMatch ? statusMatch[1] : 'draft';

    // Map contract status to feature status
    const featureStatus = {
      'draft': 'proposed',
      'pending': 'proposed',
      'approved': 'in-progress',
      'completed': 'completed',
      'rejected': 'deprecated'
    }[status] || 'proposed';

    discovered.push({
      name: title,
      description: description.slice(0, 200),
      status: featureStatus,
      contracts: [contractId],
      source: file
    });
  }

  return discovered;
}

/**
 * Import discovered features (skip duplicates)
 */
function importDiscoveredFeatures(baseDir = process.cwd()) {
  const discovered = discoverFeatures(baseDir);
  const data = loadFeatures(baseDir);
  const imported = [];

  for (const feat of discovered) {
    // Check if already exists by contract link
    const exists = data.features.some(f =>
      f.contracts.some(c => feat.contracts.includes(c))
    );

    if (!exists) {
      const added = addFeature(feat, baseDir);
      imported.push(added);
    }
  }

  return imported;
}

/**
 * Get feature statistics
 */
function getFeatureStats(baseDir = process.cwd()) {
  const data = loadFeatures(baseDir);
  const features = data.features || [];

  const stats = {
    total: features.length,
    byStatus: {},
    withEnhancements: 0,
    totalEnhancements: 0,
    linkedToContracts: 0
  };

  for (const f of features) {
    // Count by status
    stats.byStatus[f.status] = (stats.byStatus[f.status] || 0) + 1;

    // Count enhancements
    if (f.enhancements?.length > 0) {
      stats.withEnhancements++;
      stats.totalEnhancements += f.enhancements.length;
    }

    // Count contract links
    if (f.contracts?.length > 0) {
      stats.linkedToContracts++;
    }
  }

  return stats;
}

/**
 * Search features by text
 */
function searchFeatures(query, baseDir = process.cwd()) {
  return listFeatures(baseDir, { search: query });
}

/**
 * Get all unique tags
 */
function getAllTags(baseDir = process.cwd()) {
  const data = loadFeatures(baseDir);
  const tagSet = new Set();

  for (const f of data.features) {
    for (const tag of (f.tags || [])) {
      tagSet.add(tag);
    }
  }

  return Array.from(tagSet).sort();
}

module.exports = {
  initFeaturesFile,
  loadFeatures,
  saveFeatures,
  listFeatures,
  getFeature,
  addFeature,
  updateFeature,
  deleteFeature,
  addEnhancement,
  linkContract,
  discoverFeatures,
  importDiscoveredFeatures,
  getFeatureStats,
  searchFeatures,
  getAllTags,
  sanitizeName,
  FEATURES_FILE
};
