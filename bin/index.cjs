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
const { runWatchMode } = require('../lib/watcher.cjs');
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
const featureChat = require('../lib/feature-chat.cjs');
const contractLevels = require('../lib/contract-levels.cjs');
const { interactiveCreateRuleset } = require('../lib/ruleset-builder.cjs');

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
const PKG_ROOT = path.join(__dirname, '..');
const CWD = process.cwd();

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

// ============================================================================
// COMMANDS
// ============================================================================

function init() {
  commandHandlers.init();
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
    const id = content.match(/\*\*ID:\*\*\s*(FC-\d+)/)?.[1];
    if (!id) return;

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
  commandHandlers.execute(file);
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
  commandHandlers.audit(file);
}

function list() {
  commandHandlers.list();
}

function backlog(file) {
  commandHandlers.backlog(file);
}

function promptBundle(file) {
  commandHandlers.promptBundle(file);
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
  runWatchMode(projectContext.contractsDir, { logger: console });
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
  const app = createTUI(projectContext);
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

    default:
      console.log(c.heading('\nRuleset Commands'));
      console.log('─'.repeat(40));
      console.log('  grabby ruleset create [goal]      Create a ruleset interactively');
      console.log('');
      console.log(c.dim('Options:'));
      console.log(c.dim('  --title=<name>   Override ruleset title'));
      console.log(c.dim('  --from=<paths>   Comma-separated files/dirs for context'));
  }
}

// Feature management
function features() {
  featureChat.displayFeaturesSummary(CWD);
}

async function feature() {
  const subCommand = args[0];

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

const [cmd, ...args] = process.argv.slice(2);

const commands = {
  init,
  'init-hooks': initHooks,
  create: () => create(args.join(' ').replace(/--output.*$/, '').trim() || 'new-feature'),
  validate: () => validate(args[0]),
  plan: () => plan(args[0]),
  approve: () => approve(args[0]),
  execute: () => execute(args[0]),
  guard: () => guard(args[0]),
  resolve: () => resolve(args[0]),
  'upgrade-contract': () => upgradeContract(args[0]),
  audit: () => audit(args[0]),
  list,
  backlog: () => backlog(args[0]),
  prompt: () => promptBundle(args[0]),
  session: () => session(args[0]),
  watch,
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
  features,
  feature,
  ruleset,
  agent,
  task,
  orchestrate,
  quick,
  party,
  workflow,
  resume,
  help,
  '-h': help,
  '--help': help
};

// Handle async commands
const command = commands[cmd] || help;
const result = command();
if (result instanceof Promise) {
  result.catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
