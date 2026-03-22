/**
 * Rules CLI - Command implementations for ruleset management
 *
 * Commands:
 * - sync: Sync with central repository
 * - list: List available rulesets
 * - search: Search rulesets by query
 * - show: Show ruleset details
 * - add: Add ruleset to active
 * - remove: Remove ruleset from active
 * - status: Show sync status and drift
 * - preset: Apply preset bundle
 */

const fs = require('fs');
const path = require('path');
const { parseManifestFile, getAllRulesets, findRuleset, resolvePreset, listCategories, hasCategory } = require('./manifest-parser.cjs');
const { readLock, writeLock, updateActiveRuleset, removeActiveRuleset, findActiveRuleset, getLockAge, initLock } = require('./sync-lock.cjs');
const { syncWithCentral, detectDrift, isGitAvailable } = require('./rules-sync.cjs');
const { loadConfig, saveConfig } = require('./config.cjs');
const colors = require('./colors.cjs');
const {
  generateSharedRules,
  updateSharedRules,
  listSharedRulesets,
  isAuthoringEnabled,
  getProtectedRulesPath,
  discoverGuidanceFiles,
} = require('./rules-authoring.cjs');

function getLockRulesetRef(ruleset) {
  if (!ruleset || typeof ruleset !== 'object') return '';

  const category = String(ruleset.category || '').trim();
  const name = String(ruleset.name || '').trim();

  if (category.includes('/')) {
    return category;
  }

  if (category && name) {
    return `${category}/${name}`;
  }

  return category;
}

function readRulesetContentForHash(manifestPath, category, name) {
  const repoDir = path.dirname(manifestPath);
  const candidates = [
    path.join(repoDir, category, `${name}.md`),
    path.join(repoDir, 'rulesets', category, `${name}.yaml`),
    path.join(repoDir, 'rulesets', category, `${name}.yml`)
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, 'utf8');
    }
  }

  return '';
}

function buildActiveLockEntries(manifest, manifestPath, activeRefs = []) {
  const allRulesets = getAllRulesets(manifest);
  const fetchedAt = new Date().toISOString();

  return activeRefs
    .map((ref) => {
      const ruleset = allRulesets.find((entry) => entry.ref === ref);

      if (!ruleset) {
        return null;
      }

      const [category, name] = ref.split('/');
      const content = readRulesetContentForHash(manifestPath, category, name) || JSON.stringify(ruleset);
      const hash = require('./sync-lock.cjs').hashContent(content);

      return {
        category: ref,
        name,
        version: ruleset.version,
        hash: `sha256:${hash}`,
        fetchedAt
      };
    })
    .filter(Boolean);
}

/**
 * Format duration in human-readable form
 */
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  return `${seconds} second${seconds !== 1 ? 's' : ''}`;
}

/**
 * Format timestamp
 */
function formatTimestamp(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString();
}

/**
 * Command: grabby rules sync
 */
async function syncCommand(options = {}, cwd = process.cwd()) {
  const config = loadConfig(cwd);

  if (!config.rulesets || !config.rulesets.source || !config.rulesets.source.repo) {
    console.error(colors.red('❌ No central repository configured'));
    console.error('Add rulesets.source.repo to grabby.config.json');
    return 1;
  }

  if (!isGitAvailable()) {
    console.error(colors.red('❌ Git is not available'));
    console.error('Install git to use ruleset sync');
    return 1;
  }

  console.log(colors.cyan('🔄 Syncing with central repository...'));

  try {
    const syncResult = await syncWithCentral({
      source: config.rulesets.source,
      cacheDir: config.rulesets.cacheDir,
      timeout: options.timeout || 60000
    }, cwd);

    if (!syncResult.success) {
      console.error(colors.red(`❌ Sync failed: ${syncResult.error}`));
      return 1;
    }

    // Update or initialize lock
    const lockPath = config.rulesets.lockPath || '.grabby/rulesets/sync.lock.yaml';
    let lock = readLock(lockPath, cwd);

    if (!lock) {
      lock = initLock(config.rulesets.source.repo, config.rulesets.source.branch || 'main', lockPath, cwd);
    }

    // Update lock with sync info
    lock.lastSync = new Date().toISOString();
    lock.source = syncResult.source;
    lock.active = buildActiveLockEntries(syncResult.manifest, syncResult.manifestPath, config.rulesets.active || []);

    writeLock(lock, lockPath, cwd);

    console.log(colors.green('✅ Sync successful'));
    console.log(`📦 Manifest version: ${colors.cyan(syncResult.manifest.version)}`);
    console.log(`⏰ Last sync: ${colors.gray(formatTimestamp(lock.lastSync))}`);

    const allRulesets = getAllRulesets(syncResult.manifest);
    console.log(`📋 Available rulesets: ${colors.cyan(allRulesets.length)}`);

    return 0;
  } catch (error) {
    console.error(colors.red(`❌ Sync error: ${error.message}`));
    return 1;
  }
}

