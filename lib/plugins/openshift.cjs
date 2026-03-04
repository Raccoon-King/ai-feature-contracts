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
          if (!IGNORED_DIRS.has(entry.name)) stack.push(fullPath);
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

function isOpenShiftResource(resource) {
  const version = String(resource.apiVersion || '');
  return (
    resource.kind === 'Service'
    || resource.kind === 'Secret'
    || ['Route', 'Template', 'BuildConfig', 'ImageStream', 'DeploymentConfig'].includes(resource.kind)
    || version.startsWith('route.openshift.io/')
    || version.startsWith('template.openshift.io/')
    || version.startsWith('build.openshift.io/')
    || version.startsWith('image.openshift.io/')
    || version.startsWith('apps.openshift.io/')
    || (resource.kind === 'SecurityContextConstraints' && version.startsWith('security.openshift.io/'))
    || (resource.kind === 'Project' && version.startsWith('project.openshift.io/'))
  );
}

function resourceKey(resource) {
  const namespace = resource.metadata?.namespace || 'default';
  return `${resource.kind}:${namespace}:${resource.metadata?.name}`;
}

function discoverOpenShiftResources(baseDir, options = {}) {
  const roots = Array.isArray(options.roots) ? options.roots : [];
  const resources = [];

  walk(baseDir, roots).forEach((filePath) => {
    try {
      parseDocuments(filePath)
        .filter(isOpenShiftResource)
        .forEach((resource) => {
          resources.push({
            key: resourceKey(resource),
            kind: resource.kind,
            name: resource.metadata.name,
            namespace: resource.metadata.namespace || 'default',
            file: normalizeRepoPath(baseDir, filePath),
            raw: resource,
          });
        });
    } catch {
      // Ignore malformed or unrelated manifest files.
    }
  });

  return resources;
}

function buildOpenShiftRelationships(resources) {
  const relationships = [];
  const services = resources.filter((resource) => resource.kind === 'Service');
  const templates = resources.filter((resource) => resource.kind === 'Template');

  resources.forEach((resource) => {
    if (resource.kind === 'Route') {
      const serviceName = resource.raw.spec?.to?.name;
      const service = services.find((candidate) => candidate.name === serviceName && candidate.namespace === resource.namespace);
      if (service) {
        relationships.push({
          type: 'route-service',
          from: resource.key,
          to: service.key,
        });
      }
    }

    if (resource.kind === 'DeploymentConfig') {
      const imageStreamTag = resource.raw.spec?.triggers?.find((trigger) => trigger.type === 'ImageChange')?.imageChangeParams?.from?.name;
      if (imageStreamTag) {
        const [imageStreamName] = String(imageStreamTag).split(':');
        const imageStream = resources.find((candidate) => candidate.kind === 'ImageStream' && candidate.name === imageStreamName && candidate.namespace === resource.namespace);
        if (imageStream) {
          relationships.push({
            type: 'deploymentconfig-imagestream',
            from: resource.key,
            to: imageStream.key,
          });
        }
      }
    }

    if (resource.kind === 'BuildConfig') {
      const outputName = resource.raw.spec?.output?.to?.name;
      if (outputName) {
        const [imageStreamName] = String(outputName).split(':');
        const imageStream = resources.find((candidate) => candidate.kind === 'ImageStream' && candidate.name === imageStreamName && candidate.namespace === resource.namespace);
        if (imageStream) {
          relationships.push({
            type: 'buildconfig-output',
            from: resource.key,
            to: imageStream.key,
          });
        }
      }
    }
  });

  templates.forEach((template) => {
    const objects = Array.isArray(template.raw.objects) ? template.raw.objects : [];
    objects.forEach((object) => {
      if (object?.kind && object?.metadata?.name) {
        relationships.push({
          type: 'template-object',
          from: template.key,
          to: `${object.kind}:${object.metadata.namespace || template.namespace}:${object.metadata.name}`,
        });
      }
    });
  });

  return relationships;
}

function buildOpenShiftPluginContext(baseDir, options = {}) {
  const resources = discoverOpenShiftResources(baseDir, options);
  const relationships = buildOpenShiftRelationships(resources);
  return {
    plugin: 'openshift',
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
      routeCount: resources.filter((resource) => resource.kind === 'Route').length,
      templateCount: resources.filter((resource) => resource.kind === 'Template').length,
      securityConstraintCount: resources.filter((resource) => resource.kind === 'SecurityContextConstraints').length,
      projectCount: resources.filter((resource) => resource.kind === 'Project').length,
    },
  };
}

module.exports = {
  discoverOpenShiftResources,
  buildOpenShiftRelationships,
  buildOpenShiftPluginContext,
};
