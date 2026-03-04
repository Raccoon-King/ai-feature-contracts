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

  return files;
}

function parseManifestDocuments(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return yaml.parseAllDocuments(content)
    .map((doc) => doc.toJSON())
    .filter((doc) => doc && typeof doc === 'object' && doc.kind && doc.metadata?.name);
}

function getResourceLabels(resource) {
  return resource.spec?.template?.metadata?.labels
    || resource.spec?.selector?.matchLabels
    || resource.metadata?.labels
    || {};
}

function resourceKey(resource) {
  const namespace = resource.metadata?.namespace || 'default';
  return `${resource.kind}:${namespace}:${resource.metadata?.name}`;
}

function collectResourceReferences(resource) {
  const refs = [];
  const templateSpec = resource.spec?.template?.spec || resource.spec || {};
  const volumes = Array.isArray(templateSpec.volumes) ? templateSpec.volumes : [];
  volumes.forEach((volume) => {
    if (volume.configMap?.name) {
      refs.push({ type: 'configMap', name: volume.configMap.name });
    }
    if (volume.secret?.secretName) {
      refs.push({ type: 'secret', name: volume.secret.secretName });
    }
  });

  const containers = [
    ...(Array.isArray(templateSpec.initContainers) ? templateSpec.initContainers : []),
    ...(Array.isArray(templateSpec.containers) ? templateSpec.containers : []),
  ];
  containers.forEach((container) => {
    (container.envFrom || []).forEach((entry) => {
      if (entry.configMapRef?.name) refs.push({ type: 'configMap', name: entry.configMapRef.name });
      if (entry.secretRef?.name) refs.push({ type: 'secret', name: entry.secretRef.name });
    });
    (container.env || []).forEach((entry) => {
      if (entry.valueFrom?.configMapKeyRef?.name) refs.push({ type: 'configMap', name: entry.valueFrom.configMapKeyRef.name });
      if (entry.valueFrom?.secretKeyRef?.name) refs.push({ type: 'secret', name: entry.valueFrom.secretKeyRef.name });
    });
  });

  return refs;
}

function discoverKubernetesResources(baseDir, options = {}) {
  const roots = Array.isArray(options.roots) ? options.roots : [];
  const files = walk(baseDir, roots).filter((filePath) => /\.(ya?ml|json)$/i.test(filePath)).sort();
  const resources = [];

  files.forEach((filePath) => {
    try {
      parseManifestDocuments(filePath).forEach((resource) => {
        resources.push({
          key: resourceKey(resource),
          kind: resource.kind,
          name: resource.metadata.name,
          namespace: resource.metadata.namespace || 'default',
          labels: getResourceLabels(resource),
          file: normalizeRepoPath(baseDir, filePath),
          refs: collectResourceReferences(resource),
          raw: resource,
        });
      });
    } catch {
      // Ignore malformed non-Kubernetes yaml/json files.
    }
  });

  return resources;
}

function selectorsMatch(selector = {}, labels = {}) {
  const entries = Object.entries(selector || {});
  return entries.length > 0 && entries.every(([key, value]) => labels[key] === value);
}

function buildKubernetesRelationships(resources) {
  const relationships = [];
  const workloads = resources.filter((resource) => ['Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob'].includes(resource.kind));
  const services = resources.filter((resource) => resource.kind === 'Service');
  const ingresses = resources.filter((resource) => resource.kind === 'Ingress');
  const serviceAccounts = resources.filter((resource) => resource.kind === 'ServiceAccount');

  services.forEach((service) => {
    const selector = service.raw.spec?.selector || {};
    workloads.forEach((workload) => {
      if (selectorsMatch(selector, workload.labels)) {
        relationships.push({
          type: 'service-target',
          from: service.key,
          to: workload.key,
        });
      }
    });
  });

  ingresses.forEach((ingress) => {
    const rules = ingress.raw.spec?.rules || [];
    rules.forEach((rule) => {
      const paths = rule.http?.paths || [];
      paths.forEach((entry) => {
        const serviceName = entry.backend?.service?.name;
        if (!serviceName) return;
        const target = services.find((service) => service.name === serviceName && service.namespace === ingress.namespace);
        if (target) {
          relationships.push({
            type: 'ingress-route',
            from: ingress.key,
            to: target.key,
          });
        }
      });
    });
  });

  resources.forEach((resource) => {
    resource.refs.forEach((ref) => {
      const targetKind = ref.type === 'configMap' ? 'ConfigMap' : 'Secret';
      const target = resources.find((entry) => entry.kind === targetKind && entry.name === ref.name && entry.namespace === resource.namespace);
      if (target) {
        relationships.push({
          type: `${ref.type}-reference`,
          from: resource.key,
          to: target.key,
        });
      }
    });

    const serviceAccountName = resource.raw.spec?.template?.spec?.serviceAccountName || resource.raw.spec?.serviceAccountName;
    if (serviceAccountName) {
      const target = serviceAccounts.find((account) => account.name === serviceAccountName && account.namespace === resource.namespace);
      if (target) {
        relationships.push({
          type: 'service-account',
          from: resource.key,
          to: target.key,
        });
      }
    }
  });

  return relationships;
}

function buildKubernetesPluginContext(baseDir, options = {}) {
  const resources = discoverKubernetesResources(baseDir, options);
  const relationships = buildKubernetesRelationships(resources);
  return {
    plugin: 'kubernetes',
    generatedAt: new Date().toISOString(),
    resources: resources.map((resource) => ({
      key: resource.key,
      kind: resource.kind,
      name: resource.name,
      namespace: resource.namespace,
      file: resource.file,
    })),
    relationships,
    summary: {
      resourceCount: resources.length,
      namespaceCount: new Set(resources.map((resource) => resource.namespace)).size,
      relationshipCount: relationships.length,
      workloadCount: resources.filter((resource) => ['Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob'].includes(resource.kind)).length,
    },
  };
}

module.exports = {
  discoverKubernetesResources,
  buildKubernetesRelationships,
  buildKubernetesPluginContext,
};
