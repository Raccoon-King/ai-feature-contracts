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
const { loadConfig } = require('./config.cjs');
const { readLock, writeLock, updateLock, isLockStale, getLockAge } = require('./sync-lock.cjs');
const { syncWithCentral, detectDrift, applySyncMode, parseDuration, isGitAvailable } = require('./rules-sync.cjs');
const { parseManifestFile, getAllRulesets } = require('./manifest-parser.cjs');

/**
 * Check if rulesets are configured
 */
function isRulesetsConfigured(config) {
  return !!(config.rulesets &&
            config.rulesets.source &&
            config.rulesets.source.repo &&
            config.rulesets.source.repo.length > 0);
}

/**
 * Perform sync check before command execution
 */
async function performSyncCheck(commandName, options = {}, cwd = process.cwd()) {
  const config = loadConfig(cwd);

  // Skip if rulesets not configured
  if (!isRulesetsConfigured(config)) {
    return {
      skipped: true,
      reason: 'not_configured'
    };
  }

  // Check if sync check is enabled for this command
  const checkOnCommands = config.rulesets.sync?.checkOnCommands || [];
  if (!checkOnCommands.includes(commandName)) {
    return {
      skipped: true,
      reason: 'command_not_monitored'
    };
  }

  const logger = options.logger || console;
  const lockPath = config.rulesets.lockPath || '.grabby/rulesets/sync.lock.yaml';

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
  const syncInterval = config.rulesets.sync?.interval || '24h';
  const maxAge = parseDuration(syncInterval);
  const stale = isLockStale(lock, maxAge);

  if (stale) {
    const age = getLockAge(lock);
    const hours = Math.floor(age / (60 * 60 * 1000));
    logger.warn(`⚠️  Sync is stale (${hours}h old) - consider running: grabby rules sync`);
  }

  // Check for drift if manifest is cached
  const cacheDir = config.rulesets.cacheDir || '.grabby/rulesets/cache';
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
  const syncMode = config.rulesets.sync?.mode || 'warn';
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

/**
 * Add ruleset snapshot to contract on creation
 */
async function addRulesetSnapshotToContract(contractPath, cwd = process.cwd()) {
  const config = loadConfig(cwd);

  if (!isRulesetsConfigured(config)) {
    return false;
  }

  if (!config.rulesets.sync?.recordSnapshot) {
    return false;
  }

  const lockPath = config.rulesets.lockPath || '.grabby/rulesets/sync.lock.yaml';
  const lock = readLock(lockPath, cwd);

  if (!lock) {
    return false;
  }

  const cacheDir = config.rulesets.cacheDir || '.grabby/rulesets/cache';
  const manifestPath = path.join(cwd, cacheDir, 'central-repo', 'manifest.yaml');

  if (!fs.existsSync(manifestPath)) {
    return false;
  }

  const manifest = parseManifestFile(manifestPath);

  // Get existing metadata or create new
  let metadata = parseContractMetadata(contractPath) || {};

  // Add ruleset snapshot
  const snapshot = createRulesetSnapshot(lock, manifest);

  if (snapshot) {
    metadata.rulesets = snapshot;
  }

  // Write metadata to contract
  writeContractMetadata(contractPath, metadata);

  return true;
}

/**
 * Update contract metadata with drift check
 */
async function updateContractDriftCheck(contractPath, checkResult, commandName, cwd = process.cwd()) {
  const config = loadConfig(cwd);

  if (!isRulesetsConfigured(config)) {
    return false;
  }

  if (!fs.existsSync(contractPath)) {
    return false;
  }

  // Get existing metadata
  let metadata = parseContractMetadata(contractPath) || {};

  // Record drift check
  metadata = recordDriftCheck(metadata, checkResult, commandName);

  // Write updated metadata
  writeContractMetadata(contractPath, metadata);

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
  writeContractMetadata,
  addRulesetSnapshotToContract,
  updateContractDriftCheck,
  formatSyncCheckSummary
};
