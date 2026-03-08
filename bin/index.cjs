#!/usr/bin/env node

/**
 * Grabby - Global CLI
 * Token-efficient feature contract system for AI-assisted development
 * Extended with BMAD-style agents and workflows
 */

const fs = require('fs');
const path = require('path');
const { createProjectContext, createCommandHandlers } = require('../lib/commands.cjs');
const { createInteractiveHandlers } = require('../lib/interactive.cjs');
const { collectMetrics, generateReport, saveMetricsSnapshot } = require('../lib/metrics.cjs');
const { generateCICDFiles, checkCICDSetup, formatSetupReport } = require('../lib/cicd.cjs');
const { createPluginRegistry, scaffoldPlugin, validatePlugin } = require('../lib/plugins.cjs');
const { createTUI } = require('../lib/tui.cjs');
const { isAIAvailable, getAvailableProvider, completeContract, formatSuggestions } = require('../lib/ai-complete.cjs');
const { createAPIServer } = require('../lib/api-server.cjs');
const { getWorkspaceContext, findAllContracts, formatWorkspaceInfo } = require('../lib/multi-repo.cjs');
const { initConfig, loadConfig, saveConfig, setConfigValue, validateConfig, getConfigPath } = require('../lib/config.cjs');
const { testConnection, createIssueFromContract, listLinks, linkIssue, unlinkIssue, syncContract, importIssue, importIssuesByJql } = require('../lib/jira.cjs');
const featuresLib = require('../lib/features.cjs');
const contractLevels = require('../lib/contract-levels.cjs');
const { interactiveCreateRuleset } = require('../lib/ruleset-builder.cjs');
const { extractContractId, parseWorkItemId } = require('../lib/id-utils.cjs');

// ============================================================================
// TERMINAL COLORS (no dependencies)
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',

  // Foreground
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

const c = {
  error: (s) => `${colors.red}${s}${colors.reset}`,
  success: (s) => `${colors.green}${s}${colors.reset}`,
  warn: (s) => `${colors.yellow}${s}${colors.reset}`,
  info: (s) => `${colors.cyan}${s}${colors.reset}`,
  dim: (s) => `${colors.dim}${s}${colors.reset}`,
  bold: (s) => `${colors.bold}${s}${colors.reset}`,
  heading: (s) => `${colors.bold}${colors.cyan}${s}${colors.reset}`,
  agent: (s) => `${colors.bold}${colors.magenta}${s}${colors.reset}`,
};

// Paths
const PKG_ROOT = path.resolve(__dirname, '..');
const CWD = path.resolve(process.cwd());

// Output mode from --output flag
const OUTPUT_MODE = (() => {
  const idx = process.argv.indexOf('--output');
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1]; // 'console', 'file', or 'both'
  }
  return 'both'; // default
})();

const projectContext = createProjectContext({ cwd: CWD, pkgRoot: PKG_ROOT });
const commandHandlers = createCommandHandlers({
  context: projectContext,
  outputMode: OUTPUT_MODE,
  formatter: c,
});

const interactiveHandlers = createInteractiveHandlers({
  c,
  argv: process.argv,
  outputMode: OUTPUT_MODE,
  pkgRoot: PKG_ROOT,
  cwd: CWD,
  commandHandlers,
});

function getFlagOptions(argvList = args) {
  const nextIndex = argvList.indexOf('--next');
  return {
    interactive: argvList.includes('--interactive'),
    yes: argvList.includes('--yes'),
    next: nextIndex !== -1 && argvList[nextIndex + 1] ? argvList[nextIndex + 1] : null,
  };
}

function getFirstPositionalArg(argvList = args) {
  for (let index = 0; index < argvList.length; index += 1) {
    const token = argvList[index];
    if (!token.startsWith('--')) {
      return token;
    }
    if (token === '--next' || token === '--output') {
      index += 1;
    }
  }
  return undefined;
}

// ============================================================================
// COMMANDS
// ============================================================================

function init() {
  commandHandlers.init({ interactive: args.includes('--interactive') });
}

function update() {
  commandHandlers.updateGrabby({
    checkOnly: args.includes('--check'),
    yes: args.includes('--yes'),
  });
}

function setup() {
  return commandHandlers.setup({
    quick: args.includes('--quick') || args.includes('-q'),
    skipBaselines: args.includes('--skip-baselines') || args.includes('--skip'),
    force: args.includes('--force') || args.includes('-f'),
    disableGate: args.includes('--disable-gate'),
  });
}

function completeBaseline() {
  const target = args[0] || 'SETUP-BASELINE';
  commandHandlers.completeBaseline(target);
}

function archiveBaseline() {
  const target = args[0] || 'SETUP-BASELINE';
  commandHandlers.archiveBaseline(target);
}

function initHooks() {
  commandHandlers.initHooks();
}

function create(name) {
  commandHandlers.create(name);
}

function validate(file) {
  commandHandlers.validate(file);
}

function plan(file) {
  commandHandlers.plan(file);
}

async function approve(file) {
  commandHandlers.approve(file);

  const cfg = loadConfig(CWD);
  if (!cfg?.jira?.enabled || !cfg?.jira?.sync?.autoCreate) return;

  try {
    const filePath = commandHandlers.resolveContract(file);
    if (!filePath) return;
    const content = fs.readFileSync(filePath, 'utf8');
    const id = extractContractId(content, filePath);
    if (!id) return;

    const parsedId = parseWorkItemId(id);
    const isLegacyFc = Boolean(parsedId && parsedId.startsWith('FC-'));
    const allowAnyId = cfg?.jira?.sync?.autoCreateForAnyId === true;
    if (!isLegacyFc && !allowAnyId) return;

    const links = listLinks(CWD);
    if (!links[id]) {
      const created = await createIssueFromContract(cfg, projectContext.contractsDir, path.basename(filePath), CWD);
      console.log(c.success(`Auto-created Jira issue ${created.issueKey} (sync.autoCreate=true)`));
    }
  } catch (err) {
    console.log(c.warn(`Jira auto-create skipped: ${err.message}`));
  }
}

function execute(file) {
  commandHandlers.execute(file, getFlagOptions());
}

function guard(file) {
  commandHandlers.guard(file);
}

function resolve(file) {
  commandHandlers.resolve(file);
}

function upgradeContract(file) {
  commandHandlers.upgradeContract(file);
}

