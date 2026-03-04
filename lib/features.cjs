/**
 * Feature Management System
 * Tracks, manages, and organizes application features
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const { extractContractId } = require('./id-utils.cjs');
const { getTrackingMode, getContractsDirectory } = require('./config.cjs');

const FEATURES_FILE = '.grabby/features.yaml';
const FEATURE_INDEX_FILE = '.grabby/features.index.json';
const ACTIVE_CONTRACTS_DIR = 'contracts/active';
const ARCHIVE_CONTRACTS_DIR = 'contracts/archive';
const HISTORY_DIR = '.grabby/history';
const HISTORY_MAX_SIZE = 32 * 1024; // 32KB max per history file (~8000 tokens)
const HISTORY_FILE_PREFIX = 'history-';
const ARCHIVABLE_ARTIFACT_SUFFIXES = [
  '.fc.md',
  '.plan.yaml',
  '.audit.md',
  '.brief.md',
  '.backlog.yaml',
  '.prompt.md',
  '.session.json',
  '.session.yaml',
];

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
    let contractId;
    try {
      contractId = extractContractId(content, file);
    } catch {
      contractId = file.replace('.fc.md', '');
    }

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

function normalizeContractStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (!normalized) return 'draft';
  return normalized;
}

function normalizeRepoPath(targetPath) {
  return String(targetPath || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function getActiveContractsDir(baseDir = process.cwd()) {
  const trackingMode = getTrackingMode(null, baseDir);
  if (trackingMode === 'local-only') {
    return getContractsDirectory(baseDir);
  }
  const activeDir = path.join(baseDir, ACTIVE_CONTRACTS_DIR);
  if (fs.existsSync(activeDir)) {
    return activeDir;
  }
  return path.join(baseDir, 'contracts');
}

function getCandidateContractsDirs(baseDir = process.cwd()) {
  const trackingMode = getTrackingMode(null, baseDir);
  if (trackingMode === 'local-only') {
    return [getContractsDirectory(baseDir)];
  }

  const candidates = [];
  const activeDir = path.join(baseDir, ACTIVE_CONTRACTS_DIR);
  const rootDir = path.join(baseDir, 'contracts');

  if (fs.existsSync(activeDir)) {
    candidates.push(activeDir);
  }
  if (fs.existsSync(rootDir)) {
    candidates.push(rootDir);
  }
  if (candidates.length === 0) {
    candidates.push(rootDir);
  }

  return [...new Set(candidates.map((entry) => path.normalize(entry)))];
}

function getArchiveRoot(baseDir = process.cwd()) {
  return path.join(baseDir, ARCHIVE_CONTRACTS_DIR);
}

function getFeatureArtifactPaths(id, baseDir = process.cwd()) {
  const normalizedId = String(id || '').trim().toUpperCase();
  const activeDir = getCandidateContractsDirs(baseDir).find((dir) => fs.existsSync(path.join(dir, `${normalizedId}.fc.md`)))
    || getActiveContractsDir(baseDir);
  return {
    activeDir,
    contractPath: path.join(activeDir, `${normalizedId}.fc.md`),
    planPath: path.join(activeDir, `${normalizedId}.plan.yaml`),
    auditPath: path.join(activeDir, `${normalizedId}.audit.md`),
  };
}

function getFeatureFileTimestamp(filePath) {
  try {
    return fs.statSync(filePath).mtime.toISOString();
  } catch {
    return null;
  }
}

function mergeFeatureMetadata(feature, existing = null) {
  if (!existing) {
    return feature;
  }

  const preserved = {};
  ['gcDisposition', 'gcReason', 'gcUpdatedAt', 'gcReviewBy'].forEach((key) => {
    if (existing[key] != null) {
      preserved[key] = existing[key];
    }
  });

  return {
    ...feature,
    ...preserved,
  };
}

function getFeatureStaleness(feature, options = {}) {
  const maxAgeDays = Number(options.maxAgeDays || 30);
  const anchor = feature.lastModifiedAt || feature.closedAt || null;
  if (!anchor) {
    return null;
  }

  const ageMs = Date.now() - new Date(anchor).getTime();
  const ageDays = Math.floor(ageMs / 86400000);
  if (!Number.isFinite(ageDays) || ageDays < maxAgeDays) {
    return null;
  }

  return {
    stale: true,
    ageDays,
    reason: `No contract activity for ${ageDays} days`,
  };
}

function extractSection(content, heading) {
  return String(content || '').match(new RegExp(`## ${heading}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, 'i'))?.[1]?.trim() || '';
}

function summarizeText(content, wordLimit = 250) {
  const words = String(content || '')
    .replace(/\r/g, ' ')
    .replace(/\n+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length <= wordLimit) {
    return words.join(' ');
  }
  return `${words.slice(0, wordLimit).join(' ')}...`;
}

function extractMetadataLine(content, label) {
  return String(content || '').match(new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\\n\\r]+)`, 'i'))?.[1]?.trim() || null;
}

function parseFeatureContract(content, contractPath, baseDir = process.cwd()) {
  const fileName = path.basename(contractPath);
  const id = extractContractId(content, fileName);
  const title = (
    content.match(/^#\s+Feature Contract:\s*(.+)$/m)?.[1]
    || content.match(/^#\s+FC:\s*(.+)$/m)?.[1]
    || content.match(/^#\s+(.+)$/m)?.[1]
    || fileName.replace(/\.fc\.md$/i, '')
  ).trim();
  const status = normalizeContractStatus(content.match(/\*\*Status:\*\*\s*([^\n\r|]+)/i)?.[1]);
  const branch = content.match(/\*\*Branch:\*\*\s*([^\n\r]+)/i)?.[1]?.trim() || null;
  const type = (
    content.match(/^Type:\s*([^\n\r]+)/im)?.[1]
    || content.match(/^CONTRACT_TYPE:\s*([^\n\r]+)/im)?.[1]
    || 'feat'
  ).trim();
  const contractDir = path.join(baseDir, 'contracts');
  const planPath = path.join(path.dirname(contractPath), `${id}.plan.yaml`);
  const auditPath = path.join(path.dirname(contractPath), `${id}.audit.md`);

  return {
    id,
    title,
    type,
    status,
    branch,
    lastModifiedAt: getFeatureFileTimestamp(contractPath),
    contractPath: path.relative(baseDir, contractPath).replace(/\\/g, '/'),
    planPath: fs.existsSync(planPath) ? path.relative(baseDir, planPath).replace(/\\/g, '/') : null,
    auditPath: fs.existsSync(auditPath) ? path.relative(baseDir, auditPath).replace(/\\/g, '/') : null,
    archivePath: null,
    closedAt: null,
  };
}

function parseArchivedBundle(content, bundlePath, baseDir = process.cwd()) {
  const id = String(content.match(/^ID:\s*([^\n\r]+)/m)?.[1] || path.basename(bundlePath).replace(/\.bundle\.md$/i, '')).trim();
  const title = String(content.match(/^Title:\s*([^\n\r]+)/m)?.[1] || id).trim();
  const type = String(content.match(/^Type:\s*([^\n\r]+)/m)?.[1] || 'FEATURE_CONTRACT').trim();
  const status = normalizeContractStatus(content.match(/^Status:\s*([^\n\r]+)/m)?.[1] || 'complete');
  const branch = String(content.match(/^Branch:\s*([^\n\r]+)/m)?.[1] || '').trim() || null;
  const closedAt = String(content.match(/^Closed:\s*([^\n\r]+)/m)?.[1] || '').trim() || null;

  return {
    id,
    title,
    type,
    status,
    branch,
    contractPath: null,
    planPath: null,
    auditPath: null,
    archivePath: path.relative(baseDir, bundlePath).replace(/\\/g, '/'),
    closedAt,
  };
}

function listContractFeatures(baseDir = process.cwd()) {
  const contractsDirs = getCandidateContractsDirs(baseDir).filter((dir) => fs.existsSync(dir));
  if (contractsDirs.length === 0) {
    return [];
  }

  const features = [];
  const seenIds = new Set();

  contractsDirs.forEach((contractsDir) => {
    fs.readdirSync(contractsDir)
      .filter((file) => file.endsWith('.fc.md'))
      .sort()
      .forEach((file) => {
        const contractPath = path.join(contractsDir, file);
        const content = fs.readFileSync(contractPath, 'utf8');
        try {
          const parsed = parseFeatureContract(content, contractPath, baseDir);
          if (seenIds.has(parsed.id)) {
            return;
          }
          seenIds.add(parsed.id);
          features.push(parsed);
        } catch {
          // Ignore malformed contracts during feature discovery.
        }
      });
  });

  return features.sort((a, b) => a.id.localeCompare(b.id));
}

function listArchivedFeatures(baseDir = process.cwd()) {
  const results = [];

  // Read from legacy bundle files
  const archiveRoot = getArchiveRoot(baseDir);
  if (fs.existsSync(archiveRoot)) {
    const bundles = [];
    const stack = [archiveRoot];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
          continue;
        }
        if (!entry.name.endsWith('.bundle.md')) continue;
        bundles.push(fullPath);
      }
    }
    results.push(...bundles
      .sort()
      .map((bundlePath) => parseArchivedBundle(fs.readFileSync(bundlePath, 'utf8'), bundlePath, baseDir)));
  }

  // Read from compact history files
  const historyDir = path.join(baseDir, HISTORY_DIR);
  if (fs.existsSync(historyDir)) {
    const historyFiles = fs.readdirSync(historyDir)
      .filter((f) => f.startsWith(HISTORY_FILE_PREFIX) && f.endsWith('.yaml'))
      .sort();
    for (const file of historyFiles) {
      const historyPath = path.join(historyDir, file);
      const history = yaml.parse(fs.readFileSync(historyPath, 'utf8'));
      if (history?.entries) {
        for (const entry of history.entries) {
          results.push({
            id: entry.id,
            title: entry.title,
            status: 'archived',
            archivePath: path.relative(baseDir, historyPath).replace(/\\/g, '/'),
            closedAt: entry.closedAt,
            objective: entry.objective,
            type: entry.type,
            files: entry.files,
          });
        }
      }
    }
  }

  return results;
}

function getContractFeatureStatus(id, baseDir = process.cwd()) {
  const normalizedId = String(id || '').trim().toUpperCase();
  return listContractFeatures(baseDir).find((feature) => feature.id === normalizedId)
    || listArchivedFeatures(baseDir).find((feature) => feature.id === normalizedId)
    || loadFeatureIndex(baseDir)?.features?.find((feature) => feature.id === normalizedId)
    || null;
}

function refreshFeatureIndex(baseDir = process.cwd()) {
  const grabbyDir = path.join(baseDir, '.grabby');
  if (!fs.existsSync(grabbyDir)) {
    fs.mkdirSync(grabbyDir, { recursive: true });
  }

  const trackingMode = getTrackingMode(null, baseDir);
  const existingIndex = loadFeatureIndex(baseDir);
  const existingById = new Map((existingIndex?.features || []).map((feature) => [feature.id, feature]));

  // In local-only mode, skip local contracts from canonical feature indexing
  const active = trackingMode === 'local-only' ? [] : listContractFeatures(baseDir);
  const archived = listArchivedFeatures(baseDir);
  const features = [...active, ...archived]
    .map((feature) => mergeFeatureMetadata(feature, existingById.get(feature.id)))
    .sort((a, b) => a.id.localeCompare(b.id));
  const payload = {
    generatedAt: new Date().toISOString(),
    trackingMode,
    features,
  };
  const indexPath = path.join(baseDir, FEATURE_INDEX_FILE);
  fs.writeFileSync(indexPath, JSON.stringify(payload, null, 2));
  return {
    indexPath,
    features,
    trackingMode,
  };
}

function loadFeatureIndex(baseDir = process.cwd()) {
  const indexPath = path.join(baseDir, FEATURE_INDEX_FILE);
  if (!fs.existsSync(indexPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(indexPath, 'utf8'));
}

function findLegacyTicketFiles(baseDir = process.cwd()) {
  const found = [];
  const ticketsDir = path.join(baseDir, 'tickets');

  if (fs.existsSync(ticketsDir)) {
    for (const entry of fs.readdirSync(ticketsDir)) {
      if (entry.endsWith('.md')) {
        found.push(path.join('tickets', entry).replace(/\\/g, '/'));
      }
    }
  }

  for (const entry of fs.readdirSync(baseDir)) {
    if (!entry.endsWith('.md')) continue;
    if (entry.endsWith('.fc.md') || entry.endsWith('.audit.md') || entry.endsWith('.brief.md') || entry.endsWith('.prompt.md')) continue;
    if (/^[A-Za-z][A-Za-z0-9]+-\d+\.md$/i.test(entry)) {
      found.push(entry);
    }
  }

  return found.sort();
}

function formatFeatureTable(features) {
  if (!features || features.length === 0) {
    return 'No feature contracts found.';
  }

  const headers = ['ID', 'Title', 'Type', 'Status', 'Branch'];
  const rows = features.map((feature) => [
    feature.id,
    feature.title,
    feature.type,
    feature.status,
    feature.branch || '-',
  ]);
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => String(row[index]).length)));
  const renderRow = (row) => row.map((cell, index) => String(cell).padEnd(widths[index], ' ')).join('  ');

  return [
    renderRow(headers),
    widths.map((width) => '-'.repeat(width)).join('  '),
    ...rows.map(renderRow),
  ].join('\n');
}

function formatFeatureStatus(feature) {
  if (!feature) {
    return 'Feature not found.';
  }

  return [
    `ID: ${feature.id}`,
    `Title: ${feature.title}`,
    `Status: ${feature.status}`,
    `Type: ${feature.type}`,
    `Branch: ${feature.branch || '-'}`,
    `Contract: ${feature.contractPath || '-'}`,
    `Plan: ${feature.planPath || '-'}`,
    `Audit: ${feature.auditPath || '-'}`,
    `Archive: ${feature.archivePath || '-'}`,
    `Closed: ${feature.closedAt || '-'}`,
    `GC: ${feature.gcDisposition || '-'}`,
    `GC Reason: ${feature.gcReason || '-'}`,
  ].join('\n');
}

function listGarbageCandidates(baseDir = process.cwd(), options = {}) {
  const active = listContractFeatures(baseDir);
  const existingIndex = loadFeatureIndex(baseDir);
  const existingById = new Map((existingIndex?.features || []).map((feature) => [feature.id, feature]));

  return active
    .map((feature) => mergeFeatureMetadata(feature, existingById.get(feature.id)))
    .map((feature) => {
      if (['complete', 'completed'].includes(feature.status)) {
        return {
          ...feature,
          stale: true,
          staleReason: 'Completed feature still lives in active contracts',
          recommendedAction: 'archive',
        };
      }

      const staleness = getFeatureStaleness(feature, options);
      if (!staleness) {
        return null;
      }

      if (feature.gcDisposition === 'keep') {
        return null;
      }

      return {
        ...feature,
        stale: true,
        staleDays: staleness.ageDays,
        staleReason: staleness.reason,
        recommendedAction: feature.gcDisposition || 'choose',
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function recordGarbageDisposition(featureId, disposition, baseDir = process.cwd(), options = {}) {
  const normalizedId = String(featureId || '').trim().toUpperCase();
  const normalizedDisposition = String(disposition || '').trim().toLowerCase();
  if (!['keep', 'archive'].includes(normalizedDisposition)) {
    throw new Error(`Unsupported garbage-collector disposition: ${disposition}`);
  }

  if (normalizedDisposition === 'archive') {
    return createArchiveBundle(normalizedId, baseDir, options);
  }

  const refreshed = refreshFeatureIndex(baseDir);
  const indexPath = path.join(baseDir, FEATURE_INDEX_FILE);
  const payload = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const feature = payload.features.find((entry) => entry.id === normalizedId);
  if (!feature) {
    throw new Error(`Feature ${normalizedId} not found`);
  }

  feature.gcDisposition = 'keep';
  feature.gcReason = String(options.reason || 'Developer kept this hanging story active').trim();
  feature.gcUpdatedAt = options.recordedAt || new Date().toISOString();
  fs.writeFileSync(indexPath, JSON.stringify(payload, null, 2));

  return {
    id: normalizedId,
    disposition: feature.gcDisposition,
    reason: feature.gcReason,
    indexPath: path.relative(baseDir, refreshed.indexPath).replace(/\\/g, '/'),
  };
}

// ============================================================================
// COMPACT HISTORY MANAGEMENT
// ============================================================================

/**
 * Get the current history file path, creating a new one if current exceeds size limit
 */