/**
 * Command: grabby rules list
 */
async function listCommand(options = {}, cwd = process.cwd()) {
  const config = loadConfig(cwd);

  if (!config.rulesets || !config.rulesets.source || !config.rulesets.source.repo) {
    console.error(colors.yellow('⚠️  No central repository configured'));
    console.error('Configure rulesets.source.repo in grabby.config.json');
    return 1;
  }

  // Load manifest from cache
  const cacheDir = config.rulesets.cacheDir || '.grabby/rulesets/cache';
  const manifestPath = path.join(cwd, cacheDir, 'central-repo', 'manifest.yaml');

  if (!fs.existsSync(manifestPath)) {
    console.error(colors.yellow('⚠️  No cached manifest found'));
    console.error('Run: grabby rules sync');
    return 1;
  }

  const manifest = parseManifestFile(manifestPath);
  const lock = readLock(config.rulesets.lockPath, cwd);
  const activeRulesets = lock ? lock.active : [];

  const categories = listCategories(manifest);

  // Filter by category if specified
  const filteredCategories = options.category
    ? categories.filter(c => c.name === options.category)
    : categories;

  if (filteredCategories.length === 0) {
    console.log(colors.yellow(`No categories found${options.category ? ` matching "${options.category}"` : ''}`));
    return 0;
  }

  console.log(colors.bold('\nAvailable Rulesets:\n'));

  filteredCategories.forEach(category => {
    console.log(colors.cyan(`${category.name}/`) + colors.gray(` (${category.rulesetCount} rulesets)`));
    console.log(colors.gray(`  ${category.description}`));

    const categoryRulesets = manifest.categories[category.name].rulesets;

    categoryRulesets.forEach(ruleset => {
      const ref = `${category.name}/${ruleset.name}`;
      const isActive = activeRulesets.some(a => getLockRulesetRef(a) === ref);
      const marker = isActive ? colors.green('✓') : colors.gray('○');
      const versionStr = colors.gray(`@${ruleset.version}`);
      const activeStr = isActive ? colors.green(' [active]') : '';
      const tagsStr = ruleset.tags ? colors.gray(` [${ruleset.tags.join(', ')}]`) : '';

      console.log(`  ${marker} ${ruleset.name}${versionStr}${tagsStr}${activeStr}`);
    });

    console.log('');
  });

  return 0;
}

/**
 * Command: grabby rules search
 */
async function searchCommand(query, options = {}, cwd = process.cwd()) {
  if (!query || typeof query !== 'string') {
    console.error(colors.red('❌ Search query required'));
    console.error('Usage: grabby rules search <query>');
    return 1;
  }

  const config = loadConfig(cwd);
  const cacheDir = config.rulesets?.cacheDir || '.grabby/rulesets/cache';
  const manifestPath = path.join(cwd, cacheDir, 'central-repo', 'manifest.yaml');

  if (!fs.existsSync(manifestPath)) {
    console.error(colors.yellow('⚠️  No cached manifest found'));
    console.error('Run: grabby rules sync');
    return 1;
  }

  const manifest = parseManifestFile(manifestPath);
  const allRulesets = getAllRulesets(manifest);

  // Search in name, tags, category
  const queryLower = query.toLowerCase();
  const results = allRulesets.filter(ruleset => {
    const nameMatch = ruleset.name.toLowerCase().includes(queryLower);
    const categoryMatch = ruleset.category.toLowerCase().includes(queryLower);
    const tagMatch = ruleset.tags && ruleset.tags.some(tag => tag.toLowerCase().includes(queryLower));

    return nameMatch || categoryMatch || tagMatch;
  });

  if (results.length === 0) {
    console.log(colors.yellow(`No rulesets found matching "${query}"`));
    return 0;
  }

  console.log(colors.bold(`\nFound ${results.length} ruleset${results.length > 1 ? 's' : ''}:\n`));

  results.forEach((ruleset, index) => {
    console.log(`${colors.cyan((index + 1) + '.')} ${colors.bold(ruleset.ref)}${colors.gray('@' + ruleset.version)}`);
    const category = manifest.categories[ruleset.category];
    if (category && category.description) {
      console.log(`   ${colors.gray(category.description)}`);
    }
    if (ruleset.tags && ruleset.tags.length > 0) {
      console.log(`   ${colors.gray('Tags:')} ${ruleset.tags.join(', ')}`);
    }
    console.log('');
  });

  return 0;
}

