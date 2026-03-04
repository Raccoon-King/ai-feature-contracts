const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);
const IMAGE_PATTERN = /([a-z0-9.-]+(?::\d+)?\/[a-z0-9._-]+(?:\/[a-z0-9._-]+)*)(?::([A-Za-z0-9._-]+))?(?:@sha256:[a-f0-9]{64})?/gi;

function normalizeRepoPath(baseDir, targetPath) {
  return path.relative(baseDir, targetPath).replace(/\\/g, '/');
}

function walk(baseDir, roots = []) {
  const startDirs = roots.length > 0
    ? roots.map((root) => path.join(baseDir, root)).filter((fullPath) => fs.existsSync(fullPath))
    : [baseDir];
  const files = [];

  startDirs.forEach((startDir) => {
    const stack = [startDir];
    while (stack.length > 0) {
      const current = stack.pop();
      const entries = fs.readdirSync(current, { withFileTypes: true });
      entries.forEach((entry) => {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (!IGNORED_DIRS.has(entry.name)) stack.push(fullPath);
          return;
        }
        files.push(fullPath);
      });
    }
  });

  return files.sort();
}

function readHarborConfig(filePath) {
  if (/\.ya?ml$/i.test(filePath)) {
    return yaml.parse(fs.readFileSync(filePath, 'utf8')) || {};
  }
  if (/\.json$/i.test(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return {};
}

function discoverHarborConfig(baseDir, options = {}) {
  const roots = Array.isArray(options.roots) ? options.roots : [];
  return walk(baseDir, roots)
    .filter((filePath) => ['harbor.yml', 'harbor.yaml', 'harbor.json'].includes(path.basename(filePath).toLowerCase()))
    .map((filePath) => {
      const parsed = readHarborConfig(filePath);
      return {
        path: normalizeRepoPath(baseDir, filePath),
        hostname: parsed.hostname || parsed.host || null,
        project: parsed.project || parsed.registry?.project || null,
        replicationEndpoints: Array.isArray(parsed.replication?.endpoints) ? parsed.replication.endpoints.length : 0,
        robotAccountsConfigured: Array.isArray(parsed.robotAccounts) ? parsed.robotAccounts.length : 0,
      };
    });
}

function extractImageReferencesFromText(content) {
  const matches = [];
  let match;
  while ((match = IMAGE_PATTERN.exec(content)) !== null) {
    const registryPath = match[1];
    const [registry, ...repoParts] = registryPath.split('/');
    if (!registry.includes('.')) continue;
    matches.push({
      registry,
      repository: repoParts.join('/'),
      tag: match[2] || null,
    });
  }
  return matches;
}

function discoverHarborImageReferences(baseDir, options = {}) {
  const roots = Array.isArray(options.roots) ? options.roots : [];
  const references = [];

  walk(baseDir, roots)
    .filter((filePath) => /\.(ya?ml|json|tpl|txt|md|env)$/i.test(filePath) || ['Dockerfile', '.env'].includes(path.basename(filePath)))
    .forEach((filePath) => {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        extractImageReferencesFromText(content)
          .filter((entry) => /harbor/i.test(entry.registry))
          .forEach((entry) => {
            references.push({
              ...entry,
              file: normalizeRepoPath(baseDir, filePath),
            });
          });
      } catch {
        // Ignore unreadable files.
      }
    });

  return references;
}

function buildHarborPluginContext(baseDir, options = {}) {
  const configs = discoverHarborConfig(baseDir, options);
  const imageReferences = discoverHarborImageReferences(baseDir, options);
  const projects = [...new Set(imageReferences.map((entry) => entry.repository.split('/')[0]).filter(Boolean))].sort();
  return {
    plugin: 'harbor',
    generatedAt: new Date().toISOString(),
    configs,
    imageReferences,
    summary: {
      configCount: configs.length,
      imageReferenceCount: imageReferences.length,
      projects,
      registries: [...new Set(imageReferences.map((entry) => entry.registry))].sort(),
    },
  };
}

module.exports = {
  discoverHarborConfig,
  discoverHarborImageReferences,
  buildHarborPluginContext,
};
