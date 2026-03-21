/**
 * Sync Lock Manager - Manage sync.lock.yaml file for tracking active rulesets
 *
 * Lock file tracks:
 * - Last sync timestamp
 * - Source repository info (repo, branch, commit, version)
 * - Active rulesets with versions and hashes
 * - Checksums for integrity validation
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const YAML = require('yaml');
const { ensureDir } = require('./fs-utils.cjs');

const DEFAULT_LOCK_PATH = '.grabby/rulesets/sync.lock.yaml';

/**
 * Generate SHA-256 hash of content
 */
function hashContent(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Validate lock file structure
 */
function validateLock(lock) {
  if (!lock || typeof lock !== 'object') {
    throw new Error('Lock must be an object');
  }

  if (lock.version !== 1) {
    throw new Error(`Unsupported lock version: ${lock.version}. Expected version 1`);
  }

  if (!lock.lastSync || typeof lock.lastSync !== 'string') {
    throw new Error('Lock missing required field: lastSync (ISO date string)');
  }

  // Validate lastSync is a valid date
  const date = new Date(lock.lastSync);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid lastSync date: ${lock.lastSync}`);
  }

  if (!lock.source || typeof lock.source !== 'object') {
    throw new Error('Lock missing required field: source (object)');
  }

  if (!lock.source.repo || typeof lock.source.repo !== 'string') {
    throw new Error('Lock source missing required field: repo');
  }

  if (!lock.active || !Array.isArray(lock.active)) {
    throw new Error('Lock missing required field: active (array)');
  }

  // Validate each active ruleset
  lock.active.forEach((ruleset, index) => {
    if (!ruleset.category || typeof ruleset.category !== 'string') {
      throw new Error(`Active ruleset at index ${index} missing required field: category`);
    }

    if (!ruleset.version || typeof ruleset.version !== 'string') {
      throw new Error(`Active ruleset "${ruleset.category}" missing required field: version`);
    }

    if (!ruleset.hash || typeof ruleset.hash !== 'string') {
      throw new Error(`Active ruleset "${ruleset.category}" missing required field: hash`);
    }

    if (!ruleset.fetchedAt || typeof ruleset.fetchedAt !== 'string') {
      throw new Error(`Active ruleset "${ruleset.category}" missing required field: fetchedAt`);
    }

    // Validate hash format (sha256:...)
    if (!ruleset.hash.startsWith('sha256:')) {
      throw new Error(`Active ruleset "${ruleset.category}": hash must start with "sha256:"`);
    }
  });

  return true;
}

/**
 * Create empty lock structure
 */
function createEmptyLock(sourceRepo = '', sourceBranch = 'main') {
  return {
    version: 1,
    lastSync: new Date().toISOString(),
    source: {
      repo: sourceRepo,
      branch: sourceBranch,
      commit: '',
      version: ''
    },
    active: [],
    checksums: {
      manifest: ''
    }
  };
}

/**
 * Read lock file from disk
 */
function readLock(lockPath = DEFAULT_LOCK_PATH, cwd = process.cwd()) {
  const fullPath = path.resolve(cwd, lockPath);

  if (!fs.existsSync(fullPath)) {
    return null;
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  const lock = YAML.parse(content);

  validateLock(lock);

  return lock;
}

/**
 * Write lock file to disk
 */
function writeLock(lock, lockPath = DEFAULT_LOCK_PATH, cwd = process.cwd()) {
  validateLock(lock);

  const fullPath = path.resolve(cwd, lockPath);
  const dir = path.dirname(fullPath);

  ensureDir(dir);

  const yamlContent = YAML.stringify(lock, { indent: 2 });
  fs.writeFileSync(fullPath, yamlContent, 'utf8');

  return fullPath;
}

/**
 * Update lock with new sync info
 */
function updateLock(lock, updates) {
  const updated = { ...lock };

  if (updates.lastSync) {
    updated.lastSync = updates.lastSync;
  }

  if (updates.source) {
    updated.source = {
      ...updated.source,
      ...updates.source
    };
  }

  if (updates.active) {
    updated.active = updates.active;
  }

  if (updates.checksums) {
    updated.checksums = {
      ...updated.checksums,
      ...updates.checksums
    };
  }

  return updated;
}

/**
 * Add or update active ruleset in lock
 */
function updateActiveRuleset(lock, ruleset) {
  if (!ruleset.category || !ruleset.version || !ruleset.hash) {
    throw new Error('Ruleset must have category, version, and hash');
  }

  const updated = { ...lock };
  const index = updated.active.findIndex((r) => r.category === ruleset.category);

  const rulesetEntry = {
    category: ruleset.category,
    version: ruleset.version,
    hash: ruleset.hash.startsWith('sha256:') ? ruleset.hash : `sha256:${ruleset.hash}`,
    fetchedAt: ruleset.fetchedAt || new Date().toISOString()
  };

  if (index >= 0) {
    // Update existing
    updated.active[index] = rulesetEntry;
  } else {
    // Add new
    updated.active.push(rulesetEntry);
  }

  return updated;
}

/**
 * Remove active ruleset from lock
 */
function removeActiveRuleset(lock, category) {
  const updated = { ...lock };
  updated.active = updated.active.filter((r) => r.category !== category);
  return updated;
}

/**
 * Find active ruleset by category
 */
function findActiveRuleset(lock, category) {
  return lock.active.find((r) => r.category === category) || null;
}

/**
 * Check if lock is stale (older than maxAge in milliseconds)
 */
function isLockStale(lock, maxAgeMs = 24 * 60 * 60 * 1000) {
  const lastSync = new Date(lock.lastSync);
  const now = new Date();
  const ageMs = now - lastSync;

  return ageMs > maxAgeMs;
}

/**
 * Get lock age in milliseconds
 */
function getLockAge(lock) {
  const lastSync = new Date(lock.lastSync);
  const now = new Date();
  return now - lastSync;
}

/**
 * Verify lock integrity using checksums
 */
function verifyLockIntegrity(lock, manifestContent) {
  if (!lock.checksums || !lock.checksums.manifest) {
    // No checksum to verify
    return { valid: true, reason: 'no_checksum' };
  }

  const expectedHash = lock.checksums.manifest;
  const actualHash = hashContent(manifestContent);

  if (expectedHash !== actualHash) {
    return {
      valid: false,
      reason: 'checksum_mismatch',
      expected: expectedHash,
      actual: actualHash
    };
  }

  return { valid: true, reason: 'checksum_match' };
}

/**
 * Update lock checksums
 */
function updateLockChecksums(lock, manifestContent) {
  const updated = { ...lock };

  updated.checksums = {
    ...updated.checksums,
    manifest: hashContent(manifestContent)
  };

  return updated;
}

/**
 * Initialize lock file if it doesn't exist
 */
function initLock(sourceRepo, sourceBranch = 'main', lockPath = DEFAULT_LOCK_PATH, cwd = process.cwd()) {
  const existing = readLock(lockPath, cwd);

  if (existing) {
    return existing;
  }

  const newLock = createEmptyLock(sourceRepo, sourceBranch);
  writeLock(newLock, lockPath, cwd);

  return newLock;
}

/**
 * Clear lock file
 */
function clearLock(lockPath = DEFAULT_LOCK_PATH, cwd = process.cwd()) {
  const fullPath = path.resolve(cwd, lockPath);

  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
    return true;
  }

  return false;
}

module.exports = {
  hashContent,
  validateLock,
  createEmptyLock,
  readLock,
  writeLock,
  updateLock,
  updateActiveRuleset,
  removeActiveRuleset,
  findActiveRuleset,
  isLockStale,
  getLockAge,
  verifyLockIntegrity,
  updateLockChecksums,
  initLock,
  clearLock,
  DEFAULT_LOCK_PATH
};