function audit(file) {
  commandHandlers.audit(file, getFlagOptions());
}

function list() {
  commandHandlers.list();
}

function start(file) {
  const typeIndex = args.indexOf('--type');
  const type = typeIndex !== -1 && args[typeIndex + 1] ? args[typeIndex + 1] : 'feat';
  commandHandlers.start(file, { type });
}

function prTemplate(file) {
  commandHandlers.prTemplate(file);
}

function contextLint() {
  commandHandlers.contextLint();
}

function policyCheck() {
  commandHandlers.policyCheck();
}

function backlog(file) {
  commandHandlers.backlog(file);
}

function promptBundle(file) {
  commandHandlers.promptBundle(file);
}

function installPrompt() {
  const tierIndex = args.indexOf('--tier');
  commandHandlers.installPrompt({
    tier: tierIndex !== -1 && args[tierIndex + 1] ? args[tierIndex + 1] : '2',
  });
}

function session(file) {
  const regenerate = args.includes('--regenerate');
  const check = args.includes('--check');
  const checkAll = args.includes('--check-all');
  const formatIndex = args.indexOf('--format');
  const outputIndex = args.indexOf('--output-path');
  commandHandlers.session(file, {
    regenerate,
    check,
    checkAll,
    format: formatIndex !== -1 && args[formatIndex + 1] ? args[formatIndex + 1] : 'json',
    outputPath: outputIndex !== -1 && args[outputIndex + 1] ? args[outputIndex + 1] : null,
  });
}

function agentList() {
  return interactiveHandlers.agentList();
}

async function agent() {
  return interactiveHandlers.agent();
}

async function quick() {
  return interactiveHandlers.quick();
}

async function task() {
  return interactiveHandlers.task();
}

async function ticket() {
  return interactiveHandlers.ticket();
}

async function orchestrate() {
  return interactiveHandlers.orchestrate();
}

async function party() {
  return interactiveHandlers.party();
}

async function workflow() {
  return interactiveHandlers.workflow();
}

function resume() {
  return interactiveHandlers.resume();
}

function help() {
  return interactiveHandlers.help();
}

function resolveContract(file) {
  return interactiveHandlers.resolveContract(file);
}

function watch() {
  console.log(c.heading('\n' + '─'.repeat(50)));
  console.log(c.heading('WATCH MODE'));
  console.log(c.heading('─'.repeat(50)));
  commandHandlers.watch({ logger: console });
}

function agentLint() {
  commandHandlers.agentLint();
}

function dbDiscover() {
  commandHandlers.dbDiscover();
}

function gitStatus() {
  commandHandlers.gitStatus();
}

function gitSync() {
  commandHandlers.gitSync();
}

function gitStart() {
  commandHandlers.gitStart(args[0], {
    type: args.includes('--type') && args[args.indexOf('--type') + 1] ? args[args.indexOf('--type') + 1] : 'feat',
    publish: args.includes('--publish'),
  });
}

function gitUpdate() {
  commandHandlers.gitUpdate();
}

function gitPreflight() {
  commandHandlers.gitPreflight(args[0] || null);
}

function dbRefresh() {
  commandHandlers.dbRefresh();
}

function dbLint() {
  commandHandlers.dbLint({ strict: args.includes('--strict') });
}

function apiDiscover() {
  commandHandlers.apiDiscover();
}

function apiRefresh() {
  commandHandlers.apiRefresh();
}

function apiLint() {
  commandHandlers.apiLint({ strict: args.includes('--strict') });
}

function feDiscover() {
  commandHandlers.feDiscover();
}

function feRefresh() {
  commandHandlers.feRefresh();
}

function feLint() {
  commandHandlers.feLint({ strict: args.includes('--strict') });
}

function depsDiscover() {
  commandHandlers.depsDiscover();
}

function metrics() {
  if (args[0] === 'summary') {
    commandHandlers.metricsSummary();
    return;
  }

  const format = args.includes('--json') ? 'json' : 'text';
  const summaryOnly = args.includes('--summary');
  const save = args.includes('--save');

  const metricsData = collectMetrics(projectContext.contractsDir);
  const report = generateReport(metricsData, { format, summaryOnly });

  console.log(report);

  if (save) {
    const metricsDir = path.join(projectContext.grabbyDir, 'metrics');
    const saved = saveMetricsSnapshot(metricsDir, metricsData);
    console.log(c.dim(`\nSnapshot saved: ${saved}`));
  }
}

function cicd() {
  const setup = args.includes('--setup');
  const check = args.includes('--check');
  const force = args.includes('--force');
  const dryRun = args.includes('--dry-run');

  if (check || (!setup && !dryRun)) {
    const status = checkCICDSetup(CWD);
    console.log(formatSetupReport(status));
    return;
  }

  console.log(c.heading('\n' + '─'.repeat(50)));
  console.log(c.heading('CI/CD SETUP'));
  console.log(c.heading('─'.repeat(50) + '\n'));

  const generated = generateCICDFiles(CWD, { dryRun, force });

  if (dryRun) {
    console.log('Dry run - would generate:');
  } else {
    console.log('Generated files:');
  }

  for (const file of generated) {
    const icon = dryRun ? '○' : '✓';
    console.log(`  ${c.success(icon)} ${file.path}`);
  }

  if (!dryRun && generated.length > 0) {
    console.log(c.dim('\nCI/CD setup complete!'));
  }
}

function tui() {
  const app = createTUI({ ...projectContext, commandHandlers, exit: process.exit });
  app.start();
}

