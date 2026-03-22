/**
 * Contract Rulesets - Integration of ruleset sync checks into contract workflow
 *
 * Features:
 * - Auto-sync checks before contract commands
 * - Record ruleset snapshot in contract metadata
 * - Detect and log mid-contract drift
 * - Apply sync mode strategies
 */

const fs = require('fs');
const path = require('path');
const { loadConfig, loadRulesetsConfig } = require('../config.cjs');
const { readLock, writeLock, updateLock, isLockStale, getLockAge } = require('./common/sync-lock.cjs');
const { syncWithCentral, detectDrift, applySyncMode, parseDuration, isGitAvailable } = require('./sync.cjs');
const { parseManifestFile, getAllRulesets } = require('./common/manifest-parser.cjs');

/**
 * Check if rulesets are configured
 */
function isRulesetsConfigured(config) {
  const rulesetsConfig = config?.rulesets || config;
  return !!(rulesetsConfig &&
            rulesetsConfig.source &&
            rulesetsConfig.source.repo &&
            rulesetsConfig.source.repo.length > 0);
}

/**
 * Perform sync check before command execution
 */
async function performSyncCheck(commandName, options = {}, cwd = process.cwd()) {
  const repoConfig = loadConfig(cwd);
  const rulesetsConfig = loadRulesetsConfig(cwd, repoConfig) || repoConfig?.rulesets || null;

  // Skip if rulesets not configured
  if (!isRulesetsConfigured(rulesetsConfig)) {
    return {
      skipped: true,
      reason: 'not_configured'
    };
  }

  // Check if sync check is enabled for this command
  const checkOnCommands = rulesetsConfig.sync?.checkOnCommands || [];
  if (!checkOnCommands.includes(commandName)) {
    return {
      skipped: true,
      reason: 'command_not_monitored'
    };
  }

  const logger = options.logger || console;
  const lockPath = rulesetsConfig.lockPath || '.grabby/rulesets/sync.lock.yaml';

  logger.log('🔍 Checking ruleset sync...');

  // Read lock file
  const lock = readLock(lockPath, cwd);

  if (!lock) {
    logger.warn('⚠️  No sync lock found - run: grabby rules sync');
    return {
      needsSync: true,
      reason: 'no_lock',
      drift: null
    };
  }

  // Check if lock is stale
  const syncInterval = rulesetsConfig.sync?.interval || '24h';
  const maxAge = parseDuration(syncInterval);
  const stale = isLockStale(lock, maxAge);

  if (stale) {
    const age = getLockAge(lock);
    const hours = Math.floor(age / (60 * 60 * 1000));
    logger.warn(`⚠️  Sync is stale (${hours}h old) - consider running: grabby rules sync`);
  }

  // Check for drift if manifest is cached
  const cacheDir = rulesetsConfig.cacheDir || '.grabby/rulesets/cache';
  const manifestPath = path.join(cwd, cacheDir, 'central-repo', 'manifest.yaml');

  if (!fs.existsSync(manifestPath)) {
    logger.warn('⚠️  No cached manifest - run: grabby rules sync');
    return {
      needsSync: true,
      reason: 'no_manifest',
      drift: null
    };
  }

  // Detect drift
  const manifest = parseManifestFile(manifestPath);
  const drift = detectDrift(lock, manifest);

  if (!drift.detected) {
    logger.log('✅ All rulesets up to date');
    return {
      needsSync: false,
      drift: null,
      lock,
      manifest
    };
  }

  // Apply sync mode strategy
  const syncMode = rulesetsConfig.sync?.mode || 'warn';
  const modeResult = await applySyncMode(drift, syncMode, { logger });

  if (!modeResult.proceed) {
    // Strict mode blocked
    return {
      blocked: true,
      reason: 'drift_in_strict_mode',
      drift,
      lock,
      manifest
    };
  }

  // Warn or auto mode - log and continue
  return {
    needsSync: false,
    drift,
    driftAction: modeResult.action,
    lock,
    manifest
  };
}

/**
 * Create ruleset snapshot for contract metadata
 */
