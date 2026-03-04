const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);
const TEXT_FILE_PATTERN = /\.(?:ya?ml|json|properties|conf|gradle|kts|xml|txt|md|env|npmrc)$/i;
const URL_PATTERN = /https?:\/\/[^\s"'`<>]+/gi;
const SENSITIVE_KEY_PATTERN = /(token|password|apikey|api_key|accesskey|secret)/i;

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
          if (!IGNORED_DIRS.has(entry.name)) {
            stack.push(fullPath);
          }
          return;
        }
        files.push(fullPath);
      });
    }
  });

  return files.sort();
}

function parseMaybeStructuredFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (/\.json$/i.test(filePath)) {
    return JSON.parse(content);
  }
  if (/\.(ya?ml)$/i.test(filePath)) {
    return yaml.parse(content) || {};
  }
  return content;
}

function redactValue(key, value) {
  if (!SENSITIVE_KEY_PATTERN.test(String(key || ''))) {
    return value;
  }
  if (value == null || value === '') {
    return value;
  }
  return '[redacted]';
}

function redactObject(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => redactObject(entry));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, entryValue]) => {
    if (entryValue && typeof entryValue === 'object') {
      return [key, redactObject(entryValue)];
    }
    return [key, redactValue(key, entryValue)];
  }));
}

function isArtifactoryConfigFile(filePath) {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  const baseName = path.basename(normalized);
  return (
    baseName === 'jfrog.yaml'
    || baseName === 'jfrog.yml'
    || baseName === 'jfrog.json'
    || baseName === 'artifactory.config.json'
    || normalized.includes('/.jfrog/')
  );
}

function normalizeServerDefinition(serverId, value) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return {
    serverId: serverId || value.serverId || value.id || null,
    url: value.url || value.artifactoryUrl || value.platformUrl || null,
    repository: value.repository || value.repo || value.targetRepo || null,
    releaseRepository: value.releaseRepository || value.releaseRepo || null,
    snapshotRepository: value.snapshotRepository || value.snapshotRepo || null,
    project: value.project || value.projectKey || null,
  };
}

function collectServerDefinitions(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return [];
  }

  const results = [];
  const pushIfPresent = (serverId, value) => {
    const normalized = normalizeServerDefinition(serverId, value);
    if (normalized && (normalized.url || normalized.repository || normalized.releaseRepository || normalized.snapshotRepository)) {
      results.push(normalized);
    }
  };

  if (Array.isArray(parsed.servers)) {
    parsed.servers.forEach((entry) => pushIfPresent(entry?.serverId || entry?.id || null, entry));
  }
  if (parsed.artifactory && typeof parsed.artifactory === 'object') {
    pushIfPresent(parsed.artifactory.serverId || 'artifactory', parsed.artifactory);
  }
  if (parsed.platforms && typeof parsed.platforms === 'object') {
    Object.entries(parsed.platforms).forEach(([key, value]) => pushIfPresent(key, value));
  }
  if (parsed.servers && typeof parsed.servers === 'object' && !Array.isArray(parsed.servers)) {
    Object.entries(parsed.servers).forEach(([key, value]) => pushIfPresent(key, value));
  }

  return results;
}

function discoverArtifactoryConfig(baseDir, options = {}) {
  const roots = Array.isArray(options.roots) ? options.roots : [];
  return walk(baseDir, roots)
    .filter((filePath) => isArtifactoryConfigFile(filePath))
    .map((filePath) => {
      try {
        const parsed = parseMaybeStructuredFile(filePath);
        const redacted = typeof parsed === 'string' ? parsed : redactObject(parsed);
        const servers = collectServerDefinitions(parsed);
        return {
          path: normalizeRepoPath(baseDir, filePath),
          servers,
          redactedConfig: redacted,
        };
      } catch {
        return {
          path: normalizeRepoPath(baseDir, filePath),
          servers: [],
          redactedConfig: null,
          malformed: true,
        };
      }
    });
}