function workspace() {
  const subCommand = args[0];
  const context = getWorkspaceContext(CWD);

  switch (subCommand) {
    case 'info': {
      console.log(c.heading('\n' + '─'.repeat(50)));
      console.log(c.heading('WORKSPACE INFO'));
      console.log(c.heading('─'.repeat(50) + '\n'));
      console.log(formatWorkspaceInfo(context));
      break;
    }

    case 'contracts': {
      if (!context.isMonorepo) {
        console.log(c.warn('Not in a monorepo. Use `grabby list` instead.'));
        return;
      }

      console.log(c.heading('\n' + '─'.repeat(50)));
      console.log(c.heading('WORKSPACE CONTRACTS'));
      console.log(c.heading('─'.repeat(50) + '\n'));

      const contracts = findAllContracts(context.root);

      if (contracts.length === 0) {
        console.log(c.dim('No contracts found in workspace.'));
      } else {
        // Group by package
        const byPackage = {};
        contracts.forEach(contract => {
          if (!byPackage[contract.package]) {
            byPackage[contract.package] = [];
          }
          byPackage[contract.package].push(contract);
        });

        for (const [pkg, pkgContracts] of Object.entries(byPackage)) {
          console.log(`${c.bold(pkg)}`);
          pkgContracts.forEach(contract => {
            console.log(`  ${c.dim('•')} ${contract.file}`);
          });
          console.log('');
        }

        console.log(c.dim(`Total: ${contracts.length} contracts`));
      }
      break;
    }

    default:
      console.log(c.heading('\nJira Commands'));
      console.log('─'.repeat(40));
      console.log('  grabby workspace info       Show workspace/monorepo info');
      console.log('  grabby workspace contracts  List all contracts across packages');
      console.log('');

      // Show quick info
      if (context.isMonorepo) {
        console.log(c.success(`Detected: ${context.type} monorepo`));
        console.log(c.dim(`  ${context.packages.length} packages`));
      } else {
        console.log(c.dim('Not in a monorepo'));
      }
  }
}

async function serve() {
  const portArg = args.find(a => a.startsWith('--port='));
  const port = portArg ? parseInt(portArg.split('=')[1]) : 3456;

  console.log(c.heading('\n' + '─'.repeat(50)));
  console.log(c.heading('GRABBY API SERVER'));
  console.log(c.heading('─'.repeat(50) + '\n'));

  const server = createAPIServer(projectContext);
  await server.start(port);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await server.stop();
    process.exit(0);
  });
}


function configCmd() {
  const subCommand = args[0];

  switch (subCommand) {
    case 'init': {
      const result = initConfig(CWD, { force: args.includes('--force') });
      if (result.created) console.log(c.success(`Created ${result.file}`));
      else console.log(c.warn(`Config already exists: ${result.file} (use --force to overwrite)`));
      break;
    }
    case 'set': {
      const key = args[1];
      const value = args[2];
      if (!key || value === undefined) {
        console.log(c.error('Usage: grabby config set <path> <value>'));
        process.exit(1);
      }
      let cfg = loadConfig(CWD);
      if (!cfg) {
        initConfig(CWD);
        cfg = loadConfig(CWD);
      }
      setConfigValue(cfg, key, value);
      saveConfig(cfg, CWD);
      console.log(c.success(`Updated ${key} in ${getConfigPath(CWD)}`));
      break;
    }
    case 'show': {
      const cfg = loadConfig(CWD);
      if (!cfg) {
        console.log(c.error('Config not found. Run: grabby config init'));
        process.exit(1);
      }
      console.log(JSON.stringify(cfg, null, 2));
      break;
    }
    case 'validate': {
      const cfg = loadConfig(CWD);
      if (!cfg) {
        console.log(c.error('Config not found. Run: grabby config init'));
        process.exit(1);
      }
      const result = validateConfig(cfg);
      if (result.valid) console.log(c.success('Config is valid.'));
      else {
        console.log(c.error('Config validation failed:'));
        result.errors.forEach(e => console.log(`  - ${e}`));
        process.exit(1);
      }
      if (result.warnings.length) {
        console.log(c.warn('Warnings:'));
        result.warnings.forEach(w => console.log(`  - ${w}`));
      }
      break;
    }
    default:
      console.log(c.heading('\nConfig Commands'));
      console.log('─'.repeat(40));
      console.log('  grabby config init             Create grabby.config.json');
      console.log('  grabby config set <k> <v>      Set config value');
      console.log('  grabby config show             Print current config');
      console.log('  grabby config validate         Validate config');
  }
}