function createRulesetSnapshot(lock, manifest) {
  if (!lock || !lock.active || lock.active.length === 0) {
    return null;
  }

  return {
    version: lock.source.version || manifest.version,
    syncedAt: lock.lastSync,
    snapshot: lock.active.map(ruleset => ({
      category: ruleset.category,
      version: ruleset.version,
      hash: ruleset.hash
    })),
    driftChecks: []
  };
}

function getRulesetMetadataConfig(rulesetsConfig = {}) {
  const metadata = rulesetsConfig?.metadata || {};
  return {
    enabled: metadata.enabled !== false,
    location: metadata.location === 'sidecar' ? 'sidecar' : 'frontmatter',
  };
}

function getRulesetSidecarPath(contractPath) {
  return String(contractPath || '').replace(/\.fc\.md$/i, '.rulesets.json');
}

/**
 * Record drift check in contract metadata
 */
function recordDriftCheck(contractMetadata, checkResult, commandName) {
  if (!contractMetadata.rulesets) {
    contractMetadata.rulesets = {
      version: '',
      syncedAt: new Date().toISOString(),
      snapshot: [],
      driftChecks: []
    };
  }

  if (!contractMetadata.rulesets.driftChecks) {
    contractMetadata.rulesets.driftChecks = [];
  }

  const driftCheck = {
    timestamp: new Date().toISOString(),
    command: commandName,
    status: checkResult.drift ? 'drift_detected' : 'clean'
  };

  if (checkResult.drift) {
    driftCheck.action = checkResult.driftAction || 'none';
    driftCheck.changes = checkResult.drift.changes.map(change => ({
      ruleset: change.category,
      from: change.from,
      to: change.to,
      breaking: change.breaking || false
    }));
  }

  contractMetadata.rulesets.driftChecks.push(driftCheck);

  return contractMetadata;
}

/**
 * Parse contract metadata from file
 */
function parseContractMetadata(contractPath) {
  if (!fs.existsSync(contractPath)) {
    return null;
  }

  const content = fs.readFileSync(contractPath, 'utf8');

  // Check for YAML frontmatter
  const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);

  if (!yamlMatch) {
    // No frontmatter - return empty metadata
    return {};
  }

  try {
    const YAML = require('yaml');
    return YAML.parse(yamlMatch[1]) || {};
  } catch (error) {
    console.warn(`Warning: Failed to parse contract metadata: ${error.message}`);
    return {};
  }
}

function readRulesetMetadata(contractPath, rulesetsConfig = {}) {
  const metadata = parseContractMetadata(contractPath) || {};
  const storage = getRulesetMetadataConfig(rulesetsConfig);

  if (storage.location === 'sidecar') {
    const sidecarPath = getRulesetSidecarPath(contractPath);
    if (fs.existsSync(sidecarPath)) {
      try {
        const sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
        if (sidecar && typeof sidecar === 'object') {
          return {
            ...metadata,
            rulesets: sidecar.rulesets || metadata.rulesets,
          };
        }
      } catch (error) {
        console.warn(`Warning: Failed to parse ruleset sidecar: ${error.message}`);
      }
    }
  }

  return metadata;
}

/**
 * Write contract metadata to file
 */
function writeContractMetadata(contractPath, metadata) {
  if (!fs.existsSync(contractPath)) {
    throw new Error(`Contract file not found: ${contractPath}`);
  }

  const content = fs.readFileSync(contractPath, 'utf8');
  const YAML = require('yaml');

  // Remove existing frontmatter if present
  const withoutFrontmatter = content.replace(/^---\n[\s\S]*?\n---\n/, '');

  // Create new frontmatter
  const yamlContent = YAML.stringify(metadata, { indent: 2 });
  const newContent = `---\n${yamlContent}---\n${withoutFrontmatter}`;

  // Backup original file
  const backupPath = `${contractPath}.bak`;
  fs.writeFileSync(backupPath, content, 'utf8');

  try {
    // Write new content
    fs.writeFileSync(contractPath, newContent, 'utf8');

    // Remove backup on success
    fs.unlinkSync(backupPath);

    return true;
  } catch (error) {
    // Restore from backup on error
    if (fs.existsSync(backupPath)) {
      fs.writeFileSync(contractPath, fs.readFileSync(backupPath, 'utf8'), 'utf8');
      fs.unlinkSync(backupPath);
    }
    throw error;
  }
}