/**
 * Command: grabby rules show
 */
async function showCommand(rulesetRef, options = {}, cwd = process.cwd()) {
  if (!rulesetRef || typeof rulesetRef !== 'string') {
    console.error(colors.red('❌ Ruleset reference required'));
    console.error('Usage: grabby rules show <category/name>');
    return 1;
  }

  const [categoryName, rulesetName] = rulesetRef.split('/');

  if (!categoryName || !rulesetName) {
    console.error(colors.red('❌ Invalid format. Use: category/name'));
    return 1;
  }

  const config = loadConfig(cwd);
  const cacheDir = config.rulesets?.cacheDir || '.grabby/rulesets/cache';
  const manifestPath = path.join(cwd, cacheDir, 'central-repo', 'manifest.yaml');

  if (!fs.existsSync(manifestPath)) {
    console.error(colors.yellow('⚠️  No cached manifest found'));
    console.error('Run: grabby rules sync');
    return 1;
  }

  const manifest = parseManifestFile(manifestPath);
  const ruleset = findRuleset(manifest, categoryName, rulesetName);

  if (!ruleset) {
    console.error(colors.red(`❌ Ruleset not found: ${rulesetRef}`));
    return 1;
  }

  const lock = readLock(config.rulesets?.lockPath, cwd);
  const active = lock ? findActiveRuleset(lock, rulesetRef) : null;

  console.log(colors.bold(`\nRuleset: ${colors.cyan(ruleset.name)}`));
  console.log(`Category: ${categoryName}`);
  console.log(`Version: ${colors.gray(ruleset.version)}`);
  console.log(`Status: ${active ? colors.green('Active') : colors.gray('Not active')}`);

  if (ruleset.tags && ruleset.tags.length > 0) {
    console.log(`Tags: ${ruleset.tags.join(', ')}`);
  }

  if (ruleset.extends && ruleset.extends.length > 0) {
    console.log(`Extends: ${ruleset.extends.join(', ')}`);
  } else {
    console.log(`Extends: ${colors.gray('-')}`);
  }

  if (ruleset.compatibleWith && ruleset.compatibleWith.length > 0) {
    console.log(`Compatible with: ${ruleset.compatibleWith.join(', ')}`);
  }

  const category = manifest.categories[categoryName];
  if (category && category.description) {
    console.log(`\nDescription: ${category.description}`);
  }

  console.log('');

  return 0;
}

/**
 * Command: grabby rules add
 */