async function jira() {
  const subCommand = args[0];
  const cfg = loadConfig(CWD);
  if (!cfg) {
    console.log(c.error('Config not found. Run: grabby config init'));
    process.exit(1);
  }

  switch (subCommand) {
    case 'setup': {
      initConfig(CWD);
      const fresh = loadConfig(CWD);
      setConfigValue(fresh, 'jira.enabled', 'true');
      saveConfig(fresh, CWD);
      console.log(c.success('Initialized config and enabled Jira.'));
      console.log(c.dim('Next: grabby config set jira.host <url> && grabby config set jira.email <email>'));
      break;
    }
    case 'test': {
      try {
        const me = await testConnection(cfg);
        console.log(c.success(`Connected to Jira as ${me.displayName || me.emailAddress || 'user'}`));
      } catch (err) {
        console.log(c.error(`Jira connection failed: ${err.message}`));
        process.exit(1);
      }
      break;
    }
    case 'create': {
      const contract = args[1];
      if (!contract) {
        console.log(c.error('Usage: grabby jira create <contract>'));
        process.exit(1);
      }
      try {
        const result = await createIssueFromContract(cfg, projectContext.contractsDir, contract, CWD);
        console.log(c.success(`Created Jira issue ${result.issueKey} for ${result.contractId}`));
      } catch (err) {
        console.log(c.error(err.message));
        process.exit(1);
      }
      break;
    }
    case 'link': {
      const contractId = args[1];
      const issueKey = args[2];
      if (!contractId || !issueKey) {
        console.log(c.error('Usage: grabby jira link <contract-id> <ISSUE-KEY>'));
        process.exit(1);
      }
      linkIssue(contractId, issueKey, CWD);
      console.log(c.success(`Linked ${contractId} -> ${issueKey}`));
      break;
    }
    case 'unlink': {
      const contractId = args[1];
      if (!contractId) {
        console.log(c.error('Usage: grabby jira unlink <contract-id>'));
        process.exit(1);
      }
      unlinkIssue(contractId, CWD);
      console.log(c.success(`Unlinked ${contractId}`));
      break;
    }
    case 'sync': {
      const dryRun = args.includes('--dry-run');
      if (args.includes('--all')) {
        const links = Object.keys(listLinks(CWD));
        for (const id of links) {
          const result = await syncContract(cfg, projectContext.contractsDir, id, { dryRun }, CWD);
          console.log(`${result.contractId} -> ${result.issueKey} [${result.jiraStatus}]${dryRun ? ' (dry-run)' : ''}`);
        }
      } else {
        const contract = args[1];
        if (!contract) {
          console.log(c.error('Usage: grabby jira sync <contract> [--dry-run]'));
          process.exit(1);
        }
        const result = await syncContract(cfg, projectContext.contractsDir, contract, { dryRun }, CWD);
        console.log(`${result.contractId} -> ${result.issueKey} [${result.jiraStatus}]${dryRun ? ' (dry-run)' : ''}`);
      }
      break;
    }
    case 'import': {
      const jqlIndex = args.indexOf('--jql');
      const jql = jqlIndex !== -1 ? args[jqlIndex + 1] : null;
      try {
        if (jql) {
          const imported = await importIssuesByJql(cfg, projectContext.contractsDir, jql);
          const created = imported.filter(i => !i.skipped).length;
          const skipped = imported.filter(i => i.skipped).length;
          console.log(c.success(`JQL import complete: ${created} created, ${skipped} skipped`));
        } else {
          const issueKey = args[1];
          if (!issueKey) {
            console.log(c.error('Usage: grabby jira import <ISSUE-KEY> | grabby jira import --jql "<JQL>"'));
            process.exit(1);
          }
          const result = await importIssue(cfg, projectContext.contractsDir, issueKey);
          if (result.skipped) console.log(c.warn(`Skipped ${issueKey}: already imported`));
          else console.log(c.success(`Imported ${issueKey} -> ${result.file}`));
        }
      } catch (err) {
        console.log(c.error(err.message));
        process.exit(1);
      }
      break;
    }
    case 'list': {
      const links = listLinks(CWD);
      const rows = Object.entries(links);
      if (rows.length === 0) console.log(c.dim('No Jira links found.'));
      else rows.forEach(([id, link]) => console.log(`${id} -> ${link.issueKey} (${link.status || 'unknown'})`));
      break;
    }
    case 'orphans': {
      const links = listLinks(CWD);
      const linked = new Set(Object.keys(links));
      const files = fs.existsSync(projectContext.contractsDir) ? fs.readdirSync(projectContext.contractsDir).filter(f => f.endsWith('.fc.md')) : [];
      const ids = files.map(f => fs.readFileSync(path.join(projectContext.contractsDir, f), 'utf8').match(/\*\*ID:\*\*\s*(FC-\d+)/)?.[1]).filter(Boolean);
      const orphans = ids.filter(id => !linked.has(id));
      if (orphans.length === 0) console.log(c.success('No orphan contracts detected.'));
      else orphans.forEach(id => console.log(`Orphan contract: ${id}`));
      break;
    }
    case 'status': {
      const links = listLinks(CWD);
      const rows = Object.entries(links);
      try {
        await testConnection(cfg);
        console.log(c.success('Jira connection: healthy'));
      } catch (err) {
        console.log(c.error(`Jira connection: unhealthy (${err.message})`));
      }
      console.log(`Linked contracts: ${rows.length}`);
      const files = fs.existsSync(projectContext.contractsDir) ? fs.readdirSync(projectContext.contractsDir).filter(f => f.endsWith('.fc.md')) : [];
      const ids = files.map(f => fs.readFileSync(path.join(projectContext.contractsDir, f), 'utf8').match(/\*\*ID:\*\*\s*(FC-\d+)/)?.[1]).filter(Boolean);
      const orphanContracts = ids.filter(id => !links[id]).length;
      console.log(`Orphan contracts: ${orphanContracts}`);
      break;
    }
    default:
      console.log(c.heading('\nJira Commands'));
      console.log('─'.repeat(40));
      console.log('  grabby jira setup                        Enable Jira config scaffold');
      console.log('  grabby jira test                         Test Jira connection');
      console.log('  grabby jira create <contract>            Create Jira issue from contract');
      console.log('  grabby jira link <contract-id> <ISSUE>   Link existing issue');
      console.log('  grabby jira unlink <contract-id>         Unlink issue');
      console.log('  grabby jira sync <contract> [--dry-run]  Sync one contract');
      console.log('  grabby jira sync --all [--dry-run]       Sync all linked contracts');
      console.log('  grabby jira import <ISSUE-KEY>           Import issue as contract');
      console.log('  grabby jira import --jql "<JQL>"         Bulk import issues by JQL');
      console.log('  grabby jira list                         List linked Jira issues');
      console.log('  grabby jira status                       Show sync health');
      console.log('  grabby jira orphans                      List contracts without Jira links');
  }
}


async function ai() {
  const subCommand = args[0];

  if (!isAIAvailable()) {
    console.log(c.warn('\nAI features require a configured provider.'));
    console.log(c.dim('Set one of: OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, or OLLAMA_HOST/OLLAMA_MODEL.\n'));
    return;
  }

  const provider = getAvailableProvider();
  console.log(c.dim(`Using ${provider} API\n`));

  switch (subCommand) {
    case 'suggest': {
      const file = args[1];
      if (!file) {
        console.log(c.error('Usage: grabby ai suggest <contract-file>'));
        process.exit(1);
      }

      const filePath = commandHandlers.resolveContract(file);
      if (!filePath) return;

      console.log(c.heading('Generating AI suggestions...\n'));

      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const suggestions = await completeContract(content, CWD);
        console.log(formatSuggestions(suggestions));
      } catch (err) {
        console.log(c.error(`Error: ${err.message}`));
        process.exit(1);
      }
      break;
    }

    case 'status': {
      console.log(c.heading('AI Status'));
      console.log('─'.repeat(40));
      console.log(`Provider: ${c.success(provider)}`);
      console.log(`API Key: ${c.success('configured')}`);
      break;
    }

    default:
      console.log(c.heading('\nAI Commands'));
      console.log('─'.repeat(40));
      console.log('  grabby ai suggest <file>   Generate suggestions for a contract');
      console.log('  grabby ai status           Check AI configuration');
      console.log('');
      console.log(c.dim('Supports: OpenAI, Anthropic, Gemini, and local Ollama'));
  }
}