function writeRulesetMetadata(contractPath, metadata, rulesetsConfig = {}) {
  const storage = getRulesetMetadataConfig(rulesetsConfig);
  if (!storage.enabled) {
    return false;
  }

  if (storage.location === 'sidecar') {
    const sidecarPath = getRulesetSidecarPath(contractPath);
    const payload = {
      rulesets: metadata.rulesets || null,
    };
    fs.writeFileSync(sidecarPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    return true;
  }

  writeContractMetadata(contractPath, metadata);
  return true;
}

/**
 * Add ruleset snapshot to contract on creation
 */
async function addRulesetSnapshotToContract(contractPath, cwd = process.cwd()) {
  const repoConfig = loadConfig(cwd);
  const rulesetsConfig = loadRulesetsConfig(cwd, repoConfig) || repoConfig?.rulesets || null;

  if (!isRulesetsConfigured(rulesetsConfig)) {
    return false;
  }

  const metadataConfig = getRulesetMetadataConfig(rulesetsConfig);
  if (!metadataConfig.enabled) {
    return false;
  }

  if (!rulesetsConfig.sync?.recordSnapshot) {
    return false;
  }

  const lockPath = rulesetsConfig.lockPath || '.grabby/rulesets/sync.lock.yaml';
  const lock = readLock(lockPath, cwd);

  if (!lock) {
    return false;
  }

  const cacheDir = rulesetsConfig.cacheDir || '.grabby/rulesets/cache';
  const manifestPath = path.join(cwd, cacheDir, 'central-repo', 'manifest.yaml');

  if (!fs.existsSync(manifestPath)) {
    return false;
  }

  const manifest = parseManifestFile(manifestPath);

  // Get existing metadata or create new
  let metadata = readRulesetMetadata(contractPath, rulesetsConfig) || {};

  // Add ruleset snapshot
  const snapshot = createRulesetSnapshot(lock, manifest);

  if (snapshot) {
    metadata.rulesets = snapshot;
  }

  // Write metadata to contract
  writeRulesetMetadata(contractPath, metadata, rulesetsConfig);

  return true;
}

/**
 * Update contract metadata with drift check
 */
async function updateContractDriftCheck(contractPath, checkResult, commandName, cwd = process.cwd()) {
  const repoConfig = loadConfig(cwd);
  const rulesetsConfig = loadRulesetsConfig(cwd, repoConfig) || repoConfig?.rulesets || null;

  if (!isRulesetsConfigured(rulesetsConfig)) {
    return false;
  }

  if (!fs.existsSync(contractPath)) {
    return false;
  }

  // Get existing metadata
  let metadata = readRulesetMetadata(contractPath, rulesetsConfig) || {};

  // Record drift check
  metadata = recordDriftCheck(metadata, checkResult, commandName);

  // Write updated metadata
  writeRulesetMetadata(contractPath, metadata, rulesetsConfig);

  return true;
}

/**
 * Format sync check summary for display
 */
function formatSyncCheckSummary(checkResult) {
  if (checkResult.skipped) {
    return {
      message: 'Sync check skipped',
      details: `Reason: ${checkResult.reason}`
    };
  }

  if (checkResult.blocked) {
    return {
      message: '❌ Execution blocked by sync check',
      details: 'Run: grabby rules sync'
    };
  }

  if (checkResult.needsSync) {
    return {
      message: '⚠️  Sync needed',
      details: 'Run: grabby rules sync'
    };
  }

  if (checkResult.drift) {
    return {
      message: `⚠️  Drift detected (${checkResult.drift.changes.length} changes)`,
      details: `Action: ${checkResult.driftAction}`
    };
  }

  return {
    message: '✅ Rulesets up to date',
    details: null
  };
}

module.exports = {
  isRulesetsConfigured,
  performSyncCheck,
  createRulesetSnapshot,
  recordDriftCheck,
  parseContractMetadata,
  readRulesetMetadata,
  writeContractMetadata,
  writeRulesetMetadata,
  getRulesetSidecarPath,
  addRulesetSnapshotToContract,
  updateContractDriftCheck,
  formatSyncCheckSummary
};