async function addCommand(rulesetRef, options = {}, cwd = process.cwd()) {
  if (!rulesetRef || typeof rulesetRef !== 'string') {
    console.error(colors.red('❌ Ruleset reference required'));
    console.error('Usage: grabby rules add <category/name>');
    return 1;
  }

  const [categoryName, rulesetName] = rulesetRef.split('/');

  if (!categoryName || !rulesetName) {
    console.error(colors.red('❌ Invalid format. Use: category/name'));
    return 1;
  }

  const config = loadConfig(cwd);

  // Verify ruleset exists in manifest
  const cacheDir = config.rulesets?.cacheDir || '.grabby/rulesets/cache';
  const manifestPath = path.join(cwd, cacheDir, 'central-repo', 'manifest.yaml');

  if (!fs.existsSync(manifestPath)) {
    console.error(colors.yellow('⚠️  No cached manifest found'));
    console.error('Run: grabby rules sync first');
    return 1;
  }

  const manifest = parseManifestFile(manifestPath);
  const ruleset = findRuleset(manifest, categoryName, rulesetName);

  if (!ruleset) {
    console.error(colors.red(`❌ Ruleset not found: ${rulesetRef}`));
    return 1;
  }

  // Initialize rulesets config if not present
  if (!config.rulesets) {
    config.rulesets = {
      source: { repo: '', branch: 'main', version: '' },
      active: [],
      sync: {
        mode: 'warn',
        interval: '24h',
        onDrift: 'warn',
        checkOnCommands: ['task', 'validate', 'plan', 'execute'],
        allowStale: false,
        recordSnapshot: true
      },
      drift: {
        detection: 'hash',
        tolerance: 'patch',
        autoResolve: false,
        notifyChannels: ['cli']
      },
      overrides: {},
      local: [],
      cacheDir: '.grabby/rulesets/cache',
      lockPath: '.grabby/rulesets/sync.lock.yaml'
    };
  }

  if (!config.rulesets.active) {
    config.rulesets.active = [];
  }

  // Check if already active
  if (config.rulesets.active.includes(rulesetRef)) {
    console.log(colors.yellow(`⚠️  ${rulesetRef} is already active`));
    return 0;
  }

  // Add to active list
  config.rulesets.active.push(rulesetRef);

  // Write updated config
  saveConfig(config, cwd);

  console.log(colors.green(`✅ Added ${rulesetRef}@${ruleset.version} to active rulesets`));
  console.log(colors.gray('📝 Updated grabby.config.json'));
  console.log(colors.cyan('🔄 Run \'grabby rules sync\' to fetch ruleset'));

  return 0;
}

/**
 * Command: grabby rules remove
 */
async function removeCommand(rulesetRef, options = {}, cwd = process.cwd()) {
  if (!rulesetRef || typeof rulesetRef !== 'string') {
    console.error(colors.red('❌ Ruleset reference required'));
    console.error('Usage: grabby rules remove <category/name>');
    return 1;
  }

  const config = loadConfig(cwd);

  if (!config.rulesets || !config.rulesets.active || config.rulesets.active.length === 0) {
    console.log(colors.yellow('⚠️  No active rulesets configured'));
    return 0;
  }

  const index = config.rulesets.active.indexOf(rulesetRef);

  if (index === -1) {
    console.log(colors.yellow(`⚠️  ${rulesetRef} is not active`));
    return 0;
  }

  // Remove from active list
  config.rulesets.active.splice(index, 1);

  // Write updated config
  saveConfig(config, cwd);

  // Update lock file if it exists
  const lock = readLock(config.rulesets.lockPath, cwd);
  if (lock) {
    const updated = removeActiveRuleset(lock, rulesetRef);
    writeLock(updated, config.rulesets.lockPath, cwd);
  }

  console.log(colors.green(`✅ Removed ${rulesetRef} from active rulesets`));
  console.log(colors.gray('📝 Updated grabby.config.json'));

  return 0;
}

/**
 * Command: grabby rules status
 */
