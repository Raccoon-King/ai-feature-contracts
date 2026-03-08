/**
 * Shared Test Fixtures and Utilities
 * Consolidates common test helpers to reduce duplication across test files.
 * @module tests/fixtures
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Create a mock logger that captures output.
 * @returns {{ lines: string[], log: Function }} Logger with captured lines
 */
function createLogger() {
  const lines = [];
  return {
    lines,
    log: (...values) => lines.push(values.join(' ')),
    warn: (...values) => lines.push(`[WARN] ${values.join(' ')}`),
    error: (...values) => lines.push(`[ERROR] ${values.join(' ')}`),
    clear: () => { lines.length = 0; },
    contains: (text) => lines.some(line => line.includes(text)),
    output: () => lines.join('\n'),
  };
}

/**
 * Create a temporary directory for testing.
 * @param {string} [prefix='test-'] - Directory prefix
 * @returns {string} Path to temp directory
 */
function createTempDir(prefix = 'test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Clean up a temporary directory.
 * @param {string} dirPath - Directory to remove
 */
function cleanupTempDir(dirPath) {
  if (dirPath && fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

/**
 * Create test directory structure with .grabby directory.
 * @param {string} baseDir - Base directory
 * @returns {object} Paths object
 */
function createTestStructure(baseDir) {
  const paths = {
    base: baseDir,
    contracts: path.join(baseDir, 'contracts'),
    grabby: path.join(baseDir, '.grabby'),
    history: path.join(baseDir, '.grabby', 'history'),
    docs: path.join(baseDir, 'docs'),
    lib: path.join(baseDir, 'lib'),
    tests: path.join(baseDir, 'tests'),
  };

  Object.values(paths).forEach(p => {
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
    }
  });

  return paths;
}

/**
 * Create a test context object similar to commands.cjs context.
 * @param {string} cwd - Working directory
 * @param {object} [overrides] - Override defaults
 * @returns {object} Test context
 */
function createTestContext(cwd, overrides = {}) {
  return {
    cwd,
    pkgRoot: path.join(__dirname, '..', '..'),
    templatesDir: path.join(__dirname, '..', '..', 'templates'),
    docsDir: path.join(__dirname, '..', '..', 'docs'),
    contractsDir: path.join(cwd, 'contracts'),
    grabbyDir: path.join(cwd, '.grabby'),
    trackingMode: 'tracked',
    ...overrides,
  };
}

module.exports = {
  createLogger,
  createTempDir,
  cleanupTempDir,
  createTestStructure,
  createTestContext,
};
