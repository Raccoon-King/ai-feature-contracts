/**
 * Rules Sync - Git-based synchronization with central ruleset repository
 *
 * Features:
 * - Clone/pull from central repository
 * - Drift detection (version, hash, content changes)
 * - Multiple sync modes (auto, strict, warn, manual)
 * - Error handling and timeouts
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { ensureDir } = require('./fs-utils.cjs');
const { parseManifestFile, getAllRulesets } = require('./manifest-parser.cjs');
const { readLock, writeLock, updateLock, updateActiveRuleset, hashContent, isLockStale } = require('./sync-lock.cjs');

const DEFAULT_CACHE_DIR = '.grabby/rulesets/cache';
const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds

function getActiveRulesetRef(activeRuleset) {
  if (!activeRuleset || typeof activeRuleset !== 'object') return '';

  const category = String(activeRuleset.category || '').trim();
  const name = String(activeRuleset.name || '').trim();

  if (category.includes('/')) {
    return category;
  }

  if (category && name) {
    return `${category}/${name}`;
  }

  return category;
}

/**
 * Check if git is available
 */
function isGitAvailable() {
  try {
    execSync('git --version', { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Execute git command with timeout and error handling
 */
function execGit(command, options = {}) {
  const timeout = options.timeout || DEFAULT_TIMEOUT_MS;
  const cwd = options.cwd || process.cwd();

  try {
    const output = execSync(command, {
      cwd,
      timeout,
      encoding: 'utf8',
      stdio: options.silent ? 'pipe' : 'inherit'
    });

    return { success: true, output: output || '' };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      code: error.status || 1
    };
  }
}

/**
 * Execute git command safely using spawnSync with argument arrays
 * Prevents shell injection by avoiding string concatenation
 */
function execGitSafe(args, options = {}) {
  const timeout = options.timeout || DEFAULT_TIMEOUT_MS;
  const cwd = options.cwd || process.cwd();

  try {
    const result = spawnSync('git', args, {
      cwd,
      timeout,
      encoding: 'utf8',
      stdio: options.silent ? 'pipe' : 'inherit'
    });

    if (result.error) {
      return { success: false, error: result.error.message, code: 1 };
    }

    if (result.status !== 0) {
      return { success: false, error: result.stderr || 'Git command failed', code: result.status };
    }

    return { success: true, output: result.stdout || '' };
  } catch (error) {
    return { success: false, error: error.message, code: 1 };
  }
}

/**
 * Clone repository
 */
function cloneRepo(repoUrl, targetDir, options = {}) {
  const branch = options.branch || 'main';
  const args = ['clone'];

  if (options.shallow) {
    args.push('--depth', '1');
  }

  args.push('--branch', branch, repoUrl, targetDir);

  return execGitSafe(args, { timeout: options.timeout || 60000, silent: true });
}

/**
 * Pull latest changes
 */
function pullRepo(repoDir, options = {}) {
  const command = 'git pull --ff-only';
  return execGit(command, { cwd: repoDir, timeout: options.timeout, silent: true });
}

/**
 * Get current commit hash
 */
function getCurrentCommit(repoDir) {
  const result = execGit('git rev-parse HEAD', { cwd: repoDir, silent: true });

  if (!result.success) {
    throw new Error(`Failed to get commit hash: ${result.error}`);
  }

  return result.output.trim();
}

/**
 * Get current branch name
 */
function getCurrentBranch(repoDir) {
  const result = execGit('git rev-parse --abbrev-ref HEAD', { cwd: repoDir, silent: true });

  if (!result.success) {
    throw new Error(`Failed to get branch name: ${result.error}`);
  }

  return result.output.trim();
}

/**
 * Sync with central repository
 */
async function syncWithCentral(config, cwd = process.cwd()) {
  if (!config || !config.source || !config.source.repo) {
    throw new Error('Sync config missing required field: source.repo');
  }

  if (!isGitAvailable()) {
    throw new Error('Git is not available. Please install git to use ruleset sync.');
  }

  const cacheDir = path.resolve(cwd, config.cacheDir || DEFAULT_CACHE_DIR);
  const repoDir = path.join(cacheDir, 'central-repo');
  const manifestPath = path.join(repoDir, 'manifest.yaml');

  ensureDir(cacheDir);

  let syncResult;

  // Clone or pull
  if (!fs.existsSync(repoDir)) {
    console.log(`Cloning central repository from ${config.source.repo}...`);

    syncResult = cloneRepo(config.source.repo, repoDir, {
      branch: config.source.branch || 'main',
      shallow: true,
      timeout: config.timeout || 60000
    });

    if (!syncResult.success) {
      throw new Error(`Failed to clone repository: ${syncResult.error}`);
    }
  } else {
    console.log('Pulling latest changes from central repository...');

    syncResult = pullRepo(repoDir, { timeout: config.timeout || 30000 });

    if (!syncResult.success) {
      throw new Error(`Failed to pull repository: ${syncResult.error}`);
    }
  }

  // Verify manifest exists
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found in repository: ${manifestPath}`);
  }

  // Parse manifest
  const manifest = parseManifestFile(manifestPath);

  // Get current commit info
  const commit = getCurrentCommit(repoDir);
  const branch = getCurrentBranch(repoDir);

  return {
    success: true,
    manifest,
    manifestPath,
    source: {
      repo: config.source.repo,
      branch,
      commit,
      version: manifest.version
    }
  };
}

/**
 * Detect drift between local lock and remote manifest
 */
function detectDrift(lock, manifest) {
  if (!lock || !manifest) {
    return { detected: false, changes: [], breaking: false };
  }

  const drift = {
    detected: false,
    changes: [],
    breaking: false
  };

  const remoteRulesets = getAllRulesets(manifest);

  // Check each active ruleset for changes
  lock.active.forEach((activeRuleset) => {
    const activeRef = getActiveRulesetRef(activeRuleset);
    const remote = remoteRulesets.find((r) => r.ref === activeRef);

    if (!remote) {
      // Ruleset removed from remote
      drift.changes.push({
        category: activeRef,
        type: 'removed',
        from: activeRuleset.version,
        to: null,
        breaking: true
      });

      drift.breaking = true;
      return;
    }

    // Check version change
    if (activeRuleset.version !== remote.version) {
      const versionDiff = compareVersions(activeRuleset.version, remote.version);

      drift.changes.push({
        category: activeRef,
        type: 'version_change',
        from: activeRuleset.version,
        to: remote.version,
        breaking: versionDiff.breaking,
        changeType: versionDiff.type
      });

      if (versionDiff.breaking) {
        drift.breaking = true;
      }
    }
  });

  drift.detected = drift.changes.length > 0;

  return drift;
}

/**
 * Compare semantic versions
 */
function compareVersions(from, to) {
  const fromParts = from.split('.').map(Number);
  const toParts = to.split('.').map(Number);

  const [fromMajor, fromMinor, fromPatch] = fromParts;
  const [toMajor, toMinor, toPatch] = toParts;

  if (toMajor > fromMajor) {
    return { type: 'major', breaking: true };
  }

  if (toMinor > fromMinor) {
    return { type: 'minor', breaking: false };
  }

  if (toPatch > fromPatch) {
    return { type: 'patch', breaking: false };
  }

  return { type: 'none', breaking: false };
}

/**
 * Apply sync mode strategy
 */
async function applySyncMode(drift, mode, options = {}) {
  const logger = options.logger || console;

  if (!drift.detected) {
    return { action: 'none', proceed: true };
  }

  switch (mode) {
    case 'auto':
      logger.log('🔄 Rules drift detected - auto-syncing...');
      drift.changes.forEach((change) => {
        logger.log(`  - ${change.category}: ${change.from || 'none'} → ${change.to || 'removed'}`);
      });

      // Auto-merge non-breaking changes
      if (drift.breaking) {
        logger.warn('⚠️  Breaking changes detected - manual review recommended');
      }

      return { action: 'sync', proceed: true };

    case 'strict':
      logger.error('❌ Rules drift detected - blocking execution');
      logger.error('Your local rules are out of sync:');
      drift.changes.forEach((change) => {
        logger.error(`  - ${change.category}: ${change.from || 'none'} → ${change.to || 'removed'}`);
      });
      logger.error('\nRun: grabby rules sync');

      return { action: 'block', proceed: false };

    case 'warn':
      logger.warn('⚠️  Rules drift detected:');
      drift.changes.forEach((change) => {
        logger.warn(`  - ${change.category}: ${change.from || 'none'} → ${change.to || 'removed'}`);
      });
      logger.warn('\nConsider running: grabby rules sync');

      return { action: 'warn', proceed: true };

    case 'manual':
      logger.log('ℹ️  New rule versions available');
      logger.log('Run: grabby rules status');

      return { action: 'none', proceed: true };

    default:
      throw new Error(`Unknown sync mode: ${mode}`);
  }
}

/**
 * Perform full sync check
 */
async function performSyncCheck(config, lockPath, cwd = process.cwd()) {
  const lock = readLock(lockPath, cwd);

  // If no lock exists, initial sync needed
  if (!lock) {
    return {
      needsSync: true,
      reason: 'no_lock',
      lock: null,
      drift: null
    };
  }

  // Check if lock is stale
  const maxAge = config.sync?.interval ? parseDuration(config.sync.interval) : 24 * 60 * 60 * 1000;

  if (isLockStale(lock, maxAge)) {
    return {
      needsSync: true,
      reason: 'stale',
      lock,
      drift: null
    };
  }

  return {
    needsSync: false,
    reason: 'fresh',
    lock,
    drift: null
  };
}

/**
 * Parse duration string (e.g., "24h", "1d", "30m")
 */
function parseDuration(duration) {
  const match = duration.match(/^(\d+)([hdm])$/);

  if (!match) {
    throw new Error(`Invalid duration format: ${duration}. Use format like "24h", "1d", or "30m"`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    case 'm':
      return value * 60 * 1000;
    default:
      throw new Error(`Unknown duration unit: ${unit}`);
  }
}

module.exports = {
  isGitAvailable,
  execGit,
  cloneRepo,
  pullRepo,
  getCurrentCommit,
  getCurrentBranch,
  syncWithCentral,
  detectDrift,
  compareVersions,
  applySyncMode,
  performSyncCheck,
  parseDuration,
  DEFAULT_CACHE_DIR,
  DEFAULT_TIMEOUT_MS
};