async function statusCommand(options = {}, cwd = process.cwd()) {
  const config = loadConfig(cwd);

  if (!config.rulesets || !config.rulesets.source || !config.rulesets.source.repo) {
    console.log(colors.yellow('⚠️  No central repository configured'));
    console.log('Configure rulesets.source.repo in grabby.config.json');
    return 1;
  }

  const lock = readLock(config.rulesets.lockPath, cwd);

  if (!lock) {
    console.log(colors.yellow('⚠️  Not synced yet'));
    console.log('Run: grabby rules sync');
    return 1;
  }

  const age = getLockAge(lock);
  const ageStr = formatDuration(age);
  const freshness = age < 60 * 60 * 1000 ? colors.green('Fresh') : colors.yellow('Stale');

  console.log(colors.bold('\nSync Status:'));
  console.log(`${freshness} ${colors.gray(`(synced ${ageStr} ago)`)}`);
  console.log(`\nCentral Repository: ${colors.cyan(lock.source.repo)}`);
  console.log(`Branch: ${lock.source.branch}`);
  console.log(`Commit: ${colors.gray(lock.source.commit.slice(0, 8))}`);
  console.log(`Manifest Version: ${lock.source.version}`);

  console.log(colors.bold(`\nActive Rulesets (${lock.active.length}):`));

  if (lock.active.length === 0) {
    console.log(colors.gray('  (none)'));
  } else {
    lock.active.forEach(ruleset => {
      console.log(`  - ${colors.cyan(getLockRulesetRef(ruleset))}${colors.gray('@' + ruleset.version)} ${colors.green('✅')}`);
    });
  }

  // Check for drift
  const cacheDir = config.rulesets.cacheDir || '.grabby/rulesets/cache';
  const manifestPath = path.join(cwd, cacheDir, 'central-repo', 'manifest.yaml');

  if (fs.existsSync(manifestPath)) {
    const manifest = parseManifestFile(manifestPath);
    const drift = detectDrift(lock, manifest);

    console.log(colors.bold('\nDrift Detection:'));

    if (drift.detected) {
      console.log(colors.yellow(`⚠️  ${drift.changes.length} change${drift.changes.length > 1 ? 's' : ''} detected`));

      drift.changes.forEach(change => {
        const changeStr = `${change.category}: ${change.from || 'none'} → ${change.to || 'removed'}`;
        if (change.breaking) {
          console.log(colors.red(`  - ${changeStr} (BREAKING)`));
        } else {
          console.log(colors.yellow(`  - ${changeStr}`));
        }
      });

      console.log(colors.cyan('\n🔄 Run \'grabby rules sync\' to update'));
    } else {
      console.log(colors.green('✅ No drift detected'));
    }
  }

  console.log('');

  return 0;
}

/**
 * Command: grabby rules preset
 */
async function presetCommand(presetName, options = {}, cwd = process.cwd()) {
  if (!presetName || typeof presetName !== 'string') {
    console.error(colors.red('❌ Preset name required'));
    console.error('Usage: grabby rules preset <name>');
    return 1;
  }

  const config = loadConfig(cwd);
  const cacheDir = config.rulesets?.cacheDir || '.grabby/rulesets/cache';
  const manifestPath = path.join(cwd, cacheDir, 'central-repo', 'manifest.yaml');

  if (!fs.existsSync(manifestPath)) {
    console.error(colors.yellow('⚠️  No cached manifest found'));
    console.error('Run: grabby rules sync first');
    return 1;
  }

  const manifest = parseManifestFile(manifestPath);
  let preset;

  try {
    preset = resolvePreset(manifest, presetName);
  } catch (error) {
    console.error(colors.red(`❌ ${error.message}`));
    return 1;
  }

  console.log(colors.bold(`\nApplying preset: ${colors.cyan(presetName)}`));
  console.log(`Description: ${preset.description}\n`);

  console.log(colors.bold('Will add:'));
  preset.includes.forEach(ref => {
    const [categoryName, rulesetName] = ref.split('/');
    const ruleset = findRuleset(manifest, categoryName, rulesetName);
    const version = ruleset ? `@${ruleset.version}` : '';
    console.log(`  - ${colors.cyan(ref)}${colors.gray(version)}`);
  });

  // Initialize rulesets config if not present
  if (!config.rulesets) {
    config.rulesets = {
      source: { repo: '', branch: 'main', version: '' },
      active: [],
      sync: {
        mode: 'warn',
        interval: '24h',
        onDrift: 'warn',
        checkOnCommands: ['task', 'validate', 'plan', 'execute'],
        allowStale: false,
        recordSnapshot: true
      },
      drift: {
        detection: 'hash',
        tolerance: 'patch',
        autoResolve: false,
        notifyChannels: ['cli']
      },
      overrides: {},
      local: [],
      cacheDir: '.grabby/rulesets/cache',
      lockPath: '.grabby/rulesets/sync.lock.yaml'
    };
  }

  if (!config.rulesets.active) {
    config.rulesets.active = [];
  }

  // Add all included rulesets
  let addedCount = 0;
  preset.includes.forEach(ref => {
    if (!config.rulesets.active.includes(ref)) {
      config.rulesets.active.push(ref);
      addedCount++;
    }
  });

  // Write updated config
  saveConfig(config, cwd);

  console.log(colors.green(`\n✅ Added ${addedCount} ruleset${addedCount !== 1 ? 's' : ''} to config`));
  console.log(colors.gray('📝 Updated grabby.config.json'));
  console.log(colors.cyan('🔄 Run \'grabby rules sync\' to fetch rulesets'));

  return 0;
}