function plugin() {
  const subCommand = args[0];
  const registry = createPluginRegistry(projectContext.grabbyDir);

  switch (subCommand) {
    case 'list': {
      const count = registry.loadAll();
      const plugins = registry.list();

      console.log(c.heading('\n' + '─'.repeat(50)));
      console.log(c.heading('INSTALLED PLUGINS'));
      console.log(c.heading('─'.repeat(50) + '\n'));

      if (plugins.length === 0) {
        console.log(c.dim('No plugins installed.'));
        console.log(c.dim(`Plugin directory: ${registry.getPluginsDir()}`));
        console.log(c.dim('\nCreate one: grabby plugin create <name>'));
      } else {
        for (const p of plugins) {
          console.log(`${c.success('●')} ${c.bold(p.name)} v${p.version}`);
          console.log(`  ${c.dim(p.description)}`);
          if (p.agents.length) console.log(`  Agents: ${p.agents.map(a => a.name).join(', ')}`);
          if (p.workflows.length) console.log(`  Workflows: ${p.workflows.map(w => w.name).join(', ')}`);
          if (p.commands.length) console.log(`  Commands: ${p.commands.map(c => c.name).join(', ')}`);
          console.log('');
        }
      }
      break;
    }

    case 'create': {
      const name = args[1];
      if (!name) {
        console.log(c.error('Usage: grabby plugin create <name>'));
        process.exit(1);
      }

      const includeAgent = args.includes('--agent');
      const includeWorkflow = args.includes('--workflow');
      const includeCommand = args.includes('--command');

      try {
        const pluginDir = scaffoldPlugin(registry.getPluginsDir(), name, {
          includeAgent,
          includeWorkflow,
          includeCommand: includeCommand || (!includeAgent && !includeWorkflow),
        });
        console.log(c.success(`\n✓ Created plugin: ${name}`));
        console.log(c.dim(`  Path: ${pluginDir}`));
        console.log(c.dim('\nEdit plugin.yaml to configure your plugin.'));
      } catch (err) {
        console.log(c.error(`Error: ${err.message}`));
        process.exit(1);
      }
      break;
    }

    case 'validate': {
      const pluginName = args[1];
      if (!pluginName) {
        console.log(c.error('Usage: grabby plugin validate <name>'));
        process.exit(1);
      }

      const pluginDir = path.join(registry.getPluginsDir(), pluginName);
      const result = validatePlugin(pluginDir);

      if (result.valid) {
        console.log(c.success(`\n✓ Plugin ${pluginName} is valid`));
      } else {
        console.log(c.error(`\n✗ Plugin ${pluginName} has errors:`));
        result.errors.forEach(e => console.log(`  ${c.error('•')} ${e}`));
      }

      if (result.warnings.length > 0) {
        result.warnings.forEach(w => console.log(`  ${c.warn('•')} ${w}`));
      }
      break;
    }

    default:
      console.log(c.heading('\nPlugin Commands'));
      console.log('─'.repeat(40));
      console.log('  grabby plugin list              List installed plugins');
      console.log('  grabby plugin create <name>     Create a new plugin');
      console.log('  grabby plugin validate <name>   Validate a plugin');
      console.log('');
      console.log(c.dim('Options for create:'));
      console.log(c.dim('  --agent      Include sample agent'));
      console.log(c.dim('  --workflow   Include sample workflow'));
      console.log(c.dim('  --command    Include sample command'));
  }
}


async function ruleset() {
  const subCommand = args[0];

  switch (subCommand) {
    case 'create': {
      const goal = args.slice(1).filter((a) => !a.startsWith('--')).join(' ');
      const pathsArg = args.find((a) => a.startsWith('--from='));
      const titleArg = args.find((a) => a.startsWith('--title='));

      try {
        await interactiveCreateRuleset(CWD, {
          goal: goal || null,
          title: titleArg ? titleArg.split('=')[1] : null,
          pathsCsv: pathsArg ? pathsArg.split('=')[1] : null,
          logger: console,
        });
      } catch (err) {
        console.log(c.error(`Error: ${err.message}`));
        process.exit(1);
      }
      break;
    }

    case 'list':
      commandHandlers.rulesetList();
      break;

    case 'fetch': {
      const url = args[1];
      if (!url) {
        console.log(c.error('Usage: grabby ruleset fetch <url>'));
        process.exit(1);
      }
      await commandHandlers.rulesetFetch(url, { force: args.includes('--force') });
      break;
    }

    case 'resolve': {
      const name = args[1];
      if (!name) {
        console.log(c.error('Usage: grabby ruleset resolve <name>'));
        process.exit(1);
      }
      await commandHandlers.rulesetResolve(name);
      break;
    }

    case 'clear':
      commandHandlers.rulesetClear();
      break;

    default:
      console.log(c.heading('\nRuleset Commands'));
      console.log('─'.repeat(40));
      console.log('  grabby ruleset list               List all available rulesets');
      console.log('  grabby ruleset create [goal]      Create a ruleset interactively');
      console.log('  grabby ruleset fetch <url>        Fetch remote ruleset');
      console.log('  grabby ruleset resolve <name>     Resolve ruleset with inheritance');
      console.log('  grabby ruleset clear              Clear cached remote rulesets');
      console.log('');
      console.log(c.dim('Options:'));
      console.log(c.dim('  --title=<name>   Override ruleset title'));
      console.log(c.dim('  --from=<paths>   Comma-separated files/dirs for context'));
      console.log(c.dim('  --force          Force refresh cached ruleset'));
  }
}

// Feature management
function features() {
  const subCommand = (cmd === 'features:list' ? 'list' : cmd === 'features:status' ? 'status' : cmd === 'features:refresh' ? 'refresh' : args[0]);

  switch (subCommand) {
    case 'status': {
      const id = cmd === 'features:status' ? args[0] : args[1];
      if (!id) {
        console.log(c.error('Usage: grabby features:status <ID>'));
        process.exit(1);
      }
      const feature = featuresLib.getContractFeatureStatus(id, CWD);
      if (!feature) {
        console.log(c.error(`Feature ${String(id).toUpperCase()} not found.`));
        process.exit(1);
      }
      console.log(featuresLib.formatFeatureStatus(feature));
      break;
    }

    case 'refresh': {
      const refreshed = featuresLib.refreshFeatureIndex(CWD);
      console.log(c.success(`Refreshed ${refreshed.features.length} features`));
      console.log(c.dim(`Index: ${path.relative(CWD, refreshed.indexPath).replace(/\\/g, '/')}`));
      break;
    }

    case 'list':
    case undefined: {
      console.log(featuresLib.formatFeatureTable(featuresLib.listContractFeatures(CWD)));
      break;
    }

    default:
      console.log(c.heading('\nFeature Index Commands'));
      console.log('─'.repeat(50));
      console.log('  grabby features:list            List features from contracts/*.fc.md');
      console.log('  grabby features:status <id>     Show contract/plan/audit status for one feature');
      console.log('  grabby features:refresh         Regenerate .grabby/features.index.json');
      console.log('');
      console.log(c.dim('Feature contracts are the canonical source of truth.'));
  }
}

