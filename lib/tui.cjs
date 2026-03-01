/**
 * Terminal UI for Grabby
 * Lightweight interactive menu system
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');

// ANSI escape codes
const ESC = '\x1b';
const CLEAR_SCREEN = `${ESC}[2J${ESC}[H`;
const CLEAR_LINE = `${ESC}[2K`;
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

/**
 * Box drawing characters
 */
const BOX = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '─',
  vertical: '│',
  teeRight: '├',
  teeLeft: '┤',
};

/**
 * Draw a box around text
 */
function drawBox(title, content, width = 60) {
  const lines = [];
  const innerWidth = width - 2;

  // Top border with title
  const titlePadded = title ? ` ${title} ` : '';
  const topBorder = BOX.topLeft +
    BOX.horizontal.repeat(2) +
    titlePadded +
    BOX.horizontal.repeat(innerWidth - titlePadded.length - 2) +
    BOX.topRight;
  lines.push(topBorder);

  // Content lines
  const contentLines = content.split('\n');
  for (const line of contentLines) {
    const stripped = line.replace(/\x1b\[[0-9;]*m/g, '');
    const padding = ' '.repeat(Math.max(0, innerWidth - stripped.length));
    lines.push(`${BOX.vertical}${line}${padding}${BOX.vertical}`);
  }

  // Bottom border
  lines.push(BOX.bottomLeft + BOX.horizontal.repeat(innerWidth) + BOX.bottomRight);

  return lines.join('\n');
}

/**
 * Create an interactive menu
 */
function createMenu(options = {}) {
  const {
    title = 'Menu',
    items = [],
    onSelect = () => {},
    onExit = () => {},
  } = options;

  let selectedIndex = 0;
  let rl = null;

  const render = () => {
    process.stdout.write(CLEAR_SCREEN);

    // Header
    console.log(`${CYAN}${BOLD}╔${'═'.repeat(58)}╗${RESET}`);
    console.log(`${CYAN}${BOLD}║${RESET}  ${MAGENTA}${BOLD}GRABBY${RESET} - ${title.padEnd(46)}${CYAN}${BOLD}║${RESET}`);
    console.log(`${CYAN}${BOLD}╚${'═'.repeat(58)}╝${RESET}`);
    console.log('');

    // Menu items
    items.forEach((item, index) => {
      const isSelected = index === selectedIndex;
      const prefix = isSelected ? `${GREEN}▶${RESET}` : ' ';
      const style = isSelected ? BOLD : '';
      const label = item.label || item;
      const desc = item.description ? `${DIM} - ${item.description}${RESET}` : '';

      console.log(`  ${prefix} ${style}${label}${RESET}${desc}`);
    });

    console.log('');
    console.log(`${DIM}  ↑/↓ Navigate  │  Enter Select  │  q Quit${RESET}`);
  };

  const handleKey = (key) => {
    if (key === '\u001B[A') { // Up arrow
      selectedIndex = Math.max(0, selectedIndex - 1);
      render();
    } else if (key === '\u001B[B') { // Down arrow
      selectedIndex = Math.min(items.length - 1, selectedIndex + 1);
      render();
    } else if (key === '\r' || key === '\n') { // Enter
      cleanup();
      const selected = items[selectedIndex];
      onSelect(selected, selectedIndex);
    } else if (key === 'q' || key === '\u0003') { // q or Ctrl+C
      cleanup();
      onExit();
    }
  };

  const cleanup = () => {
    if (rl) {
      rl.close();
      process.stdin.setRawMode(false);
    }
    process.stdout.write(SHOW_CURSOR);
  };

  const start = () => {
    process.stdout.write(HIDE_CURSOR);

    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    process.stdin.setRawMode(true);
    process.stdin.resume();

    process.stdin.on('data', (data) => {
      handleKey(data.toString());
    });

    render();
  };

  return { start, cleanup, render };
}

/**
 * Create the main TUI application
 */
function createTUI(context) {
  const { contractsDir, grabbyDir } = context;

  const mainMenu = () => {
    const menu = createMenu({
      title: 'Main Menu',
      items: [
        { label: 'List Contracts', description: 'View all contracts', action: 'list' },
        { label: 'Create Contract', description: 'Start a new contract', action: 'create' },
        { label: 'Validate All', description: 'Check all contracts', action: 'validate' },
        { label: 'View Metrics', description: 'Contract statistics', action: 'metrics' },
        { label: 'Watch Mode', description: 'Auto-validate on changes', action: 'watch' },
        { label: 'CI/CD Setup', description: 'Configure automation', action: 'cicd' },
        { label: 'Plugins', description: 'Manage plugins', action: 'plugins' },
        { label: 'Exit', description: 'Quit Grabby TUI', action: 'exit' },
      ],
      onSelect: (item) => {
        handleAction(item.action);
      },
      onExit: () => {
        console.log('\nGoodbye!');
        process.exit(0);
      },
    });

    menu.start();
  };

  const handleAction = (action) => {
    process.stdout.write(CLEAR_SCREEN);

    switch (action) {
      case 'list':
        showContractList();
        break;
      case 'create':
        console.log(`${CYAN}Creating contract...${RESET}`);
        console.log(`${DIM}Run: grabby task "your feature"${RESET}`);
        waitForKey(mainMenu);
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
      case 'exit':
        console.log('\nGoodbye!');
        process.exit(0);
        break;
      default:
        mainMenu();
    }
  };

  const showContractList = () => {
    console.log(`${CYAN}${BOLD}Contracts${RESET}\n`);

    if (!fs.existsSync(contractsDir)) {
      console.log(`${DIM}No contracts directory found.${RESET}`);
      waitForKey(mainMenu);
      return;
    }

    const files = fs.readdirSync(contractsDir).filter(f => f.endsWith('.fc.md'));

    if (files.length === 0) {
      console.log(`${DIM}No contracts found.${RESET}`);
    } else {
      files.forEach(file => {
        const content = fs.readFileSync(path.join(contractsDir, file), 'utf8');
        const status = content.match(/\*\*Status:\*\*\s*(\w+)/)?.[1] || '?';
        const statusColor = { draft: YELLOW, approved: GREEN, complete: CYAN }[status] || DIM;
        console.log(`  ${statusColor}●${RESET} ${file} [${status}]`);
      });
    }

    console.log('');
    waitForKey(mainMenu);
  };

  const runValidateAll = () => {
    console.log(`${CYAN}${BOLD}Validating Contracts${RESET}\n`);

    const { validateContract } = require('./core.cjs');

    if (!fs.existsSync(contractsDir)) {
      console.log(`${RED}No contracts directory.${RESET}`);
      waitForKey(mainMenu);
      return;
    }

    const files = fs.readdirSync(contractsDir).filter(f => f.endsWith('.fc.md'));
    let passed = 0, failed = 0;

    files.forEach(file => {
      const content = fs.readFileSync(path.join(contractsDir, file), 'utf8');
      const result = validateContract(content);

      if (result.valid) {
        console.log(`  ${GREEN}✓${RESET} ${file}`);
        passed++;
      } else {
        console.log(`  ${RED}✗${RESET} ${file} (${result.errors.length} errors)`);
        failed++;
      }
    });

    console.log(`\n${passed} passed, ${failed} failed`);
    waitForKey(mainMenu);
  };

  const runMetrics = () => {
    const { collectMetrics, generateReport } = require('./metrics.cjs');
    const metrics = collectMetrics(contractsDir);
    const report = generateReport(metrics, { summaryOnly: true });
    console.log(report);
    waitForKey(mainMenu);
  };

  const runCICDSetup = () => {
    const { checkCICDSetup, formatSetupReport } = require('./cicd.cjs');
    const status = checkCICDSetup(path.dirname(contractsDir));
    console.log(formatSetupReport(status));
    waitForKey(mainMenu);
  };

  const showPlugins = () => {
    const { createPluginRegistry } = require('./plugins.cjs');
    const registry = createPluginRegistry(grabbyDir);
    registry.loadAll();
    const plugins = registry.list();

    console.log(`${CYAN}${BOLD}Installed Plugins${RESET}\n`);

    if (plugins.length === 0) {
      console.log(`${DIM}No plugins installed.${RESET}`);
    } else {
      plugins.forEach(p => {
        console.log(`  ${GREEN}●${RESET} ${BOLD}${p.name}${RESET} v${p.version}`);
        console.log(`    ${DIM}${p.description}${RESET}`);
      });
    }

    console.log('');
    waitForKey(mainMenu);
  };

  const waitForKey = (callback) => {
    console.log(`${DIM}Press any key to continue...${RESET}`);

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once('data', () => {
      process.stdin.setRawMode(false);
      callback();
    });
  };

  return { start: mainMenu };
}

module.exports = {
  createMenu,
  createTUI,
  drawBox,
  // Export ANSI codes for reuse
  ansi: { CLEAR_SCREEN, HIDE_CURSOR, SHOW_CURSOR, BOLD, DIM, RESET, CYAN, GREEN, YELLOW, RED, MAGENTA },
};
