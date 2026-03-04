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
        files.push(fullPath);
      });
    }
  });

  return files.sort();
}

function parseDocuments(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (/\.json$/i.test(filePath)) {
    const parsed = JSON.parse(content);
    return [parsed].filter(Boolean);
  }
  const documents = yaml.parseAllDocuments(content);
  if (documents.some((doc) => Array.isArray(doc.errors) && doc.errors.length > 0)) {
    throw new Error(`Malformed YAML in ${filePath}`);
  }
  return documents
    .map((doc) => doc.toJSON())
    .filter((doc) => doc && typeof doc === 'object');
}

function isLegacyRancherFile(filePath) {
  const baseName = path.basename(filePath).toLowerCase();
  return baseName === 'rancher-compose.yml' || baseName === 'rancher-compose.yaml';
}

function summarizeLegacyRancherFile(baseDir, filePath) {
  const parsed = yaml.parse(fs.readFileSync(filePath, 'utf8')) || {};
  const services = parsed.services && typeof parsed.services === 'object'
    ? Object.keys(parsed.services).sort()
    : [];
  return {
    file: normalizeRepoPath(baseDir, filePath),
    version: parsed.version || null,
    rancherVersion: 'v1',
    serviceCount: services.length,
    services,
    loadBalancerServiceCount: services.filter((name) => {
      const service = parsed.services?.[name] || {};
      return service.lb_config || service.load_balancer_config;
    }).length,
    healthCheckServiceCount: services.filter((name) => {
      const service = parsed.services?.[name] || {};
      return service.health_check || service.healthCheck;
    }).length,
  };
}

function isModernRancherResource(resource) {
  const apiVersion = String(resource.apiVersion || '');
  const kind = String(resource.kind || '');
  return (
    apiVersion.startsWith('management.cattle.io/')
    || apiVersion.startsWith('fleet.cattle.io/')
    || apiVersion.startsWith('provisioning.cattle.io/')
    || apiVersion.startsWith('catalog.cattle.io/')
    || ['Cluster', 'Project', 'GitRepo', 'Bundle', 'App', 'ClusterRepo'].includes(kind)
  );
}

function detectRancherVersion(resource) {
  const apiVersion = String(resource.apiVersion || '');
  if (apiVersion.startsWith('management.cattle.io/')) return 'v2-management';
  if (apiVersion.startsWith('fleet.cattle.io/')) return 'v2-fleet';
  if (apiVersion.startsWith('provisioning.cattle.io/')) return 'v2-provisioning';
  if (apiVersion.startsWith('catalog.cattle.io/')) return 'v2-catalog';
  return 'unknown';
}

function summarizeModernResource(baseDir, filePath, resource) {
  const namespace = resource.metadata?.namespace || 'default';
  const labels = resource.metadata?.labels || {};
  return {
    file: normalizeRepoPath(baseDir, filePath),
    apiVersion: resource.apiVersion || null,
    rancherVersion: detectRancherVersion(resource),
    kind: resource.kind || null,
    name: resource.metadata?.name || null,
    namespace,
    clusterName: resource.spec?.clusterName || resource.spec?.clusterRef?.name || labels['management.cattle.io/cluster-display-name'] || null,
    projectName: resource.spec?.projectName || resource.spec?.projectId || labels['field.cattle.io/projectId'] || null,
    targetNamespace: resource.spec?.targetNamespace || resource.spec?.namespace || null,
    repo: resource.spec?.repo || resource.spec?.gitRepo || resource.spec?.url || null,
    path: resource.spec?.paths || resource.spec?.path || null,
    bundleNamespace: resource.spec?.bundleNamespace || null,
    workloadCount: Array.isArray(resource.spec?.workloads) ? resource.spec.workloads.length : null,
  };
}

function discoverRancherAssets(baseDir, options = {}) {
  const roots = Array.isArray(options.roots) ? options.roots : [];
  const files = walk(baseDir, roots)
    .filter((filePath) => /\.(ya?ml|json)$/i.test(filePath) || isLegacyRancherFile(filePath));
  const legacy = [];
  const resources = [];
  const malformed = [];

  files.forEach((filePath) => {
    try {
      if (isLegacyRancherFile(filePath)) {
        legacy.push(summarizeLegacyRancherFile(baseDir, filePath));
        return;
      }

      parseDocuments(filePath)
        .filter(isModernRancherResource)
        .forEach((resource) => {
          resources.push(summarizeModernResource(baseDir, filePath, resource));
        });
    } catch {
      malformed.push(normalizeRepoPath(baseDir, filePath));
    }
  });

  return { legacy, resources, malformed };
}

function buildRancherPluginContext(baseDir, options = {}) {
  const discovery = discoverRancherAssets(baseDir, options);
  const clusters = [...new Set(discovery.resources.map((entry) => entry.clusterName).filter(Boolean))].sort();
  const projects = [...new Set(discovery.resources.map((entry) => entry.projectName).filter(Boolean))].sort();
  const namespaces = [...new Set(discovery.resources
    .flatMap((entry) => [entry.namespace, entry.targetNamespace])
    .filter(Boolean))].sort();
  const fleetRepos = discovery.resources
    .filter((entry) => entry.kind === 'GitRepo' && entry.repo)
    .map((entry) => ({
      name: entry.name,
      namespace: entry.namespace,
      repo: entry.repo,
      path: entry.path,
      targetNamespace: entry.targetNamespace,
    }))
    .sort((a, b) => `${a.namespace}/${a.name}`.localeCompare(`${b.namespace}/${b.name}`));

  return {
    plugin: 'rancher',
    generatedAt: new Date().toISOString(),
    legacy: discovery.legacy,
    resources: discovery.resources,
    fleetRepos,
    summary: {
      legacyConfigCount: discovery.legacy.length,
      modernResourceCount: discovery.resources.length,
      malformedFileCount: discovery.malformed.length,
      supportedVersions: [...new Set([
        ...discovery.legacy.map((entry) => entry.rancherVersion),
        ...discovery.resources.map((entry) => entry.rancherVersion),
      ])].sort(),
      clusters,
      projects,
      namespaces,
      fleetRepoCount: fleetRepos.length,
    },
  };
}

module.exports = {
  discoverRancherAssets,
  buildRancherPluginContext,
};
