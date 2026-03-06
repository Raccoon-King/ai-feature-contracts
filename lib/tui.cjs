/**
 * Terminal UI for Grabby
 * Menu-first interactive experience
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const { initConfig, loadConfig, saveConfig } = require('./config.cjs');
const { validateContract } = require('./core.cjs');
const { createPluginRegistry, updatePluginConfig, validatePlugin } = require('./plugins.cjs');

const ESC = '\x1b';
const CLEAR_SCREEN = `${ESC}[2J${ESC}[H`;
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;
const RESET = `${ESC}[0m`;
const CYAN = `${ESC}[36m`;
const GREEN = `${ESC}[32m`;
const YELLOW = `${ESC}[33m`;
const RED = `${ESC}[31m`;
const MAGENTA = `${ESC}[35m`;

const BOX = {
  topLeft: '+',
  topRight: '+',
  bottomLeft: '+',
  bottomRight: '+',
  horizontal: '-',
  vertical: '|',
};

function getStartupArt() {
  return [
    ' /\\_/\\  ',
    '(-o.o-) ',
    ' > ^ <  ',
    ' ██████╗ ██████╗  █████╗ ██████╗ ██████╗ ██╗   ██╗ █████╗ ██╗',
    '██╔════╝ ██╔══██╗██╔══██╗██╔══██╗██╔══██╗╚██╗ ██╔╝██╔══██╗██║',
    '██║  ███╗██████╔╝███████║██████╦╝██████╦╝ ╚████╔╝ ███████║██║',
    '██║   ██║██╔══██╗██╔══██║██╔══██╗██╔══██╗  ╚██╔╝  ██╔══██║██║',
    '╚██████╔╝██║  ██║██║  ██║██████╦╝██████╦╝   ██║   ██║  ██║██║',
    ' ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚═════╝    ╚═╝   ╚═╝  ╚═╝╚═╝',
  ].join('\n');
}

function colorizeStartupArt(art) {
  const grayscale = [255, 252, 250, 248, 246, 244, 242, 240, 238];
  return art
    .split('\n')
    .map((line, index) => `\x1b[38;5;${grayscale[Math.min(index, grayscale.length - 1)]}m${BOLD}${line}${RESET}`)
    .join('\n');
}

function drawBox(title, content, width = 60) {
  const lines = [];
  const innerWidth = width - 2;
  const titlePadded = title ? ` ${title} ` : '';
  const topBorder = BOX.topLeft +
    BOX.horizontal.repeat(2) +
    titlePadded +
    BOX.horizontal.repeat(Math.max(0, innerWidth - titlePadded.length - 2)) +
    BOX.topRight;
  lines.push(topBorder);

  for (const line of content.split('\n')) {
    const stripped = line.replace(/\x1b\[[0-9;]*m/g, '');
    const padding = ' '.repeat(Math.max(0, innerWidth - stripped.length));
    lines.push(`${BOX.vertical}${line}${padding}${BOX.vertical}`);
  }

  lines.push(BOX.bottomLeft + BOX.horizontal.repeat(innerWidth) + BOX.bottomRight);
  return lines.join('\n');
}

function createMenu(options = {}) {
  const {
    title = 'Menu',
    items = [],
    onSelect = () => {},
    onToggle = null,
    onExit = () => {},
    header = null,
  } = options;

  let selectedIndex = 0;
  let rl = null;
  let inputHandler = null;

  const render = () => {
    process.stdout.write(CLEAR_SCREEN);
    if (header) {
      console.log(header);
      console.log('');
    }
    console.log(`${CYAN}${BOLD}+${'-'.repeat(58)}+${RESET}`);
    console.log(`${CYAN}${BOLD}|${RESET}  ${MAGENTA}${BOLD}GRABBYAI${RESET} - ${title.padEnd(43)}${CYAN}${BOLD}|${RESET}`);
    console.log(`${CYAN}${BOLD}+${'-'.repeat(58)}+${RESET}`);
    console.log('');

    items.forEach((item, index) => {
      const isSelected = index === selectedIndex;
      const prefix = isSelected ? `${GREEN}>${RESET}` : ' ';
      const style = isSelected ? BOLD : '';
      const label = item.label || item;
      const desc = item.description ? `${DIM} - ${item.description}${RESET}` : '';
      console.log(`  ${prefix} ${style}${label}${RESET}${desc}`);
    });

    console.log('');
    const toggleHint = typeof onToggle === 'function' ? '  |  Space Toggle' : '';
    console.log(`${DIM}  Up/Down Navigate  |  Enter Select${toggleHint}  |  Esc Back  |  q Quit${RESET}`);
  };

  const cleanup = () => {
    if (inputHandler) {
      process.stdin.removeListener('data', inputHandler);
      inputHandler = null;
    }
    if (rl) {
      rl.close();
    }
    if (typeof process.stdin.setRawMode === 'function') {
      process.stdin.setRawMode(false);
    }
    process.stdout.write(SHOW_CURSOR);
  };

  const handleKey = (key) => {
    if (key === '\u001B[A') {
      selectedIndex = Math.max(0, selectedIndex - 1);
      render();
    } else if (key === '\u001B[B') {
      selectedIndex = Math.min(items.length - 1, selectedIndex + 1);
      render();
    } else if (key === '\u001B') {
      const backIndex = items.findIndex((item) => String(item?.action || '').toLowerCase() === 'back');
      cleanup();
      if (backIndex !== -1) {
        onSelect(items[backIndex], backIndex);
        return;
      }
      onExit();
    } else if (key === '\r' || key === '\n') {
      cleanup();
      onSelect(items[selectedIndex], selectedIndex);
    } else if (key === ' ' && typeof onToggle === 'function') {
      const toggled = onToggle(items[selectedIndex], selectedIndex);
      if (toggled !== false) {
        render();
      }
    } else if (key === 'q' || key === '\u0003') {
      cleanup();
      onExit();
    }
  };

  const start = () => {
    process.stdout.write(HIDE_CURSOR);
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    if (typeof process.stdin.setRawMode === 'function') {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    inputHandler = (data) => handleKey(data.toString());
    process.stdin.on('data', inputHandler);
    render();
  };

  return { start, cleanup, render };
}

function createTUI(context) {
  const cwd = context.cwd || path.dirname(context.contractsDir || process.cwd());
  const contractsDir = context.contractsDir || path.join(cwd, 'contracts');
  const grabbyDir = context.grabbyDir || path.join(cwd, '.grabby');
  const projectContextPath = path.join(grabbyDir, 'project-context.json');
  const commandHandlers = context.commandHandlers || null;
  const exitApp = typeof context.exit === 'function' ? context.exit : process.exit;

  function ensureRepoConfig() {
    initConfig(cwd);
    return loadConfig(cwd);
  }

  function isSetupComplete() {
    return fs.existsSync(path.join(grabbyDir, 'governance.lock'));
  }

  function isSetupAction(action) {
    return action === 'setup' || action === 'exit';
  }

  function saveRepoConfig(config) {
    saveConfig(config, cwd);
  }

  function getHeader() {
    const config = ensureRepoConfig();
    if (config.features?.startupArt === false) {
      return null;
    }
    return `${colorizeStartupArt(getStartupArt())}\n${DIM}Menu-first Grabby for governed feature delivery${RESET}`;
  }

  function readProjectContext() {
    if (!fs.existsSync(projectContextPath)) {
      return null;
    }
    try {
      return JSON.parse(fs.readFileSync(projectContextPath, 'utf8'));
    } catch {
      return null;
    }
  }

  function readWorkflowProgress() {
    const progressDir = path.join(cwd, '.grabby-progress');
    if (!fs.existsSync(progressDir)) {
      return [];
    }
    return fs.readdirSync(progressDir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(progressDir, file), 'utf8'));
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  function waitForKey(callback) {
    console.log(`${DIM}Press any key to continue...${RESET}`);
    if (typeof process.stdin.setRawMode === 'function') {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.once('data', () => {
      if (typeof process.stdin.setRawMode === 'function') {
        process.stdin.setRawMode(false);
      }
      callback();
    });
  }

  function promptForText(question, defaultValue, onAnswer) {
    if (typeof process.stdin.setRawMode === 'function') {
      process.stdin.setRawMode(false);
    }
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    const suffix = defaultValue ? ` (${defaultValue})` : '';
    rl.question(`${question}${suffix}: `, (answer) => {
      rl.close();
      onAnswer((answer || '').trim() || defaultValue || '');
    });
  }

  function promptForBoolean(question, currentValue, onAnswer) {
    promptForText(question, currentValue ? 'yes' : 'no', (answer) => {
      onAnswer(/^y(es)?$/i.test(answer));
    });
  }

  function parseContractStatus(content) {
    return content.match(/\*\*Status:\*\*\s*([^\n\r|]+)/i)?.[1]?.trim() || 'unknown';
  }

  function parseContractId(content, fileName) {
    return content.match(/\*\*ID:\*\*\s*([A-Za-z0-9-]+)/i)?.[1]?.trim() || fileName.replace(/\.fc\.md$/i, '');
  }

  function readPlanStatus(planPath) {
    if (!fs.existsSync(planPath)) return null;
    try {
      return yaml.parse(fs.readFileSync(planPath, 'utf8'))?.status || null;
    } catch {
      return null;
    }
  }

  function readAuditStatus(auditPath) {
    if (!fs.existsSync(auditPath)) return null;
    const content = fs.readFileSync(auditPath, 'utf8');
    return content.match(/- Status:\s*([^\n\r]+)/)?.[1]?.trim() || null;
  }

  function getRecommendedAction(contract) {
    if (contract.status === 'complete') {
      return {
        key: 'archive',
        label: 'Archive Contract',
        description: 'Compress active artifacts and remove the live contract',
      };
    }

    if (contract.auditStatus === 'complete') {
      return {
        key: 'mark-complete',
        label: 'Mark Complete',
        description: 'Finalize the contract after a passing audit',
      };
    }

    if (contract.planStatus === 'executing') {
      return {
        key: 'audit',
        label: 'Audit Contract',
        description: 'Run post-execution verification and write the audit artifact',
      };
    }

    if (contract.status === 'approved' && contract.planStatus === 'approved') {
      return {
        key: 'execute',
        label: 'Execute Contract',
        description: 'Enter the approved implementation handoff',
      };
    }

    if (contract.planStatus === 'pending_approval' || contract.planStatus === 'approved') {
      return {
        key: 'approve',
        label: 'Approve Contract',
        description: 'Record execution approval and unlock execute',
      };
    }

    if (contract.isValid) {
      return {
        key: 'plan',
        label: 'Plan Contract',
        description: 'Generate the plan artifact and move toward approval',
      };
    }

    return {
      key: 'validate',
      label: 'Validate Contract',
      description: 'Check the contract before planning',
    };
  }

  function readContractLifecycle() {
    if (!fs.existsSync(contractsDir)) {
      return [];
    }

    return fs.readdirSync(contractsDir)
      .filter((file) => file.endsWith('.fc.md'))
      .map((file) => {
        const filePath = path.join(contractsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const id = parseContractId(content, file);
        const status = parseContractStatus(content);
        const validation = validateContract(content);
        const planPath = path.join(contractsDir, `${id}.plan.yaml`);
        const auditPath = path.join(contractsDir, `${id}.audit.md`);
        const planStatus = readPlanStatus(planPath);
        const auditStatus = readAuditStatus(auditPath);
        const recommended = getRecommendedAction({
          id,
          file,
          status,
          isValid: validation.valid,
          planStatus,
          auditStatus,
        });

        return {
          id,
          file,
          filePath,
          status,
          isValid: validation.valid,
          validationErrors: validation.errors.length,
          planPath,
          planStatus,
          auditPath,
          auditStatus,
          recommended,
        };
      })
      .sort((a, b) => a.file.localeCompare(b.file));
  }

  function markContractComplete(contract) {
    if (contract.auditStatus !== 'complete') {
      console.log(`${YELLOW}Audit has not passed yet for ${contract.file}.${RESET}`);
      return false;
    }

    let content = fs.readFileSync(contract.filePath, 'utf8');
    if (/\*\*Status:\*\*\s*[^\n\r|]+/i.test(content)) {
      content = content.replace(/\*\*Status:\*\*\s*[^\n\r|]+/i, '**Status:** complete');
    } else {
      content = `${content.trimEnd()}\n\n**Status:** complete\n`;
    }
    fs.writeFileSync(contract.filePath, content, 'utf8');

    if (fs.existsSync(contract.planPath)) {
      try {
        const plan = yaml.parse(fs.readFileSync(contract.planPath, 'utf8')) || {};
        plan.status = 'complete';
        if (!plan.completed_at) {
          plan.completed_at = new Date().toISOString();
        }
        fs.writeFileSync(contract.planPath, yaml.stringify(plan));
      } catch {
        // Leave the plan untouched if it cannot be parsed.
      }
    }

    console.log(`${GREEN}Contract marked complete.${RESET}`);
    return true;
  }

  function runWorkflowAction(contract, actionKey) {
    switch (actionKey) {
      case 'validate':
        if (!commandHandlers) {
          console.log(`${YELLOW}Workflow actions require CLI command handlers.${RESET}`);
          return;
        }
        commandHandlers.validate(contract.file);
        break;
      case 'plan':
        if (!commandHandlers) {
          console.log(`${YELLOW}Workflow actions require CLI command handlers.${RESET}`);
          return;
        }
        commandHandlers.plan(contract.file);
        break;
      case 'approve':
        if (!commandHandlers) {
          console.log(`${YELLOW}Workflow actions require CLI command handlers.${RESET}`);
          return;
        }
        commandHandlers.approve(contract.file);
        break;
      case 'execute':
        if (!commandHandlers) {
          console.log(`${YELLOW}Workflow actions require CLI command handlers.${RESET}`);
          return;
        }
        commandHandlers.execute(contract.file, { yes: true });
        break;
      case 'audit':
        if (!commandHandlers) {
          console.log(`${YELLOW}Workflow actions require CLI command handlers.${RESET}`);
          return;
        }
        commandHandlers.audit(contract.file, { yes: true });
        break;
      case 'mark-complete':
        markContractComplete(contract);
        break;
      case 'archive':
        if (!commandHandlers) {
          console.log(`${YELLOW}Workflow actions require CLI command handlers.${RESET}`);
          return;
        }
        commandHandlers.featureClose(contract.id, { yes: true });
        break;
      default:
        console.log(`${YELLOW}Unknown workflow action: ${actionKey}${RESET}`);
    }
  }

  function mainMenu() {
    const projectContext = readProjectContext();
    const progress = readWorkflowProgress()[0];
    const setupComplete = isSetupComplete();
    const menu = createMenu({
      title: 'Main Menu',
      header: `${getHeader() || ''}${!setupComplete ? `\n${YELLOW}Setup Required${RESET}${DIM}: Run "Setup & Onboarding" before using post-setup menu actions.${RESET}` : ''}${projectContext ? `\n${DIM}Brownfield context: ${projectContext.stackSummary} | Dirs: ${(projectContext.recommendedDirectories || []).join(', ') || 'n/a'}${RESET}` : ''}${progress ? `\n${DIM}Workflow progress: ${progress.workflow} | ${progress.data?.status || 'in_progress'} | Next: ${progress.data?.nextStep || 'n/a'}${RESET}` : ''}`,
      items: [
        { label: 'Contracts', description: setupComplete ? 'View and continue active governed work' : 'Locked until setup completes', action: 'list' },
        { label: 'Setup & Onboarding', description: setupComplete ? 'Configure Grabby, brownfield context, and rulesets' : 'Required first step before post-setup actions', action: 'setup' },
        { label: 'Start Work', description: setupComplete ? 'Create or continue a contract from the guided workflow' : 'Locked until setup completes', action: 'create' },
        { label: 'Validate All', description: setupComplete ? 'Check all contracts quickly' : 'Locked until setup completes', action: 'validate' },
        { label: 'Metrics & Health', description: setupComplete ? 'Show contract and repo statistics' : 'Locked until setup completes', action: 'metrics' },
        { label: 'Watch Mode', description: setupComplete ? 'Auto-validate on changes' : 'Locked until setup completes', action: 'watch' },
        { label: 'Automation', description: setupComplete ? 'Review CI/CD automation status' : 'Locked until setup completes', action: 'cicd' },
        { label: 'Plugins', description: setupComplete ? 'Inspect installed plugins' : 'Locked until setup completes', action: 'plugins' },
        { label: 'Settings', description: setupComplete ? 'Toggle Grabby features and preferences' : 'Locked until setup completes', action: 'settings' },
        { label: 'Rulesets', description: setupComplete ? 'Import or create repository rulesets' : 'Locked until setup completes', action: 'rulesets' },
        { label: 'Exit', description: 'Quit Grabby', action: 'exit' },
      ],
      onSelect: (item) => handleAction(item.action),
      onExit: () => {
        console.log('\nGoodbye!');
        exitApp(0);
      },
    });

    menu.start();
  }

  function applySetupDefaults(overrides = {}) {
    const config = ensureRepoConfig();
    config.interactive.enabled = overrides.interactiveEnabled ?? true;
    config.features.menuMode = overrides.menuMode ?? true;
    config.features.startupArt = overrides.startupArt ?? true;
    config.features.rulesetWizard = overrides.rulesetWizard ?? true;
    if (overrides.trackingMode) {
      config.contracts.trackingMode = overrides.trackingMode;
    }
    saveRepoConfig(config);
    return config;
  }

  function showContractList() {
    console.log(`${CYAN}${BOLD}Contracts${RESET}\n`);

    if (!fs.existsSync(contractsDir)) {
      console.log(`${DIM}No contracts directory found.${RESET}`);
      waitForKey(mainMenu);
      return;
    }

    const files = fs.readdirSync(contractsDir).filter((file) => file.endsWith('.fc.md'));
    if (files.length === 0) {
      console.log(`${DIM}No contracts found.${RESET}`);
    } else {
      files.forEach((file) => {
        const content = fs.readFileSync(path.join(contractsDir, file), 'utf8');
        const status = content.match(/\*\*Status:\*\*\s*(\w+)/)?.[1] || '?';
        const statusColor = { draft: YELLOW, approved: GREEN, complete: CYAN }[status] || DIM;
        console.log(`  ${statusColor}o${RESET} ${file} [${status}]`);
      });
    }

    console.log('');
    waitForKey(mainMenu);
  }

  function runValidateAll() {
    console.log(`${CYAN}${BOLD}Validating Contracts${RESET}\n`);
    const { validateContract } = require('./core.cjs');

    if (!fs.existsSync(contractsDir)) {
      console.log(`${RED}No contracts directory.${RESET}`);
      waitForKey(mainMenu);
      return;
    }

    const files = fs.readdirSync(contractsDir).filter((file) => file.endsWith('.fc.md'));
    let passed = 0;
    let failed = 0;

    files.forEach((file) => {
      const content = fs.readFileSync(path.join(contractsDir, file), 'utf8');
      const result = validateContract(content);
      if (result.valid) {
        console.log(`  ${GREEN}OK${RESET} ${file}`);
        passed += 1;
      } else {
        console.log(`  ${RED}FAIL${RESET} ${file} (${result.errors.length} errors)`);
        failed += 1;
      }
    });

    console.log(`\n${passed} passed, ${failed} failed`);
    waitForKey(mainMenu);
  }

  function runMetrics() {
    const { collectMetrics, generateReport } = require('./metrics.cjs');
    const metrics = collectMetrics(contractsDir);
    const report = generateReport(metrics, { summaryOnly: true });
    console.log(report);
    waitForKey(mainMenu);
  }

  function confirmOverwrite(target, onDecision) {
    if (!target.exists) {
      onDecision(true);
      return;
    }
    promptForText(`Overwrite existing ${target.path}? yes/no`, 'no', (answer) => {
      onDecision(/^y(es)?$/i.test(answer));
    });
  }

  function automationTargetMenu(targetKey) {
    const { getAutomationTarget, configureAutomationFile } = require('./cicd.cjs');
    const target = getAutomationTarget(cwd, targetKey);
    if (!target) {
      console.log(`${RED}Unknown automation target: ${targetKey}${RESET}`);
      waitForKey(runCICDSetup);
      return;
    }

    const items = [];
    if (target.key === 'grabby-config') {
      items.push({
        label: 'Guided Starter Config',
        description: 'Answer a few prompts and write a starter .grabby/config.yaml',
        action: 'guided-config',
      });
    }
    items.push({
      label: 'Generate Grabby Default',
      description: `Write ${target.path} using Grabby defaults`,
      action: 'generate',
    });
    items.push({
      label: 'Import Existing File',
      description: target.importLabel || 'Import from an existing local file',
      action: 'import',
    });
    if (target.exists) {
      items.push({
        label: 'View Current File',
        description: `Preview ${target.path}`,
        action: 'view',
      });
    }
    items.push({ label: 'Back', description: 'Return to Automation status', action: 'back' });

    const menu = createMenu({
      title: `${target.name} Wizard`,
      header: `${getHeader() || ''}\n${DIM}${target.description}${RESET}\n${DIM}Target: ${target.path}${RESET}`,
      items,
      onSelect: (item) => {
        process.stdout.write(CLEAR_SCREEN);
        if (item.action === 'back') {
          runCICDSetup();
          return;
        }
        if (item.action === 'view') {
          console.log(`${CYAN}${BOLD}${target.path}${RESET}\n`);
          console.log(fs.readFileSync(target.absolutePath, 'utf8'));
          waitForKey(() => automationTargetMenu(target.key));
          return;
        }
        if (item.action === 'guided-config') {
          promptForText('Validate command', 'grabby validate contracts/<ID>.fc.md', (validateCommand) => {
            promptForText('Lint command', 'npm run lint', (lintCommand) => {
              promptForText('Test command', 'npm test -- --runInBand', (testCommand) => {
                const freshTarget = getAutomationTarget(cwd, target.key);
                confirmOverwrite(freshTarget, (confirmed) => {
                  if (!confirmed) {
                    console.log('Canceled.');
                    waitForKey(() => automationTargetMenu(target.key));
                    return;
                  }
                  const result = configureAutomationFile(cwd, target.key, {
                    mode: 'generate',
                    force: true,
                    validateCommand,
                    lintCommand,
                    testCommand,
                  });
                  console.log(`${GREEN}Configured ${result.target.name}.${RESET}`);
                  console.log(`${DIM}${result.target.path}${RESET}`);
                  waitForKey(() => automationTargetMenu(target.key));
                });
              });
            });
          });
          return;
        }
        if (item.action === 'generate') {
          const freshTarget = getAutomationTarget(cwd, target.key);
          confirmOverwrite(freshTarget, (confirmed) => {
            if (!confirmed) {
              console.log('Canceled.');
              waitForKey(() => automationTargetMenu(target.key));
              return;
            }
            try {
              const result = configureAutomationFile(cwd, target.key, { mode: 'generate', force: true });
              console.log(`${GREEN}Configured ${result.target.name}.${RESET}`);
              console.log(`${DIM}${result.target.path}${RESET}`);
            } catch (error) {
              console.log(`${RED}${error.message}${RESET}`);
            }
            waitForKey(() => automationTargetMenu(target.key));
          });
          return;
        }
        promptForText('Import from path', target.path, (importPath) => {
          const freshTarget = getAutomationTarget(cwd, target.key);
          confirmOverwrite(freshTarget, (confirmed) => {
            if (!confirmed) {
              console.log('Canceled.');
              waitForKey(() => automationTargetMenu(target.key));
              return;
            }
            try {
              const result = configureAutomationFile(cwd, target.key, {
                mode: 'import',
                importPath,
                force: true,
              });
              console.log(`${GREEN}Imported ${result.target.name}.${RESET}`);
              console.log(`${DIM}Source: ${path.relative(cwd, result.sourcePath).replace(/\\/g, '/')}${RESET}`);
            } catch (error) {
              console.log(`${RED}${error.message}${RESET}`);
            }
            waitForKey(() => automationTargetMenu(target.key));
          });
        });
      },
      onExit: runCICDSetup,
    });

    menu.start();
  }

  function runCICDSetup() {
    const { checkCICDSetup, formatSetupReport } = require('./cicd.cjs');
    const status = checkCICDSetup(cwd);
    const menu = createMenu({
      title: 'Automation',
      header: `${getHeader() || ''}\n${formatSetupReport(status)}`,
      items: [
        ...status.checks.map((check) => ({
          label: `${check.name}: ${check.exists ? 'Present' : 'Missing'}`,
          description: check.exists ? check.path : `Missing: ${check.path}`,
          action: check.key,
        })),
        { label: 'Back', description: 'Return to the main menu', action: 'back' },
      ],
      onSelect: (item) => {
        process.stdout.write(CLEAR_SCREEN);
        if (item.action === 'back') {
          mainMenu();
          return;
        }
        automationTargetMenu(item.action);
      },
      onExit: mainMenu,
    });

    menu.start();
  }

  function showPlugins() {
    pluginManagerMenu();
  }

  function getPluginCatalog() {
    const repoConfig = ensureRepoConfig();
    const projectContext = readProjectContext();
    const registry = createPluginRegistry(grabbyDir);
    registry.loadAll({
      config: repoConfig,
      detectedKeys: projectContext?.plugins?.suggested || [],
    });
    return {
      repoConfig,
      registry,
      plugins: registry.listAvailable(),
    };
  }

  function savePluginState(pluginKey, updates) {
    const repoConfig = ensureRepoConfig();
    updatePluginConfig(repoConfig, pluginKey, updates);
    saveRepoConfig(repoConfig);
    return repoConfig;
  }

  function savePluginConstraint(pluginKey, constraintKey, value) {
    const repoConfig = ensureRepoConfig();
    const current = repoConfig.plugins?.items?.[pluginKey] || {};
    updatePluginConfig(repoConfig, pluginKey, {
      ...current,
      constraints: {
        ...(current.constraints || {}),
        [constraintKey]: value,
      },
    });
    saveRepoConfig(repoConfig);
    return repoConfig;
  }

  function formatPluginStatus(plugin) {
    if (plugin.enabled) return plugin.mode === 'read-only' ? 'enabled:read-only' : 'enabled';
    if (plugin.detected) return 'detected';
    if (plugin.installed) return 'installed';
    return 'available';
  }

  function pluginDetailMenu(pluginKey) {
    const { plugins } = getPluginCatalog();
    const plugin = plugins.find((entry) => entry.key === pluginKey);
    if (!plugin) {
      console.log(`${YELLOW}Plugin not found: ${pluginKey}${RESET}`);
      waitForKey(pluginManagerMenu);
      return;
    }

    const menu = createMenu({
      title: `Plugin: ${plugin.name}`,
      header: `${getHeader() || ''}\n${DIM}Status: ${formatPluginStatus(plugin)} | Source: ${plugin.source}${RESET}\n${DIM}${plugin.description}${RESET}`,
      items: [
        { label: plugin.enabled ? 'Disable Plugin' : 'Enable Plugin', description: 'Toggle this plugin for the current repo', action: 'toggle' },
        { label: 'Set Read-Only Mode', description: 'Enable the plugin without active policy enforcement', action: 'read-only' },
        { label: 'Configure Roots', description: 'Set stack-specific scan roots for this repo', action: 'roots' },
        { label: 'Validate Plugin Setup', description: 'Check plugin configuration or custom plugin structure', action: 'validate' },
        { label: 'Back', description: 'Return to the plugin manager', action: 'back' },
      ],
      onSelect: (item) => {
        process.stdout.write(CLEAR_SCREEN);
        if (item.action === 'back') {
          pluginManagerMenu();
          return;
        }
        if (item.action === 'toggle') {
          const nextEnabled = !plugin.enabled;
          savePluginState(plugin.key, {
            enabled: nextEnabled,
            mode: nextEnabled ? 'active' : 'off',
            detected: plugin.detected,
            source: plugin.source,
          });
          console.log(`${GREEN}${nextEnabled ? 'Enabled' : 'Disabled'} ${plugin.name}.${RESET}`);
          waitForKey(() => pluginDetailMenu(plugin.key));
          return;
        }
        if (item.action === 'read-only') {
          savePluginState(plugin.key, {
            enabled: true,
            mode: 'read-only',
            detected: plugin.detected,
            source: plugin.source,
          });
          console.log(`${GREEN}${plugin.name} set to read-only mode.${RESET}`);
          waitForKey(() => pluginDetailMenu(plugin.key));
          return;
        }
        if (item.action === 'roots') {
          promptForText('Plugin roots (comma separated)', plugin.roots.join(', '), (answer) => {
            const roots = answer
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean);
            savePluginState(plugin.key, {
              enabled: plugin.enabled,
              mode: plugin.enabled ? plugin.mode : 'off',
              detected: plugin.detected,
              source: plugin.source,
              roots,
            });
            console.log(`${GREEN}Saved roots for ${plugin.name}.${RESET}`);
            waitForKey(() => pluginDetailMenu(plugin.key));
          });
          return;
        }
        if (plugin.source === 'custom' && plugin.runtime?.path) {
          const result = validatePlugin(plugin.runtime.path);
          if (result.valid) {
            console.log(`${GREEN}${plugin.name} is valid.${RESET}`);
          } else {
            console.log(`${RED}${plugin.name} is invalid: ${result.errors.join('; ')}${RESET}`);
          }
          if (result.warnings.length > 0) {
            console.log(`${YELLOW}${result.warnings.join('; ')}${RESET}`);
          }
        } else {
          console.log(`${GREEN}${plugin.name} is ready for repo-level configuration.${RESET}`);
          console.log(`${DIM}Mode: ${plugin.mode} | Roots: ${plugin.roots.join(', ') || 'default detection'}${RESET}`);
        }
        waitForKey(() => pluginDetailMenu(plugin.key));
      },
      onExit: pluginManagerMenu,
    });

    menu.start();
  }

  function pluginManagerMenu() {
    const { plugins } = getPluginCatalog();
    const items = plugins.length > 0
      ? plugins.map((plugin) => ({
          label: `${plugin.name} [${formatPluginStatus(plugin)}]`,
          description: plugin.description,
          action: plugin.key,
        }))
      : [{ label: 'No plugins available', description: 'Scaffold or detect plugins first', action: 'empty' }];

    const menu = createMenu({
      title: 'Plugin Manager',
      header: `${getHeader() || ''}\n${DIM}Enable stack-specific plugins per repo. Detected plugins come from brownfield assessment.${RESET}`,
      items: [
        ...items,
        { label: 'Back', description: 'Return to the main menu', action: 'back' },
      ],
      onSelect: (item) => {
        process.stdout.write(CLEAR_SCREEN);
        if (item.action === 'back') {
          mainMenu();
          return;
        }
        if (item.action === 'empty') {
          console.log(`${DIM}No plugins installed or detected.${RESET}`);
          waitForKey(mainMenu);
          return;
        }
        pluginDetailMenu(item.action);
      },
      onToggle: (item) => {
        if (item.action === 'back' || item.action === 'empty') {
          return false;
        }
        const { plugins: currentPlugins } = getPluginCatalog();
        const plugin = currentPlugins.find((entry) => entry.key === item.action);
        if (!plugin) {
          return false;
        }
        const nextEnabled = !plugin.enabled;
        savePluginState(plugin.key, {
          enabled: nextEnabled,
          mode: nextEnabled ? 'active' : 'off',
          detected: plugin.detected,
          source: plugin.source,
        });
        const { plugins: nextPlugins } = getPluginCatalog();
        const updated = nextPlugins.find((entry) => entry.key === plugin.key);
        if (updated) {
          item.label = `${updated.name} [${formatPluginStatus(updated)}]`;
        }
        return true;
      },
      onExit: mainMenu,
    });

    menu.start();
  }

  function showCreateGuidance() {
    contractWorkflowMenu();
  }

  function createContractFromMenu() {
    process.stdout.write(CLEAR_SCREEN);
    promptForText('Contract name', 'new-feature', (name) => {
      process.stdout.write(CLEAR_SCREEN);
      if (!commandHandlers) {
        console.log(`${CYAN}${BOLD}Guided Contract Start${RESET}\n`);
        console.log('Start bounded feature work with one of these commands:');
        console.log(`${DIM}  grabby task "your feature request"${RESET}`);
        console.log(`${DIM}  grabby ticket "your feature request"${RESET}`);
        console.log(`${DIM}  grabby orchestrate "your feature request"${RESET}`);
        waitForKey(contractWorkflowMenu);
        return;
      }
      commandHandlers.create(name);
      console.log('\nCreated contract via menu.');
      waitForKey(contractWorkflowMenu);
    });
  }

  function contractDetailMenu(contractFile) {
    const contract = readContractLifecycle().find((entry) => entry.file === contractFile);
    if (!contract) {
      console.log(`${YELLOW}Contract no longer exists: ${contractFile}${RESET}`);
      waitForKey(contractWorkflowMenu);
      return;
    }

    const menu = createMenu({
      title: `Contract Workflow: ${contract.id}`,
      header: `${getHeader() || ''}\n${DIM}Status: ${contract.status} | Plan: ${contract.planStatus || 'none'} | Audit: ${contract.auditStatus || 'none'}${RESET}\n${DIM}Recommended next step: ${contract.recommended.label}${RESET}`,
      items: [
        { label: `Continue: ${contract.recommended.label}`, description: contract.recommended.description, action: contract.recommended.key },
        { label: 'Validate Contract', description: 'Run contract validation', action: 'validate' },
        { label: 'Plan Contract', description: 'Generate or refresh the plan artifact', action: 'plan' },
        { label: 'Approve Contract', description: 'Record approval for execution', action: 'approve' },
        { label: 'Execute Contract', description: 'Run the execution handoff', action: 'execute' },
        { label: 'Audit Contract', description: 'Run post-execution checks', action: 'audit' },
        { label: 'Mark Complete', description: 'Finalize after a passing audit', action: 'mark-complete' },
        { label: 'Archive Contract', description: 'Close and compress active artifacts', action: 'archive' },
        { label: 'Back', description: 'Return to the contract list', action: 'back' },
      ],
      onSelect: (item) => {
        process.stdout.write(CLEAR_SCREEN);
        if (item.action === 'back') {
          contractSelectionMenu();
          return;
        }
        runWorkflowAction(contract, item.action);
        waitForKey(() => contractDetailMenu(contract.file));
      },
      onExit: contractSelectionMenu,
    });

    menu.start();
  }

  function contractSelectionMenu() {
    const contracts = readContractLifecycle();
    if (contracts.length === 0) {
      console.log(`${DIM}No contracts found.${RESET}`);
      waitForKey(contractWorkflowMenu);
      return;
    }

    const menu = createMenu({
      title: 'Select Contract',
      header: getHeader(),
      items: [
        ...contracts.map((contract) => ({
          label: `${contract.file} [${contract.status}]`,
          description: `Next: ${contract.recommended.label}`,
          action: contract.file,
        })),
        { label: 'Back', description: 'Return to the workflow menu', action: 'back' },
      ],
      onSelect: (item) => {
        process.stdout.write(CLEAR_SCREEN);
        if (item.action === 'back') {
          contractWorkflowMenu();
          return;
        }
        contractDetailMenu(item.action);
      },
      onExit: contractWorkflowMenu,
    });

    menu.start();
  }

  function contractWorkflowMenu() {
    const menu = createMenu({
      title: 'Contract Workflow',
      header: getHeader(),
      items: [
        { label: 'Create New Contract', description: 'Create a contract without leaving the menu', action: 'create-new' },
        { label: 'Select Existing Contract', description: 'Continue governance on a live contract', action: 'select-existing' },
        { label: 'Back', description: 'Return to the main menu', action: 'back' },
      ],
      onSelect: (item) => {
        process.stdout.write(CLEAR_SCREEN);
        if (item.action === 'back') {
          mainMenu();
          return;
        }
        if (item.action === 'create-new') {
          createContractFromMenu();
          return;
        }
        contractSelectionMenu();
      },
      onExit: mainMenu,
    });

    menu.start();
  }

  function setupWizardAdvancedMenu() {
    const config = ensureRepoConfig();
    const menu = createMenu({
      title: 'Setup Wizard: Advanced',
      header: getHeader(),
      items: [
        {
          label: `Use Tracked Contracts (${config.contracts.trackingMode === 'tracked' ? 'current' : 'switch'})`,
          description: 'Keep contracts in contracts/',
          action: 'tracking-tracked',
        },
        {
          label: `Use Local-Only Contracts (${config.contracts.trackingMode === 'local-only' ? 'current' : 'switch'})`,
          description: 'Store contracts under .grabby/contracts',
          action: 'tracking-local',
        },
        {
          label: 'Import Existing Rules During Setup',
          description: 'Ingest standards from existing files',
          action: 'rules-import',
        },
        {
          label: 'Create Local Ruleset During Setup',
          description: 'Create a repo-local ruleset under .grabby',
          action: 'rules-local',
        },
        {
          label: 'Regenerate Brownfield Context',
          description: 'Refresh .grabby/project-context.json from the current repository',
          action: 'context-regenerate',
        },
        {
          label: 'Update Grabby CLI',
          description: 'Install latest Grabby release globally (with confirmation)',
          action: 'update-apply',
        },
        { label: 'Back', description: 'Return to Setup Wizard', action: 'back' },
      ],
      onSelect: (item) => {
        process.stdout.write(CLEAR_SCREEN);
        const { runRulesetWizard } = require('./ruleset-builder.cjs');

        if (item.action === 'back') {
          setupWizardMenu();
          return;
        }

        if (item.action === 'tracking-tracked') {
          applySetupDefaults({ trackingMode: 'tracked' });
          console.log('Tracking mode set to tracked.');
          waitForKey(setupWizardAdvancedMenu);
          return;
        }

        if (item.action === 'tracking-local') {
          applySetupDefaults({ trackingMode: 'local-only' });
          console.log('Tracking mode set to local-only.');
          waitForKey(setupWizardAdvancedMenu);
          return;
        }

        if (item.action === 'context-regenerate') {
          const { generateProjectContextArtifact } = require('./assessment.cjs');
          Promise.resolve(generateProjectContextArtifact({ cwd }))
            .then((result) => {
              console.log(`Refreshed ${path.relative(cwd, result.outputPath).replace(/\\/g, '/')}`);
              console.log(`Summary: ${result.summary}`);
              waitForKey(setupWizardAdvancedMenu);
            })
            .catch((error) => {
              console.log(`${RED}Setup wizard failed: ${error.message}${RESET}`);
              waitForKey(setupWizardAdvancedMenu);
            });
          return;
        }

        if (item.action === 'update-apply') {
          if (!commandHandlers || typeof commandHandlers.updateGrabby !== 'function') {
            console.log(`${CYAN}Run:${RESET} grabby update --yes`);
            waitForKey(setupWizardAdvancedMenu);
            return;
          }
          promptForText('Apply update now? yes/no', 'no', (answer) => {
            const approved = /^y(es)?$/i.test(String(answer || '').trim());
            if (!approved) {
              console.log('Update canceled.');
              waitForKey(setupWizardAdvancedMenu);
              return;
            }
            commandHandlers.updateGrabby({ yes: true });
            waitForKey(setupWizardAdvancedMenu);
          });
          return;
        }

        const mode = item.action === 'rules-import' ? 'import-existing' : 'create-local';
        Promise.resolve(runRulesetWizard(cwd, { mode, logger: console }))
          .then(() => {
            console.log('Ruleset step completed.');
            waitForKey(setupWizardAdvancedMenu);
          })
          .catch((error) => {
            console.log(`${RED}Setup wizard failed: ${error.message}${RESET}`);
            waitForKey(setupWizardAdvancedMenu);
          });
      },
      onExit: setupWizardMenu,
    });

    menu.start();
  }

  function setupWizardMenu() {
    const projectContext = readProjectContext();
    const menu = createMenu({
      title: 'Setup Wizard',
      header: getHeader(),
      items: [
        {
          label: 'Quick Setup (Recommended)',
          description: 'Apply standard defaults for menu-first governed workflow',
          action: 'recommended',
        },
        {
          label: 'Run Brownfield Init (Interactive)',
          description: 'Execute grabby init --interactive from this menu',
          action: 'init-interactive',
        },
        {
          label: 'Advanced Setup',
          description: 'Tracking mode, ruleset ingestion, context refresh, and updates',
          action: 'advanced',
        },
        {
          label: projectContext ? 'Review Brownfield Context' : 'No Brownfield Context Yet',
          description: projectContext
            ? `${projectContext.stackSummary} | ${(projectContext.recommendedDirectories || []).join(', ') || 'no recommended directories'}`
            : 'Run a brownfield context scan during setup',
          action: 'context-review',
        },
        {
          label: 'Check for Grabby Updates',
          description: 'Compare installed vs latest Grabby CLI version',
          action: 'update-check',
        },
        {
          label: 'Finish Setup',
          description: 'Return to the home menu',
          action: 'back',
        },
      ],
      onSelect: (item) => {
        process.stdout.write(CLEAR_SCREEN);

        if (item.action === 'back') {
          console.log('Setup wizard complete.');
          waitForKey(mainMenu);
          return;
        }

        if (item.action === 'recommended') {
          quickSetupMenu();
          return;
        }

        if (item.action === 'init-interactive') {
          if (!commandHandlers || typeof commandHandlers.init !== 'function') {
            console.log(`${CYAN}Run:${RESET} grabby init --interactive`);
            waitForKey(setupWizardMenu);
            return;
          }
          commandHandlers.init({ interactive: true });
          console.log('Interactive brownfield initialization completed.');
          waitForKey(setupWizardMenu);
          return;
        }

        if (item.action === 'advanced') {
          setupWizardAdvancedMenu();
          return;
        }

        if (item.action === 'context-review') {
          if (!projectContext) {
            console.log('No brownfield context has been generated yet.');
          } else {
            console.log(`${CYAN}${BOLD}Brownfield Context${RESET}\n`);
            console.log(`Stack: ${projectContext.stackSummary}`);
            console.log(`Summary: ${projectContext.summary}`);
            console.log(`Recommended directories: ${(projectContext.recommendedDirectories || []).join(', ') || 'n/a'}`);
            console.log(`Testing signals: ${(projectContext.testing?.signals || []).join(', ') || 'none detected'}`);
          }
          waitForKey(setupWizardMenu);
          return;
        }

        if (!commandHandlers || typeof commandHandlers.updateGrabby !== 'function') {
          console.log(`${CYAN}Run:${RESET} grabby update --check`);
          waitForKey(setupWizardMenu);
          return;
        }
        commandHandlers.updateGrabby({ checkOnly: true });
        waitForKey(setupWizardMenu);
      },
      onExit: mainMenu,
    });

    menu.start();
  }

  function quickSetupMenu() {
    const menu = createMenu({
      title: 'Quick Setup Path',
      header: getHeader(),
      items: [
        {
          label: 'Brownfield Setup (Recommended)',
          description: 'Existing repository: run init in interactive mode',
          action: 'brownfield',
        },
        {
          label: 'Standard Setup',
          description: 'New repository: run standard init',
          action: 'standard',
        },
        {
          label: 'Back',
          description: 'Return to Setup Wizard',
          action: 'back',
        },
      ],
      onSelect: (item) => {
        process.stdout.write(CLEAR_SCREEN);

        if (item.action === 'back') {
          setupWizardMenu();
          return;
        }

        applySetupDefaults();

        if (!commandHandlers || typeof commandHandlers.init !== 'function') {
          if (item.action === 'brownfield') {
            console.log(`${CYAN}Run:${RESET} grabby init --interactive`);
          } else {
            console.log(`${CYAN}Run:${RESET} grabby init`);
          }
          console.log('Applied recommended setup defaults.');
          waitForKey(setupWizardMenu);
          return;
        }

        if (item.action === 'brownfield') {
          commandHandlers.init({ interactive: true });
          console.log('Brownfield initialization completed with interactive setup.');
          waitForKey(setupWizardMenu);
          return;
        }

        commandHandlers.init({ interactive: false });
        console.log('Standard initialization completed.');
        waitForKey(setupWizardMenu);
      },
      onExit: setupWizardMenu,
    });

    menu.start();
  }

  function toggleSetting(settingPath) {
    const config = ensureRepoConfig();
    const parts = settingPath.split('.');
    let current = config;
    for (let index = 0; index < parts.length - 1; index += 1) {
      if (!current[parts[index]] || typeof current[parts[index]] !== 'object') {
        current[parts[index]] = {};
      }
      current = current[parts[index]];
    }
    const leaf = parts[parts.length - 1];
    current[leaf] = !Boolean(current[leaf]);
    saveRepoConfig(config);
    return current[leaf];
  }

  function settingsMenu() {
    const config = ensureRepoConfig();
    const menu = createMenu({
      title: 'Settings',
      header: getHeader(),
      items: [
        {
          label: `Interactive Mode: ${config.interactive.enabled ? 'ON' : 'OFF'}`,
          description: 'Pause at governance breakpoints by default',
          action: 'toggle:interactive.enabled',
        },
        {
          label: `Menu On Start: ${config.features.menuMode ? 'ON' : 'OFF'}`,
          description: 'Open the Grabby home menu when no command is supplied',
          action: 'toggle:features.menuMode',
        },
        {
          label: `Startup Art: ${config.features.startupArt ? 'ON' : 'OFF'}`,
          description: 'Show GrabbyAI text art on startup',
          action: 'toggle:features.startupArt',
        },
        {
          label: `Ruleset Wizard: ${config.features.rulesetWizard ? 'ON' : 'OFF'}`,
          description: 'Enable wizard-driven ruleset setup flows',
          action: 'toggle:features.rulesetWizard',
        },
        {
          label: `Tracking Mode: ${config.contracts.trackingMode}`,
          description: 'Toggle between tracked and local-only contract storage',
          action: 'toggle-tracking',
        },
        {
          label: 'Environment Constraints',
          description: 'Configure split dev/deploy topology and offline restrictions',
          action: 'environment-constraints',
        },
        { label: 'Back', description: 'Return to the main menu', action: 'back' },
      ],
      onSelect: (item) => {
        process.stdout.write(CLEAR_SCREEN);
        if (item.action === 'back') {
          mainMenu();
          return;
        }
        if (item.action === 'environment-constraints') {
          environmentConstraintsMenu();
          return;
        }
        if (item.action === 'toggle-tracking') {
          const nextConfig = ensureRepoConfig();
          nextConfig.contracts.trackingMode = nextConfig.contracts.trackingMode === 'local-only' ? 'tracked' : 'local-only';
          saveRepoConfig(nextConfig);
          console.log(`Tracking Mode updated to ${nextConfig.contracts.trackingMode}`);
          waitForKey(settingsMenu);
          return;
        }
        const newValue = toggleSetting(item.action.replace('toggle:', ''));
        console.log(`Updated ${item.action.replace('toggle:', '')} -> ${newValue ? 'ON' : 'OFF'}`);
        waitForKey(settingsMenu);
      },
      onToggle: (item) => {
        if (item.action === 'toggle-tracking') {
          const nextConfig = ensureRepoConfig();
          nextConfig.contracts.trackingMode = nextConfig.contracts.trackingMode === 'local-only' ? 'tracked' : 'local-only';
          saveRepoConfig(nextConfig);
          item.label = `Tracking Mode: ${nextConfig.contracts.trackingMode}`;
          return true;
        }
        if (!String(item.action || '').startsWith('toggle:')) {
          return false;
        }
        const pathKey = item.action.replace('toggle:', '');
        const newValue = toggleSetting(pathKey);
        const prefix = String(item.label || '').split(':')[0];
        item.label = `${prefix}: ${newValue ? 'ON' : 'OFF'}`;
        return true;
      },
      onExit: mainMenu,
    });

    menu.start();
  }

  function pluginConstraintMenu(pluginKey) {
    const { plugins } = getPluginCatalog();
    const plugin = plugins.find((entry) => entry.key === pluginKey);
    if (!plugin) {
      console.log(`${YELLOW}Plugin not found: ${pluginKey}${RESET}`);
      waitForKey(environmentConstraintsMenu);
      return;
    }

    const constraints = plugin.constraints || {};
    const menu = createMenu({
      title: `Plugin Constraints: ${plugin.name}`,
      header: `${getHeader() || ''}\n${DIM}Capture repo-specific access limits for ${plugin.name}.${RESET}`,
      items: [
        {
          label: `Offline Only: ${constraints.offlineOnly === true ? 'ON' : 'OFF'}`,
          description: 'Plugin must work from local files only',
          action: 'toggle:offlineOnly',
        },
        {
          label: `No Remote Access: ${constraints.noRemoteAccess === true ? 'ON' : 'OFF'}`,
          description: 'Block remote API or registry calls for this plugin',
          action: 'toggle:noRemoteAccess',
        },
        {
          label: `No Cluster Access: ${constraints.noClusterAccess === true ? 'ON' : 'OFF'}`,
          description: 'Block cluster inspection or apply behavior from this environment',
          action: 'toggle:noClusterAccess',
        },
        {
          label: `Generate Artifacts Only: ${constraints.generateArtifactsOnly === true ? 'ON' : 'OFF'}`,
          description: 'Allow authoring output without remote execution',
          action: 'toggle:generateArtifactsOnly',
        },
        { label: 'Back', description: 'Return to Environment Constraints', action: 'back' },
      ],
      onSelect: (item) => {
        process.stdout.write(CLEAR_SCREEN);
        if (item.action === 'back') {
          environmentConstraintsMenu();
          return;
        }
        const constraintKey = item.action.replace('toggle:', '');
        const nextValue = !(constraints[constraintKey] === true);
        savePluginConstraint(plugin.key, constraintKey, nextValue);
        console.log(`${GREEN}Updated ${plugin.name} constraint ${constraintKey} -> ${nextValue ? 'ON' : 'OFF'}${RESET}`);
        waitForKey(() => pluginConstraintMenu(plugin.key));
      },
      onToggle: (item) => {
        if (!String(item.action || '').startsWith('toggle:')) {
          return false;
        }
        const constraintKey = item.action.replace('toggle:', '');
        const nextValue = !(constraints[constraintKey] === true);
        constraints[constraintKey] = nextValue;
        savePluginConstraint(plugin.key, constraintKey, nextValue);
        const prefix = String(item.label || '').split(':')[0];
        item.label = `${prefix}: ${nextValue ? 'ON' : 'OFF'}`;
        return true;
      },
      onExit: environmentConstraintsMenu,
    });

    menu.start();
  }

  function environmentConstraintsMenu() {
    const config = ensureRepoConfig();
    config.systemGovernance = config.systemGovernance || {};
    config.systemGovernance.constraints = config.systemGovernance.constraints || {};
    config.systemGovernance.topology = config.systemGovernance.topology || {};
    const systemConstraints = config.systemGovernance.constraints;
    const topology = config.systemGovernance.topology;
    const { plugins } = getPluginCatalog();

    const items = [
      {
        label: `Airgapped: ${systemConstraints.airgapped ? 'ON' : 'OFF'}`,
        description: 'Assume no external network reachability',
        action: 'toggle-system:airgapped',
      },
      {
        label: `No Network: ${systemConstraints.noNetwork ? 'ON' : 'OFF'}`,
        description: 'Forbid outbound network assumptions from this environment',
        action: 'toggle-system:noNetwork',
      },
      {
        label: `No DB In CI: ${systemConstraints.noDbInCi ? 'ON' : 'OFF'}`,
        description: 'Capture CI database-access restrictions',
        action: 'toggle-system:noDbInCi',
      },
      {
        label: `Separated Dev/Deploy: ${topology.separatedDeployHost === true ? 'ON' : 'OFF'}`,
        description: 'Development happens on one box and deployment on another',
        action: 'toggle-topology:separatedDeployHost',
      },
      {
        label: `Dev Host: ${topology.devHost || 'unset'}`,
        description: 'Name the current development environment',
        action: 'text:devHost',
      },
      {
        label: `Deploy Host: ${topology.deployHost || 'unset'}`,
        description: 'Name the target deployment environment',
        action: 'text:deployHost',
      },
      {
        label: `Cluster Access From Dev: ${topology.clusterAccessFromDev !== false ? 'ON' : 'OFF'}`,
        description: 'Whether this box can reach cluster APIs',
        action: 'toggle-topology:clusterAccessFromDev',
      },
      {
        label: `Helm Access From Dev: ${topology.helmAccessFromDev !== false ? 'ON' : 'OFF'}`,
        description: 'Whether this box can use live Helm access',
        action: 'toggle-topology:helmAccessFromDev',
      },
      {
        label: `Artifact Generation Only: ${topology.artifactGenerationOnly === true ? 'ON' : 'OFF'}`,
        description: 'Allow chart/manifests authoring without remote apply behavior',
        action: 'toggle-topology:artifactGenerationOnly',
      },
      ...plugins.map((plugin) => ({
        label: `Plugin Constraints: ${plugin.name}`,
        description: `Configure offline and remote-access limits for ${plugin.name}`,
        action: `plugin:${plugin.key}`,
      })),
      { label: 'Back', description: 'Return to Settings', action: 'back' },
    ];

    const menu = createMenu({
      title: 'Environment Constraints',
      header: `${getHeader() || ''}\n${DIM}Capture repo-local environment limits so Grabby plans and audits against the real topology.${RESET}`,
      items,
      onSelect: (item) => {
        process.stdout.write(CLEAR_SCREEN);
        if (item.action === 'back') {
          settingsMenu();
          return;
        }
        if (item.action.startsWith('plugin:')) {
          pluginConstraintMenu(item.action.replace('plugin:', ''));
          return;
        }
        if (item.action.startsWith('text:')) {
          const field = item.action.replace('text:', '');
          promptForText(field === 'devHost' ? 'Development host' : 'Deployment host', topology[field] || '', (answer) => {
            const nextConfig = ensureRepoConfig();
            nextConfig.systemGovernance.topology[field] = answer;
            saveRepoConfig(nextConfig);
            console.log(`${GREEN}Updated ${field} -> ${answer || 'unset'}${RESET}`);
            waitForKey(environmentConstraintsMenu);
          });
          return;
        }

        const [scope, key] = item.action.split(':');
        const nextConfig = ensureRepoConfig();
        if (scope === 'toggle-system') {
          nextConfig.systemGovernance.constraints[key] = !Boolean(nextConfig.systemGovernance.constraints[key]);
          saveRepoConfig(nextConfig);
          console.log(`${GREEN}Updated system constraint ${key} -> ${nextConfig.systemGovernance.constraints[key] ? 'ON' : 'OFF'}${RESET}`);
          waitForKey(environmentConstraintsMenu);
          return;
        }
        if (scope === 'toggle-topology') {
          nextConfig.systemGovernance.topology[key] = !Boolean(nextConfig.systemGovernance.topology[key]);
          saveRepoConfig(nextConfig);
          console.log(`${GREEN}Updated topology ${key} -> ${nextConfig.systemGovernance.topology[key] ? 'ON' : 'OFF'}${RESET}`);
          waitForKey(environmentConstraintsMenu);
        }
      },
      onToggle: (item) => {
        if (!String(item.action || '').startsWith('toggle-system:') && !String(item.action || '').startsWith('toggle-topology:')) {
          return false;
        }
        const [scope, key] = item.action.split(':');
        const nextConfig = ensureRepoConfig();
        let nextValue = false;
        if (scope === 'toggle-system') {
          nextConfig.systemGovernance.constraints[key] = !Boolean(nextConfig.systemGovernance.constraints[key]);
          nextValue = nextConfig.systemGovernance.constraints[key];
        } else if (scope === 'toggle-topology') {
          nextConfig.systemGovernance.topology[key] = !Boolean(nextConfig.systemGovernance.topology[key]);
          nextValue = nextConfig.systemGovernance.topology[key];
        } else {
          return false;
        }
        saveRepoConfig(nextConfig);
        const prefix = String(item.label || '').split(':')[0];
        item.label = `${prefix}: ${nextValue ? 'ON' : 'OFF'}`;
        return true;
      },
      onExit: settingsMenu,
    });

    menu.start();
  }

  function rulesetMenu() {
    const config = ensureRepoConfig();
    if (config.features.rulesetWizard === false) {
      console.log(`${YELLOW}Ruleset wizard is disabled in settings.${RESET}`);
      waitForKey(mainMenu);
      return;
    }

    const menu = createMenu({
      title: 'Ruleset Wizards',
      header: getHeader(),
      items: [
        { label: 'Import Existing Rules', description: 'Ingest standards from current files', action: 'import' },
        { label: 'Create Local Repo Ruleset', description: 'Build a repo-local ruleset under .grabby', action: 'local' },
        { label: 'Back', description: 'Return to the main menu', action: 'back' },
      ],
      onSelect: (item) => {
        process.stdout.write(CLEAR_SCREEN);
        if (item.action === 'back') {
          mainMenu();
          return;
        }
        const { runRulesetWizard } = require('./ruleset-builder.cjs');
        const mode = item.action === 'import' ? 'import-existing' : 'create-local';
        Promise.resolve(runRulesetWizard(cwd, { mode, logger: console }))
          .then(() => waitForKey(mainMenu))
          .catch((error) => {
            console.log(`${RED}Ruleset wizard failed: ${error.message}${RESET}`);
            waitForKey(mainMenu);
          });
      },
      onExit: mainMenu,
    });

    menu.start();
  }

  function handleAction(action) {
    process.stdout.write(CLEAR_SCREEN);
    if (!isSetupComplete() && !isSetupAction(action)) {
      console.log(`${YELLOW}Complete setup first. Use "Setup & Onboarding" from the main menu.${RESET}`);
      waitForKey(mainMenu);
      return;
    }
    switch (action) {
      case 'list':
        showContractList();
        break;
      case 'setup':
        setupWizardMenu();
        break;
      case 'create':
        showCreateGuidance();
        break;
      case 'validate':
        runValidateAll();
        break;
      case 'metrics':
        runMetrics();
        break;
      case 'watch':
        console.log(`${CYAN}Starting watch mode...${RESET}`);
        console.log(`${DIM}Press Ctrl+C to stop${RESET}\n`);
        require('./watcher.cjs').runWatchMode(contractsDir);
        break;
      case 'cicd':
        runCICDSetup();
        break;
      case 'plugins':
        showPlugins();
        break;
      case 'settings':
        settingsMenu();
        break;
      case 'rulesets':
        rulesetMenu();
        break;
      case 'exit':
        console.log('\nGoodbye!');
        exitApp(0);
        break;
      default:
        mainMenu();
    }
  }

  return { start: mainMenu, getStartupArt };
}

module.exports = {
  createMenu,
  createTUI,
  drawBox,
  getStartupArt,
  ansi: { CLEAR_SCREEN, HIDE_CURSOR, SHOW_CURSOR, BOLD, DIM, RESET, CYAN, GREEN, YELLOW, RED, MAGENTA },
};