function detectPackageManager(filePath) {
  const baseName = path.basename(filePath).toLowerCase();
  if (baseName === 'package.json' || baseName === '.npmrc') return 'npm';
  if (baseName === 'pom.xml' || baseName === 'settings.xml') return 'maven';
  if (baseName === 'build.gradle' || baseName === 'build.gradle.kts' || baseName === 'gradle.properties') return 'gradle';
  if (baseName === 'pip.conf' || baseName === 'requirements.txt' || baseName === 'pyproject.toml') return 'python';
  if (baseName === 'nuget.config') return 'nuget';
  return 'generic';
}

function normalizeRepositoryUrl(url) {
  try {
    const parsed = new URL(url);
    return {
      url: parsed.origin + parsed.pathname.replace(/\/+$/, ''),
      host: parsed.host,
      path: parsed.pathname.replace(/\/+$/, ''),
    };
  } catch {
    return {
      url,
      host: null,
      path: null,
    };
  }
}

function discoverArtifactoryReferences(baseDir, options = {}) {
  const roots = Array.isArray(options.roots) ? options.roots : [];
  const references = [];

  walk(baseDir, roots)
    .filter((filePath) => TEXT_FILE_PATTERN.test(filePath) || ['package.json', '.npmrc', 'pom.xml', 'settings.xml', 'Dockerfile'].includes(path.basename(filePath)))
    .forEach((filePath) => {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const matches = content.match(URL_PATTERN) || [];
        matches
          .filter((url) => /artifactory|jfrog/i.test(url))
          .forEach((url) => {
            const normalized = normalizeRepositoryUrl(url);
            references.push({
              file: normalizeRepoPath(baseDir, filePath),
              packageManager: detectPackageManager(filePath),
              ...normalized,
            });
          });
      } catch {
        // Ignore unreadable files.
      }
    });

  return references;
}

function buildPromotionHints(configs = [], references = []) {
  const hints = [];
  configs.forEach((config) => {
    config.servers.forEach((server) => {
      if (server.repository && server.releaseRepository && server.repository !== server.releaseRepository) {
        hints.push({
          from: server.repository,
          to: server.releaseRepository,
          source: config.path,
        });
      }
      if (server.snapshotRepository && server.releaseRepository && server.snapshotRepository !== server.releaseRepository) {
        hints.push({
          from: server.snapshotRepository,
          to: server.releaseRepository,
          source: config.path,
        });
      }
    });
  });

  const referencedRepos = new Set(references
    .map((reference) => reference.path || '')
    .filter(Boolean)
    .map((repoPath) => repoPath.split('/').filter(Boolean).slice(-2).join('/')));

  return hints.filter((hint, index, all) => {
    const key = `${hint.from}->${hint.to}@${hint.source}`;
    return all.findIndex((entry) => `${entry.from}->${entry.to}@${entry.source}` === key) === index;
  }).sort((a, b) => `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`))
    .concat([...referencedRepos]
      .filter((repo) => repo)
      .sort()
      .map((repo) => ({ from: repo, to: null, source: 'reference' })));
}

function buildArtifactoryPluginContext(baseDir, options = {}) {
  const configs = discoverArtifactoryConfig(baseDir, options);
  const repositoryReferences = discoverArtifactoryReferences(baseDir, options);
  const promotionHints = buildPromotionHints(configs, repositoryReferences);

  return {
    plugin: 'artifactory',
    generatedAt: new Date().toISOString(),
    configs,
    repositoryReferences,
    promotionHints,
    summary: {
      configCount: configs.length,
      malformedConfigCount: configs.filter((entry) => entry.malformed).length,
      repositoryReferenceCount: repositoryReferences.length,
      packageManagers: [...new Set(repositoryReferences
        .map((entry) => entry.packageManager)
        .filter((value) => value !== 'generic'))].sort(),
      hosts: [...new Set(repositoryReferences.map((entry) => entry.host).filter(Boolean))].sort(),
      repositories: [...new Set(repositoryReferences
        .map((entry) => entry.path)
        .filter((value) => value && value !== '/artifactory'))].sort(),
      promotionHintCount: promotionHints.length,
    },
  };
}

module.exports = {
  discoverArtifactoryConfig,
  discoverArtifactoryReferences,
  buildArtifactoryPluginContext,
};
