const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);

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
        if (/\.(ya?ml|json)$/i.test(entry.name)) {
          files.push(fullPath);
        }
      });
    }
  });

  return files.sort();
}

function parseDocuments(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return yaml.parseAllDocuments(content)
    .map((doc) => doc.toJSON())
    .filter((doc) => doc && typeof doc === 'object' && doc.kind && doc.metadata?.name);
}

function isArgoResource(resource) {
  return ['Application', 'AppProject', 'ApplicationSet'].includes(resource.kind)
    && String(resource.apiVersion || '').startsWith('argoproj.io/');
}

function discoverArgoCdResources(baseDir, options = {}) {
  const roots = Array.isArray(options.roots) ? options.roots : [];
  const resources = [];

  walk(baseDir, roots).forEach((filePath) => {
    try {
      parseDocuments(filePath)
        .filter(isArgoResource)
        .forEach((resource) => {
          resources.push({
            kind: resource.kind,
            name: resource.metadata.name,
            namespace: resource.metadata.namespace || 'argocd',
            file: normalizeRepoPath(baseDir, filePath),
            raw: resource,
          });
        });
    } catch {
      // Ignore non-Argo or malformed yaml/json files.
    }
  });

  return resources;
}

function summarizeSource(source = {}) {
  if (!source || typeof source !== 'object') {
    return {};
  }
  return {
    repoURL: source.repoURL || null,
    path: source.path || null,
    chart: source.chart || null,
    targetRevision: source.targetRevision || null,
  };
}

function summarizeDestination(destination = {}) {
  if (!destination || typeof destination !== 'object') {
    return {};
  }
  return {
    server: destination.server || null,
    namespace: destination.namespace || null,
    name: destination.name || null,
  };
}

function summarizeApplication(resource) {
  const spec = resource.raw.spec || {};
  const syncPolicy = spec.syncPolicy || {};
  return {
    name: resource.name,
    namespace: resource.namespace,
    file: resource.file,
    project: spec.project || 'default',
    source: summarizeSource(spec.source),
    sources: Array.isArray(spec.sources) ? spec.sources.map((source) => summarizeSource(source)) : [],
    destination: summarizeDestination(spec.destination),
    syncPolicy: {
      automated: Boolean(syncPolicy.automated),
      prune: Boolean(syncPolicy.automated?.prune),
      selfHeal: Boolean(syncPolicy.automated?.selfHeal),
      syncOptions: Array.isArray(syncPolicy.syncOptions) ? syncPolicy.syncOptions.slice().sort() : [],
    },
  };
}

function summarizeAppProject(resource) {
  const spec = resource.raw.spec || {};
  return {
    name: resource.name,
    namespace: resource.namespace,
    file: resource.file,
    sourceRepos: Array.isArray(spec.sourceRepos) ? spec.sourceRepos.slice().sort() : [],
    destinations: Array.isArray(spec.destinations)
      ? spec.destinations.map((destination) => summarizeDestination(destination))
      : [],
    namespaceResourceWhitelist: Array.isArray(spec.namespaceResourceWhitelist)
      ? spec.namespaceResourceWhitelist.map((entry) => `${entry.group || 'core'}/${entry.kind}`).sort()
      : [],
  };
}

function summarizeApplicationSet(resource) {
  const spec = resource.raw.spec || {};
  return {
    name: resource.name,
    namespace: resource.namespace,
    file: resource.file,
    generators: Array.isArray(spec.generators) ? spec.generators.map((generator) => Object.keys(generator || {}).sort()) : [],
    templateProject: spec.template?.spec?.project || 'default',
    templateDestination: summarizeDestination(spec.template?.spec?.destination),
  };
}

function buildArgoCdPluginContext(baseDir, options = {}) {
  const resources = discoverArgoCdResources(baseDir, options);
  const applications = resources.filter((resource) => resource.kind === 'Application').map(summarizeApplication);
  const projects = resources.filter((resource) => resource.kind === 'AppProject').map(summarizeAppProject);
  const applicationSets = resources.filter((resource) => resource.kind === 'ApplicationSet').map(summarizeApplicationSet);

  const appNames = new Set(applications.map((application) => application.name));
  const appOfApps = applications
    .filter((application) => appNames.has(application.source?.path || ''))
    .map((application) => application.name);

  return {
    plugin: 'argocd',
    generatedAt: new Date().toISOString(),
    applications,
    projects,
    applicationSets,
    summary: {
      applicationCount: applications.length,
      projectCount: projects.length,
      applicationSetCount: applicationSets.length,
      automatedSyncCount: applications.filter((application) => application.syncPolicy.automated).length,
      appOfAppsCandidates: appOfApps.sort(),
    },
  };
}

module.exports = {
  discoverArgoCdResources,
  buildArgoCdPluginContext,
};