function getCurrentHistoryFile(baseDir = process.cwd()) {
  const historyDir = path.join(baseDir, HISTORY_DIR);
  if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir, { recursive: true });
  }

  const files = fs.readdirSync(historyDir)
    .filter((f) => f.startsWith(HISTORY_FILE_PREFIX) && f.endsWith('.yaml'))
    .sort();

  if (files.length === 0) {
    return path.join(historyDir, `${HISTORY_FILE_PREFIX}001.yaml`);
  }

  const currentFile = path.join(historyDir, files[files.length - 1]);
  const stats = fs.statSync(currentFile);

  if (stats.size >= HISTORY_MAX_SIZE) {
    const nextNum = parseInt(files[files.length - 1].replace(HISTORY_FILE_PREFIX, '').replace('.yaml', ''), 10) + 1;
    return path.join(historyDir, `${HISTORY_FILE_PREFIX}${String(nextNum).padStart(3, '0')}.yaml`);
  }

  return currentFile;
}

/**
 * Truncate text to a maximum length, adding ellipsis if truncated
 */
function truncateText(text, maxLength = 100) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength - 3) + '...';
}

/**
 * Add a completed feature to the compact history
 */
function addToHistory(entry, baseDir = process.cwd()) {
  const historyFile = getCurrentHistoryFile(baseDir);
  let history = { version: '1.0', entries: [] };

  if (fs.existsSync(historyFile)) {
    history = yaml.parse(fs.readFileSync(historyFile, 'utf8')) || history;
  }

  history.entries.push(entry);
  history.lastUpdated = new Date().toISOString();

  fs.writeFileSync(historyFile, yaml.stringify(history), 'utf8');
  return historyFile;
}