async function feature() {
  const subCommand = cmd === 'feature:close' ? 'close' : (cmd === 'feature:gc' ? 'gc' : args[0]);

  if (subCommand === 'close') {
    const id = (cmd === 'feature:close' ? args[0] : args[1])?.toUpperCase();
    if (!id) {
      console.log(c.error('Usage: grabby feature close <ID>'));
      process.exit(1);
    }
    commandHandlers.featureClose(id, getFlagOptions(cmd === 'feature:close' ? args.slice(1) : args.slice(2)));
    return;
  }

  if (subCommand === 'gc') {
    const action = cmd === 'feature:gc' ? (args[0] || 'list') : (args[1] || 'list');
    const id = (cmd === 'feature:gc' ? args[1] : args[2])?.toUpperCase() || null;
    const reasonParts = cmd === 'feature:gc' ? args.slice(2) : args.slice(3);
    commandHandlers.featureGc(action, id, {
      reason: reasonParts.join(' ').trim() || undefined,
    });
    return;
  }

  if (subCommand === 'describe' || subCommand === 'show') {
    const id = args[1]?.toUpperCase();
    if (!id) {
      console.log(c.error('Usage: grabby feature describe <feature-id>'));
      process.exit(1);
    }

    const feature = featuresLib.getContractFeatureStatus(id, CWD);
    if (!feature) {
      console.log(c.error(`Feature ${id} not found.`));
      process.exit(1);
    }

    console.log(featuresLib.formatFeatureStatus(feature));
    return;
  }

  console.log(c.heading('\nFeature Commands'));
  console.log('â”€'.repeat(50));
  console.log('  grabby features:list            List features from contracts/*.fc.md');
  console.log('  grabby features:status <id>     Show contract/plan/audit status for one feature');
  console.log('  grabby features:refresh         Regenerate .grabby/features.index.json');
  console.log('  grabby feature describe <id>    Alias for features:status <id>');
  console.log('  grabby feature close <id>       Archive a completed feature and remove active artifacts');
  console.log('  grabby feature gc [action]      List/check/disposition hanging active contracts');
  console.log('');
  console.log(c.dim('Feature contracts are the canonical source of truth.'));
  return;

  switch (subCommand) {
    case 'add': {
      const name = args.slice(1).join(' ');
      if (name) {
        // Quick add with name provided
        const f = featuresLib.addFeature({ name, status: 'proposed' }, CWD);
        console.log(c.success(`\n✓ Feature ${f.id} created: ${f.name}`));
        console.log(c.dim('Run: grabby feature describe ' + f.id + ' to see details'));
      } else {
        // Interactive add
        await featureChat.interactiveAddFeature(CWD);
      }
      break;
    }

    case 'describe':
    case 'show': {
      const id = args[1]?.toUpperCase();
      if (!id) {
        console.log(c.error('Usage: grabby feature describe <feature-id>'));
        process.exit(1);
      }
      const f = featuresLib.getFeature(id, CWD);
      if (f) {
        featureChat.displayFeature(f, true);
      } else {
        console.log(c.error(`Feature ${id} not found.`));
      }
      break;
    }

    case 'enhance': {
      const id = args[1]?.toUpperCase();
      if (!id) {
        console.log(c.error('Usage: grabby feature enhance <feature-id>'));
        process.exit(1);
      }
      await featureChat.interactiveEnhance(id, CWD);
      break;
    }

    case 'chat': {
      await featureChat.startChatSession(CWD);
      break;
    }

    case 'discover': {
      const discovered = featuresLib.discoverFeatures(CWD);
      if (discovered.length === 0) {
        console.log(c.dim('\nNo features discovered from contracts.'));
      } else {
        console.log(c.heading(`\nDiscovered ${discovered.length} features:`));
        for (const f of discovered) {
          console.log(`  ${c.dim('•')} ${f.name}`);
          console.log(`    ${c.dim('from:')} ${f.source}`);
        }
        console.log(c.dim('\nRun: grabby feature import'));
      }
      break;
    }

    case 'import': {
      const imported = featuresLib.importDiscoveredFeatures(CWD);
      if (imported.length === 0) {
        console.log(c.dim('\nNo new features to import.'));
      } else {
        console.log(c.success(`\n✓ Imported ${imported.length} features:`));
        for (const f of imported) {
          console.log(`  ${f.id}: ${f.name}`);
        }
      }
      break;
    }

    case 'link': {
      const [, featureId, contractId] = args;
      if (!featureId || !contractId) {
        console.log(c.error('Usage: grabby feature link <feature-id> <contract-id>'));
        process.exit(1);
      }
      try {
        featuresLib.linkContract(featureId.toUpperCase(), contractId, CWD);
        console.log(c.success(`\n✓ Linked ${contractId} to ${featureId.toUpperCase()}`));
      } catch (err) {
        console.log(c.error(err.message));
      }
      break;
    }

    case 'status': {
      const [, featureId, newStatus] = args;
      if (!featureId || !newStatus) {
        console.log(c.error('Usage: grabby feature status <feature-id> <new-status>'));
        console.log(c.dim(`Statuses: ${featureChat.STATUSES.join(', ')}`));
        process.exit(1);
      }
      if (!featureChat.STATUSES.includes(newStatus)) {
        console.log(c.error(`Invalid status. Use: ${featureChat.STATUSES.join(', ')}`));
        process.exit(1);
      }
      try {
        const updated = featuresLib.updateFeature(featureId.toUpperCase(), { status: newStatus }, CWD);
        console.log(c.success(`\n✓ ${updated.id} status updated to ${newStatus}`));
      } catch (err) {
        console.log(c.error(err.message));
      }
      break;
    }

    case 'delete': {
      const id = args[1]?.toUpperCase();
      if (!id) {
        console.log(c.error('Usage: grabby feature delete <feature-id>'));
        process.exit(1);
      }
      try {
        const deleted = featuresLib.deleteFeature(id, CWD);
        console.log(c.success(`\n✓ Deleted feature: ${deleted.name}`));
      } catch (err) {
        console.log(c.error(err.message));
      }
      break;
    }

    case 'search': {
      const term = args.slice(1).join(' ');
      if (!term) {
        console.log(c.error('Usage: grabby feature search <term>'));
        process.exit(1);
      }
      const results = featuresLib.searchFeatures(term, CWD);
      if (results.length === 0) {
        console.log(c.dim(`\nNo features matching "${term}".`));
      } else {
        console.log(c.heading(`\nSearch results for "${term}":`));
        for (const f of results) {
          console.log(`  ${f.id}: ${f.name} [${f.status}]`);
        }
      }
      break;
    }

    case 'stats': {
      const stats = featuresLib.getFeatureStats(CWD);
      console.log(c.heading('\nFeature Statistics'));
      console.log('─'.repeat(40));
      console.log(`  Total features: ${stats.total}`);
      console.log(`  With enhancements: ${stats.withEnhancements}`);
      console.log(`  Total enhancements: ${stats.totalEnhancements}`);
      console.log(`  Linked to contracts: ${stats.linkedToContracts}`);
      if (Object.keys(stats.byStatus).length > 0) {
        console.log('\n  By Status:');
        for (const [status, count] of Object.entries(stats.byStatus)) {
          console.log(`    ${status}: ${count}`);
        }
      }
      break;
    }

    default:
      console.log(c.heading('\nFeature Commands'));
      console.log('─'.repeat(50));
      console.log('  grabby features                  List all features');
      console.log('  grabby feature add [name]        Add a new feature');
      console.log('  grabby feature describe <id>     Show feature details');
      console.log('  grabby feature enhance <id>      Propose enhancement');
      console.log('  grabby feature chat              Interactive feature chat');
      console.log('  grabby feature discover          Find features in contracts');
      console.log('  grabby feature import            Import discovered features');
      console.log('  grabby feature link <f-id> <c>   Link feature to contract');
      console.log('  grabby feature status <id> <s>   Update feature status');
      console.log('  grabby feature search <term>     Search features');
      console.log('  grabby feature stats             Show statistics');
      console.log('  grabby feature delete <id>       Delete a feature');
      console.log('');
      console.log(c.dim('Statuses: proposed, approved, in-progress, completed, deprecated'));
  }
}

