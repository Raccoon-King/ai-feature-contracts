/**
 * File watcher for Grabby watch mode
 * Auto-validates contracts on file changes
 */

const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');
const { validateContract } = require('./core.cjs');
const { createSpinner, colors, symbols } = require('./progress.cjs');
const { isIgnoredByGrabby } = require('./ignore.cjs');

/**
 * Create a contract file watcher
 */
function createWatcher(contractsDir, options = {}) {
  const {
    onValidate = () => {},
    onError = () => {},
    onChange = () => {},
    logger = console,
    debounceMs = 300,
    ignored = [],
  } = options;

  const cwd = path.dirname(contractsDir);
  let watcher = null;
  let debounceTimers = new Map();
  let isRunning = false;

  const validateFile = (filePath) => {
    try {
      if (isIgnoredByGrabby(cwd, filePath)) {
        return { skipped: true, reason: 'ignored' };
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const result = validateContract(content);
      const fileName = path.basename(filePath);

      onValidate({ filePath, fileName, result });

      return { valid: result.valid, errors: result.errors, warnings: result.warnings };
    } catch (error) {
      onError({ filePath, error });
      return { valid: false, error: error.message };
    }
  };

  const handleChange = (filePath) => {
    // Clear existing debounce timer for this file
    if (debounceTimers.has(filePath)) {
      clearTimeout(debounceTimers.get(filePath));
    }

    // Set new debounce timer
    debounceTimers.set(filePath, setTimeout(() => {
      debounceTimers.delete(filePath);
      onChange({ filePath, type: 'change' });
      validateFile(filePath);
    }, debounceMs));
  };

  return {
    start: () => {
      if (isRunning) return;

      const watchPath = path.join(contractsDir, '*.fc.md');

      watcher = chokidar.watch(watchPath, {
        persistent: true,
        ignoreInitial: false,
        awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
        ignored: [...ignored, /(^|[\/\\])\../],
      });

      watcher
        .on('add', (filePath) => {
          logger.log(`${colors.green}+${colors.reset} Watching: ${path.basename(filePath)}`);
          validateFile(filePath);
        })
        .on('change', handleChange)
        .on('unlink', (filePath) => {
          logger.log(`${colors.red}-${colors.reset} Removed: ${path.basename(filePath)}`);
        })
        .on('error', (error) => {
          onError({ error });
        });

      isRunning = true;
      logger.log(`\n${colors.cyan}${symbols.info}${colors.reset} Watching contracts in: ${contractsDir}`);
      logger.log(`${colors.dim}Press Ctrl+C to stop${colors.reset}\n`);
    },

    stop: async () => {
      if (!isRunning) return;

      // Clear all debounce timers
      for (const timer of debounceTimers.values()) {
        clearTimeout(timer);
      }
      debounceTimers.clear();

      if (watcher) {
        await watcher.close();
        watcher = null;
      }

      isRunning = false;
    },

    isRunning: () => isRunning,

    validateAll: () => {
      if (!fs.existsSync(contractsDir)) return [];

      const files = fs.readdirSync(contractsDir).filter(f => f.endsWith('.fc.md'));
      return files.map(file => {
        const filePath = path.join(contractsDir, file);
        return { file, ...validateFile(filePath) };
      });
    },
  };
}

/**
 * Run watch mode with formatted output
 */
function runWatchMode(contractsDir, options = {}) {
  const { logger = console } = options;

  const formatResult = (fileName, result) => {
    if (result.valid) {
      const warn = result.warnings?.length ? ` (${result.warnings.length} warnings)` : '';
      logger.log(`${colors.green}${symbols.success}${colors.reset} ${fileName}${colors.yellow}${warn}${colors.reset}`);
    } else {
      logger.log(`${colors.red}${symbols.error}${colors.reset} ${fileName}`);
      result.errors?.forEach(e => logger.log(`  ${colors.red}-${colors.reset} ${e}`));
    }
  };

  const watcher = createWatcher(contractsDir, {
    ...options,
    onValidate: ({ fileName, result }) => formatResult(fileName, result),
    onError: ({ filePath, error }) => {
      logger.log(`${colors.red}${symbols.error}${colors.reset} Error: ${error.message}`);
    },
  });

  // Handle graceful shutdown
  const shutdown = async () => {
    logger.log(`\n${colors.dim}Stopping watcher...${colors.reset}`);
    await watcher.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  watcher.start();
  return watcher;
}

module.exports = { createWatcher, runWatchMode };