/**
 * Load all history entries from all history files
 */
function loadAllHistory(baseDir = process.cwd()) {
  const historyDir = path.join(baseDir, HISTORY_DIR);
  if (!fs.existsSync(historyDir)) {
    return [];
  }

  const files = fs.readdirSync(historyDir)
    .filter((f) => f.startsWith(HISTORY_FILE_PREFIX) && f.endsWith('.yaml'))
    .sort();

  const allEntries = [];
  for (const file of files) {
    const content = yaml.parse(fs.readFileSync(path.join(historyDir, file), 'utf8'));
    if (content?.entries) {
      allEntries.push(...content.entries);
    }
  }

  return allEntries;
}

/**
 * Create a compact history entry from a completed feature
 */
function createCompactHistoryEntry(parsed, contractContent, planData, closedAt) {
  const files = (planData?.files || [])
    .map((f) => f.path || f)
    .filter(Boolean)
    .slice(0, 10); // Limit to 10 files

  return {
    id: parsed.id,
    title: truncateText(parsed.title, 60),
    objective: truncateText(parsed.objective || extractSection(contractContent, 'Objective'), 150),
    type: parsed.type || 'feature',
    files: files.length > 0 ? files : undefined,
    closedAt,
  };
}

function createArchiveBundle(featureId, baseDir = process.cwd(), options = {}) {
  const normalizedId = String(featureId || '').trim().toUpperCase();
  const artifactPaths = getFeatureArtifactPaths(normalizedId, baseDir);
  if (!fs.existsSync(artifactPaths.contractPath)) {
    throw new Error(`Feature contract not found for ${normalizedId}`);
  }

  const contractContent = fs.readFileSync(artifactPaths.contractPath, 'utf8');
  const parsed = parseFeatureContract(contractContent, artifactPaths.contractPath, baseDir);
  if (parsed.id !== normalizedId) {
    throw new Error(`Contract ID mismatch for ${normalizedId}`);
  }
  if (!['complete', 'completed'].includes(parsed.status)) {
    throw new Error(`Feature ${normalizedId} must be marked complete before close`);
  }

  const planData = fs.existsSync(artifactPaths.planPath)
    ? yaml.parse(fs.readFileSync(artifactPaths.planPath, 'utf8'))
    : { files: [] };
  const closedAt = options.closedAt || new Date().toISOString();

  // Create compact history entry instead of verbose bundle
  const historyEntry = createCompactHistoryEntry(parsed, contractContent, planData, closedAt);
  const historyFile = addToHistory(historyEntry, baseDir);

  // Remove all feature-scoped artifacts generated from the same feature ID.
  ARCHIVABLE_ARTIFACT_SUFFIXES.forEach((suffix) => {
    const artifactPath = path.join(artifactPaths.activeDir, `${normalizedId}${suffix}`);
    if (fs.existsSync(artifactPath)) {
      fs.rmSync(artifactPath, { force: true });
    }
  });

  const refreshed = refreshFeatureIndex(baseDir);
  return {
    id: normalizedId,
    historyFile: path.relative(baseDir, historyFile).replace(/\\/g, '/'),
    closedAt,
    indexPath: path.relative(baseDir, refreshed.indexPath).replace(/\\/g, '/'),
  };
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
  FEATURES_FILE,
  FEATURE_INDEX_FILE,
  HISTORY_DIR,
  HISTORY_MAX_SIZE,
  ARCHIVABLE_ARTIFACT_SUFFIXES,
  parseFeatureContract,
  parseArchivedBundle,
  listContractFeatures,
  listArchivedFeatures,
  getContractFeatureStatus,
  refreshFeatureIndex,
  loadFeatureIndex,
  findLegacyTicketFiles,
  formatFeatureTable,
  formatFeatureStatus,
  getFeatureArtifactPaths,
  getCandidateContractsDirs,
  listGarbageCandidates,
  recordGarbageDisposition,
  createArchiveBundle,
  getCurrentHistoryFile,
  addToHistory,
  loadAllHistory,
  createCompactHistoryEntry,
};