// System-level contract management
function system() {
  const subCommand = args[0];

  switch (subCommand) {
    case 'init': {
      const dir = contractLevels.initGlobalDir();
      const created = contractLevels.createDefaultSystemContracts();

      console.log(c.heading('\n' + '─'.repeat(50)));
      console.log(c.heading('SYSTEM CONTRACTS INITIALIZED'));
      console.log(c.heading('─'.repeat(50) + '\n'));

      console.log(`Global directory: ${c.dim(dir)}`);

      if (created.length > 0) {
        console.log('\nCreated default contracts:');
        for (const name of created) {
          console.log(`  ${c.success('✓')} ${name}`);
        }
      } else {
        console.log(c.dim('\nDefault contracts already exist.'));
      }

      console.log(c.dim('\nRun: grabby system list'));
      break;
    }

    case 'list': {
      const contracts = contractLevels.listSystemContracts();

      console.log(c.heading('\n' + '─'.repeat(50)));
      console.log(c.heading('SYSTEM CONTRACTS'));
      console.log(c.heading('─'.repeat(50)));

      if (contracts.length === 0) {
        console.log(c.dim('\nNo system contracts found.'));
        console.log(c.dim('Run: grabby system init'));
      } else {
        console.log('');
        for (const contract of contracts) {
          const status = contract.status === 'approved' ? c.success('✓') : c.warn('○');
          console.log(`  ${status} ${contract.id}: ${contract.title}`);
          console.log(`    ${c.dim(contract.path)}`);
        }
        console.log(`\n${c.dim(`Total: ${contracts.length} system contracts`)}`);
      }
      break;
    }

    case 'add': {
      const filePath = args[1];
      if (!filePath) {
        console.log(c.error('Usage: grabby system add <contract-file>'));
        process.exit(1);
      }

      try {
        const resolvedPath = path.resolve(CWD, filePath);
        const destPath = contractLevels.addToSystemLevel(resolvedPath);
        console.log(c.success(`\n✓ Added to system contracts`));
        console.log(c.dim(`  ${destPath}`));
      } catch (err) {
        console.log(c.error(err.message));
        process.exit(1);
      }
      break;
    }

    case 'remove': {
      const contractName = args[1];
      if (!contractName) {
        console.log(c.error('Usage: grabby system remove <contract-name>'));
        process.exit(1);
      }

      try {
        const removed = contractLevels.removeFromSystemLevel(contractName);
        console.log(c.success(`\n✓ Removed from system contracts`));
        console.log(c.dim(`  ${removed}`));
      } catch (err) {
        console.log(c.error(err.message));
        process.exit(1);
      }
      break;
    }

    case 'show': {
      const contractName = args[1];
      if (!contractName) {
        console.log(c.error('Usage: grabby system show <contract-name>'));
        process.exit(1);
      }

      const contracts = contractLevels.listSystemContracts();
      const contract = contracts.find(c =>
        c.file === contractName ||
        c.file === contractName + '.fc.md' ||
        c.id === contractName.toUpperCase()
      );

      if (!contract) {
        console.log(c.error(`System contract not found: ${contractName}`));
        process.exit(1);
      }

      const content = fs.readFileSync(contract.path, 'utf8');
      console.log(content);
      break;
    }

    default:
      console.log(c.heading('\nSystem Contract Commands'));
      console.log('─'.repeat(50));
      console.log('  grabby system init              Initialize global contracts');
      console.log('  grabby system list              List system-level contracts');
      console.log('  grabby system add <file>        Add contract to system level');
      console.log('  grabby system remove <name>     Remove from system level');
      console.log('  grabby system show <name>       View a system contract');
      console.log('');
      console.log(c.dim('System contracts apply to ALL projects.'));
      console.log(c.dim(`Location: ${contractLevels.GLOBAL_GRABBY_DIR}`));
  }
}

// Contracts command - shows merged view
function contracts() {
  const allContracts = contractLevels.listAllContracts(CWD);

  console.log(c.heading('\n' + '─'.repeat(50)));
  console.log(c.heading('ALL CONTRACTS'));
  console.log(c.heading('─'.repeat(50)));

  console.log(contractLevels.formatContractsList(allContracts));

  const context = contractLevels.getMergedContext(CWD);
  if (context.security.length > 0 || context.directories.restricted.length > 0) {
    console.log(c.dim('\nMerged Rules Active:'));
    console.log(c.dim(`  Security rules: ${context.security.length}`));
    console.log(c.dim(`  Restricted dirs: ${context.directories.restricted.join(', ')}`));
  }
}