/**
 * Command: grabby rules generate
 * Generate a new shared ruleset from repository guidance
 */
async function generateCommand(options = {}, cwd = process.cwd()) {
  if (!isAuthoringEnabled(cwd)) {
    console.error(colors.yellow('⚠️  Rules authoring is disabled'));
    console.error('Enable it with: grabby config set rulesets.authoring.enabled true');
    return 1;
  }

  console.log(colors.bold('\nShared Rules Generation'));
  console.log('─'.repeat(40));

  // Show discovered guidance files
  const guidanceFiles = discoverGuidanceFiles(cwd);
  if (guidanceFiles.length > 0) {
    console.log(colors.cyan('Discovered guidance files:'));
    guidanceFiles.forEach(f => console.log(`  - ${f}`));
    console.log('');
  }

  try {
    const result = await generateSharedRules({
      cwd,
      goal: options.goal,
      title: options.title || 'Shared Project Rules',
      sources: options.sources ? options.sources.split(',').map(s => s.trim()) : undefined,
      logger: console,
    });

    console.log(colors.green(`\n✅ Shared ruleset generated successfully`));
    console.log(`📁 Path: ${colors.cyan(result.relativePath)}`);
    console.log(`📝 Sources used: ${result.sourcesUsed}`);
    console.log(colors.gray(`\nNote: This location is write-protected from normal Grabby operations.`));
    console.log(colors.gray(`Use 'grabby rules update' to modify this ruleset.`));

    return 0;
  } catch (error) {
    console.error(colors.red(`❌ Generation failed: ${error.message}`));
    return 1;
  }
}

/**
 * Command: grabby rules update
 * Update an existing shared ruleset
 */
async function updateCommand(options = {}, cwd = process.cwd()) {
  if (!isAuthoringEnabled(cwd)) {
    console.error(colors.yellow('⚠️  Rules authoring is disabled'));
    console.error('Enable it with: grabby config set rulesets.authoring.enabled true');
    return 1;
  }

  console.log(colors.bold('\nShared Rules Update'));
  console.log('─'.repeat(40));

  try {
    const result = await updateSharedRules({
      cwd,
      rulesetPath: options.file,
      goal: options.goal,
      sources: options.sources ? options.sources.split(',').map(s => s.trim()) : undefined,
      logger: console,
    });

    console.log(colors.green(`\n✅ Shared ruleset updated successfully`));
    console.log(`📁 Path: ${colors.cyan(result.relativePath)}`);
    console.log(`📝 Sources incorporated: ${result.sourcesUsed}`);

    return 0;
  } catch (error) {
    console.error(colors.red(`❌ Update failed: ${error.message}`));
    return 1;
  }
}

/**
 * Command: grabby rules shared
 * List shared rulesets in the protected path
 */
async function sharedCommand(options = {}, cwd = process.cwd()) {
  const protectedPath = getProtectedRulesPath(cwd);
  const rulesets = listSharedRulesets(cwd);

  console.log(colors.bold('\nShared Rulesets'));
  console.log('─'.repeat(40));
  console.log(`Protected path: ${colors.cyan(path.relative(cwd, protectedPath) || protectedPath)}`);
  console.log('');

  if (rulesets.length === 0) {
    console.log(colors.gray('No shared rulesets found.'));
    console.log(colors.gray('\nCreate one with: grabby rules generate'));
    return 0;
  }

  rulesets.forEach((ruleset, index) => {
    const modified = ruleset.modified.toLocaleString();
    console.log(`${colors.cyan((index + 1) + '.')} ${colors.bold(ruleset.name)}`);
    console.log(`   Path: ${ruleset.relativePath}`);
    console.log(`   Modified: ${colors.gray(modified)}`);
    console.log('');
  });

  console.log(colors.gray(`\nNote: These rulesets are write-protected from normal operations.`));
  console.log(colors.gray(`Use 'grabby rules update' to modify them.`));

  return 0;
}

module.exports = {
  syncCommand,
  listCommand,
  searchCommand,
  showCommand,
  addCommand,
  removeCommand,
  statusCommand,
  presetCommand,
  // Authoring commands
  generateCommand,
  updateCommand,
  sharedCommand,
};
