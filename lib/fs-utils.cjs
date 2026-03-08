/**
 * Filesystem Utilities
 * Consolidated I/O helpers to eliminate repeated patterns across the codebase.
 * @module fs-utils
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

/**
 * Ensure a directory exists, creating it recursively if needed.
 * @param {string} dirPath - Directory path to ensure exists
 * @returns {void}
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Ensure parent directory of a file exists.
 * @param {string} filePath - File path whose parent should exist
 * @returns {void}
 */
function ensureParentDir(filePath) {
  ensureDir(path.dirname(filePath));
}

/**
 * Read JSON file with fallback to default value on error.
 * @param {string} filePath - Path to JSON file
 * @param {*} [defaultValue=null] - Value to return if file doesn't exist or is invalid
 * @returns {*} Parsed JSON or default value
 */
function readJsonSafe(filePath, defaultValue = null) {
  try {
    if (!fs.existsSync(filePath)) {
      return defaultValue;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return defaultValue;
  }
}

/**
 * Read YAML file with fallback to default value on error.
 * @param {string} filePath - Path to YAML file
 * @param {*} [defaultValue=null] - Value to return if file doesn't exist or is invalid
 * @returns {*} Parsed YAML or default value
 */
function readYamlSafe(filePath, defaultValue = null) {
  try {
    if (!fs.existsSync(filePath)) {
      return defaultValue;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return yaml.parse(content);
  } catch {
    return defaultValue;
  }
}

/**
 * Read text file with fallback to default value on error.
 * @param {string} filePath - Path to text file
 * @param {string} [defaultValue=''] - Value to return if file doesn't exist
 * @returns {string} File content or default value
 */
function readTextSafe(filePath, defaultValue = '') {
  try {
    if (!fs.existsSync(filePath)) {
      return defaultValue;
    }
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return defaultValue;
  }
}

/**
 * Write JSON file atomically (write to temp, then rename).
 * Ensures parent directory exists.
 * @param {string} filePath - Path to write JSON file
 * @param {*} data - Data to serialize as JSON
 * @param {object} [options] - Options
 * @param {number} [options.indent=2] - JSON indentation spaces
 * @returns {void}
 */
function writeJsonAtomic(filePath, data, options = {}) {
  const { indent = 2 } = options;
  ensureParentDir(filePath);
  const content = JSON.stringify(data, null, indent) + '\n';
  const tmpPath = `${filePath}.tmp.${process.pid}`;
  try {
    fs.writeFileSync(tmpPath, content, 'utf8');
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    // Clean up temp file on failure
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // Ignore cleanup errors
    }
    throw err;
  }
}

/**
 * Write YAML file atomically (write to temp, then rename).
 * Ensures parent directory exists.
 * @param {string} filePath - Path to write YAML file
 * @param {*} data - Data to serialize as YAML
 * @returns {void}
 */
function writeYamlAtomic(filePath, data) {
  ensureParentDir(filePath);
  const content = yaml.stringify(data);
  const tmpPath = `${filePath}.tmp.${process.pid}`;
  try {
    fs.writeFileSync(tmpPath, content, 'utf8');
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // Ignore cleanup errors
    }
    throw err;
  }
}

/**
 * Write text file, ensuring parent directory exists.
 * @param {string} filePath - Path to write text file
 * @param {string} content - Content to write
 * @returns {void}
 */
function writeTextSafe(filePath, content) {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * Check if a path exists.
 * @param {string} filePath - Path to check
 * @returns {boolean} True if path exists
 */
function exists(filePath) {
  return fs.existsSync(filePath);
}

/**
 * Check if a path is a directory.
 * @param {string} filePath - Path to check
 * @returns {boolean} True if path is a directory
 */
function isDirectory(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if a path is a file.
 * @param {string} filePath - Path to check
 * @returns {boolean} True if path is a file
 */
function isFile(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * List files in a directory, optionally filtered by extension.
 * @param {string} dirPath - Directory to list
 * @param {string} [ext] - Optional extension filter (e.g., '.json')
 * @returns {string[]} Array of filenames (not full paths)
 */
function listFiles(dirPath, ext) {
  try {
    if (!fs.existsSync(dirPath)) {
      return [];
    }
    const files = fs.readdirSync(dirPath);
    if (ext) {
      return files.filter(f => f.endsWith(ext));
    }
    return files;
  } catch {
    return [];
  }
}

/**
 * Remove a file if it exists.
 * @param {string} filePath - Path to remove
 * @returns {boolean} True if file was removed
 */
function removeFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Remove a directory recursively if it exists.
 * @param {string} dirPath - Directory to remove
 * @returns {boolean} True if directory was removed
 */
function removeDir(dirPath) {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

module.exports = {
  ensureDir,
  ensureParentDir,
  readJsonSafe,
  readYamlSafe,
  readTextSafe,
  writeJsonAtomic,
  writeYamlAtomic,
  writeTextSafe,
  exists,
  isDirectory,
  isFile,
  listFiles,
  removeFile,
  removeDir,
};
