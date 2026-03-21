/**
 * Canonical source for project-owned URLs and identifiers
 * @module project-metadata
 */

const path = require('path');
const fs = require('fs');

/**
 * Read package.json to get definitive values
 */
function loadPackageMetadata(cwd = process.cwd()) {
  const packagePath = path.join(cwd, 'package.json');
  if (!fs.existsSync(packagePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  } catch (error) {
    return null;
  }
}

/**
 * Get project metadata with fallbacks
 * @param {string} [cwd] - Current working directory
 * @returns {Object} Project metadata
 */
function getProjectMetadata(cwd = process.cwd()) {
  const pkg = loadPackageMetadata(cwd);

  return {
    // Package identity
    name: pkg?.name || 'grabby',
    version: pkg?.version || '0.0.0',
    description: pkg?.description || 'AI-assisted development tool',

    // Repository
    repository: {
      type: pkg?.repository?.type || 'git',
      url: pkg?.repository?.url || 'https://github.com/Raccoon-King/ai-feature-contracts.git',
      shorthand: pkg?.repository?.url?.match(/github\.com\/([^\/]+\/[^\/\.]+)/)?.[1] || 'Raccoon-King/ai-feature-contracts'
    },

    // Web presence
    homepage: pkg?.homepage || 'https://grabbyai-com.pages.dev',
    website: 'https://grabbyai.com',
    npmUrl: `https://www.npmjs.com/package/${pkg?.name || 'grabby'}`,

    // Issue tracking
    bugs: {
      url: pkg?.bugs?.url || 'https://github.com/Raccoon-King/ai-feature-contracts/issues'
    },

    // Documentation
    docs: {
      readme: `https://github.com/Raccoon-King/ai-feature-contracts#readme`,
      wiki: `https://github.com/Raccoon-King/ai-feature-contracts/wiki`,
      schemas: {
        config: 'https://grabby.dev/schemas/config.json'
      }
    },

    // Runtime defaults
    defaults: {
      api: {
        host: '127.0.0.1',
        portRange: [3456, 3466],
        corsOrigins: /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/
      },
      ollama: {
        host: 'http://localhost:11434'
      }
    }
  };
}

/**
 * Get specific metadata value by path
 * @param {string} keyPath - Dot-separated path (e.g., 'repository.url')
 * @param {string} [cwd] - Current working directory
 * @returns {*} Value at keyPath or undefined
 */
function getMetadataValue(keyPath, cwd = process.cwd()) {
  const metadata = getProjectMetadata(cwd);
  const keys = keyPath.split('.');

  let value = metadata;
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      return undefined;
    }
  }

  return value;
}

module.exports = {
  getProjectMetadata,
  getMetadataValue,
  loadPackageMetadata
};