function cleanLocalContracts() {
  commandHandlers.cleanLocalContracts();
}

const [cmd, ...args] = process.argv.slice(2);
const repoConfig = loadConfig(CWD);
const shouldLaunchMenuByDefault = !cmd
  && Boolean(process.stdin.isTTY && process.stdout.isTTY)
  && repoConfig?.features?.menuMode !== false;

const commands = {
  init,
  update,
  'init-hooks': initHooks,
  create: () => create(args.join(' ').replace(/--output.*$/, '').trim() || 'new-feature'),
  validate: () => validate(args[0]),
  plan: () => plan(args[0]),
  approve: () => approve(args[0]),
  execute: () => execute(args[0]),
  run: () => execute(getFirstPositionalArg(args)),
  guard: () => guard(args[0]),
  resolve: () => resolve(args[0]),
  'upgrade-contract': () => upgradeContract(args[0]),
  audit: () => audit(args[0]),
  list,
  backlog: () => backlog(args[0]),
  start: () => start(args[0]),
  'pr-template': () => prTemplate(args[0]),
  'context:lint': contextLint,
  'policy:check': policyCheck,
  prompt: () => promptBundle(args[0]),
  'install:prompt': installPrompt,
  'setup:prompt': installPrompt,
  session: () => session(args[0]),
  watch,
  'agent:lint': agentLint,
  'db:discover': dbDiscover,
  'db:refresh': dbRefresh,
  'db:lint': dbLint,
  'git:status': gitStatus,
  'git:sync': gitSync,
  'git:start': gitStart,
  'git:update': gitUpdate,
  'git:preflight': gitPreflight,
  'api:discover': apiDiscover,
  'api:refresh': apiRefresh,
  'api:lint': apiLint,
  'fe:discover': feDiscover,
  'fe:refresh': feRefresh,
  'fe:lint': feLint,
  'deps:discover': depsDiscover,
  metrics,
  cicd,
  plugin,
  tui,
  ai,
  config: configCmd,
  jira,
  serve,
  workspace,
  system,
  contracts,
  'contracts:clean-local': cleanLocalContracts,
  features,
  'features:list': features,
  'features:status': features,
  'features:refresh': features,
  feature,
  'feature:close': feature,
  'feature:gc': feature,
  ruleset,
  agent,
  task,
  ticket,
  orchestrate,
  quick,
  party,
  workflow,
  resume,
  setup,
  'complete-baseline': completeBaseline,
  'archive-baseline': archiveBaseline,
  help,
  '-h': help,
  '--help': help
};

function getSetupBaselinePath() {
  return path.join(projectContext.contractsDir, 'SETUP-BASELINE.fc.md');
}

function hasSetupBaseline() {
  return fs.existsSync(getSetupBaselinePath());
}

function isSetupBaselineComplete() {
  const setupBaselinePath = getSetupBaselinePath();
  if (!hasSetupBaseline()) {
    return false;
  }
  const content = fs.readFileSync(setupBaselinePath, 'utf8');
  const status = String(content.match(/\*\*Status:\*\*\s*([^\n\r|]+)/i)?.[1] || '').trim().toLowerCase();
  return status === 'complete' || status === 'completed';
}

function isSetupBaselineTarget(input) {
  if (!input) return false;
  const normalized = String(input).replace(/\\/g, '/').trim().toUpperCase();
  return normalized === 'SETUP-BASELINE'
    || normalized === 'SETUP-BASELINE.FC.MD'
    || normalized.endsWith('/SETUP-BASELINE.FC.MD');
}

function isBootstrapCommandAllowed(commandName, commandArgs) {
  if (!commandName) {
    return true;
  }
  // Always allowed commands
  if (['help', '-h', '--help', 'init', 'tui', 'list', 'setup', 'complete-baseline', 'archive-baseline', 'install:prompt', 'setup:prompt'].includes(commandName)) {
    return true;
  }
  // SETUP-BASELINE-specific workflow commands
  if (['validate', 'plan', 'approve', 'execute', 'run', 'audit'].includes(commandName)) {
    const target = commandName === 'run' ? getFirstPositionalArg(commandArgs) : commandArgs[0];
    return isSetupBaselineTarget(target);
  }
  return false;
}

function getBootstrapGateMode() {
  // Check for --force flag
  if (args.includes('--force') || args.includes('-f')) {
    return 'off';
  }
  // Check config for gate mode
  const gateMode = repoConfig?.bootstrap?.gateMode;
  if (gateMode === 'off' || gateMode === 'warn' || gateMode === 'strict') {
    return gateMode;
  }
  return 'strict'; // default
}

const bootstrapGateMode = getBootstrapGateMode();
const bootstrapGateActive = hasSetupBaseline() && !isSetupBaselineComplete() && !isBootstrapCommandAllowed(cmd, args);

if (bootstrapGateActive && bootstrapGateMode !== 'off') {
  if (bootstrapGateMode === 'warn') {
    console.log(c.warn('[GRABBY] Bootstrap gate warning: SETUP-BASELINE.fc.md is not complete.'));
    console.log(c.dim('Run `grabby setup --quick` to complete setup quickly.\n'));
  } else {
    console.log(c.error('[GRABBY] Bootstrap gate active.'));
    console.log(c.warn('Complete setup before using other Grabby commands.\n'));
    console.log('Quick options:');
    console.log('  grabby setup --quick      # Auto-complete all baselines');
    console.log('  grabby setup --skip       # Skip and archive baselines');
    console.log('  grabby <cmd> --force      # Bypass gate for this command\n');
    console.log('Or complete manually:');
    console.log('  grabby install:prompt --tier 2');
    console.log('  grabby validate SETUP-BASELINE.fc.md');
    console.log('  grabby plan SETUP-BASELINE.fc.md');
    console.log('  grabby approve SETUP-BASELINE.fc.md');
    console.log('  # Finish remaining setup work in your preferred AI assistant');
    console.log('  grabby complete-baseline SETUP-BASELINE');
    process.exit(1);
  }
}

// Handle async commands
const command = shouldLaunchMenuByDefault ? tui : (commands[cmd] || help);
const result = command();
if (result instanceof Promise) {
  result.catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
