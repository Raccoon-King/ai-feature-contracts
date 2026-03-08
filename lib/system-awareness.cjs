const fs = require('fs');
const { ensureDir } = require('./fs-utils.cjs');
const path = require('path');
const yaml = require('yaml');
const { listRepoFiles, normalizePath } = require('./db-awareness.cjs');
const { listCodeFiles, extractImports } = require('./dependency-analyzer.cjs');

const FRONTEND_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.cjs', '.mjs', '.vue', '.svelte'];
const LOCKFILE_NAMES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];
const API_SPEC_PATTERNS = [
  /(^|\/)openapi[^/]*\.(ya?ml|json)$/i,
  /(^|\/)swagger[^/]*\.(ya?ml|json)$/i,
  /(^|\/)schema\.graphql$/i,
  /(^|\/)graphql\/.*\.graphql$/i,
  /(^|\/)proto\/.*\.proto$/i,
  /\.proto$/i,
];

function writeJson(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return filePath;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonSafe(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readYamlOrJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  if (filePath.endsWith('.json')) {
    return JSON.parse(raw);
  }
  return yaml.parse(raw);
}

function findPackageFiles(cwd) {
  return listRepoFiles(cwd, {
    includeExtensions: ['.json', '.yaml', '.yml', '.graphql', '.proto', '.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte', '.sql', '.prisma'],
  }).filter((relativePath) => {
    const base = path.basename(relativePath);
    return base === 'package.json'
      || LOCKFILE_NAMES.includes(base)
      || base === 'pnpm-workspace.yaml'
      || base === 'pnpm-workspace.yml'
      || API_SPEC_PATTERNS.some((pattern) => pattern.test(relativePath))
      || /migrations?\//i.test(relativePath)
      || /schema\.(prisma|sql)$/i.test(relativePath);
  });
}

function findPackageOwners(cwd) {
  return findPackageFiles(cwd)
    .filter((relativePath) => path.basename(relativePath) === 'package.json')
    .map((relativePath) => normalizePath(path.dirname(relativePath)))
    .sort((a, b) => a.localeCompare(b));
}

function readPackageJson(cwd, relativePath = 'package.json') {
  const filePath = path.join(cwd, relativePath);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function collectWorkspacePackageManifests(cwd) {
  const manifests = findPackageFiles(cwd).filter((relativePath) => path.basename(relativePath) === 'package.json');
  return manifests.map((relativePath) => ({
    path: relativePath,
    dir: normalizePath(path.dirname(relativePath)),
    data: readPackageJson(cwd, relativePath),
  })).filter((entry) => entry.data);
}

function detectPackageManager(files, rootPkg) {
  if (files.some((file) => path.basename(file) === 'pnpm-lock.yaml')) return 'pnpm';
  if (files.some((file) => path.basename(file) === 'yarn.lock')) return 'yarn';
  if (files.some((file) => path.basename(file) === 'package-lock.json')) return 'npm';
  if (rootPkg && typeof rootPkg.packageManager === 'string') {
    return rootPkg.packageManager.split('@')[0];
  }
  return null;
}

function detectMonorepoTool(files, manifests) {
  const deps = manifests.flatMap((entry) => Object.keys({
    ...(entry.data.dependencies || {}),
    ...(entry.data.devDependencies || {}),
  }));
  if (deps.includes('nx')) return 'nx';
  if (deps.includes('turbo')) return 'turbo';
  if (deps.includes('lerna')) return 'lerna';
  if (files.some((file) => /turbo\.json$/i.test(file))) return 'turbo';
  if (files.some((file) => /nx\.json$/i.test(file))) return 'nx';
  if (files.some((file) => /lerna\.json$/i.test(file))) return 'lerna';
  return null;
}

function detectFrontendFramework(manifest) {
  const deps = {
    ...(manifest.dependencies || {}),
    ...(manifest.devDependencies || {}),
  };
  if (deps.next) return 'next';
  if (deps.react) return 'react';
  if (deps.vue) return 'vue';
  if (deps['@angular/core']) return 'angular';
  if (deps.svelte) return 'svelte';
  return null;
}

function detectBackendFramework(manifest) {
  const deps = {
    ...(manifest.dependencies || {}),
    ...(manifest.devDependencies || {}),
  };
  if (deps.express) return 'express';
  if (deps.fastify) return 'fastify';
  if (deps.nestjs || deps['@nestjs/core']) return 'nestjs';
  if (deps.koa) return 'koa';
  if (deps.hono) return 'hono';
  return null;
}

function inferLanguages(files) {
  const languages = new Set();
  files.forEach((file) => {
    const ext = path.extname(file).toLowerCase();
    if (['.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx'].includes(ext)) languages.add('node');
    if (ext === '.py') languages.add('python');
    if (ext === '.go') languages.add('go');
    if (ext === '.java') languages.add('java');
  });
  return [...languages].sort();
}

function detectApiStyles(specFiles, manifests) {
  const styles = new Set();
  if (specFiles.some((file) => /(openapi|swagger).*\.(ya?ml|json)$/i.test(file))) styles.add('rest-openapi');
  if (specFiles.some((file) => /\.graphql$/i.test(file))) styles.add('graphql');
  if (specFiles.some((file) => /\.proto$/i.test(file))) styles.add('grpc');
  manifests.forEach((entry) => {
    const deps = Object.keys({
      ...(entry.data.dependencies || {}),
      ...(entry.data.devDependencies || {}),
    });
    if (deps.includes('graphql')) styles.add('graphql');
    if (deps.includes('@grpc/grpc-js')) styles.add('grpc');
    if (deps.includes('@trpc/server')) styles.add('trpc');
  });
  return [...styles].sort();
}

function classifyProfile(frontendRoots, backendRoots, apiSpecFiles, dbFiles) {
  const hasFrontend = frontendRoots.length > 0;
  const hasBackend = backendRoots.length > 0 || apiSpecFiles.length > 0 || dbFiles.length > 0;
  if (hasFrontend && hasBackend) return 'fullstack';
  if (hasFrontend) return 'web-ui';
  return 'api-service';
}

function detectFrontendRoots(cwd, manifests) {
  const roots = manifests
    .filter((entry) => detectFrontendFramework(entry.data))
    .map((entry) => entry.dir || '.');
  if (roots.length > 0) return [...new Set(roots)].sort();

  const fallback = ['src', 'app', 'pages', 'components', 'frontend', 'web', 'client']
    .filter((dir) => fs.existsSync(path.join(cwd, dir)));
  return fallback.sort();
}

function detectBackendRoots(cwd, manifests) {
  const roots = manifests
    .filter((entry) => detectBackendFramework(entry.data))
    .map((entry) => entry.dir || '.');
  if (roots.length > 0) return [...new Set(roots)].sort();

  const fallback = ['src', 'server', 'api', 'backend', 'services']
    .filter((dir) => fs.existsSync(path.join(cwd, dir)));
  return fallback.sort();
}

function detectApiSpecFiles(files, config = {}) {
  const configuredRoots = Array.isArray(config?.systemGovernance?.roots?.apiSpecRoots)
    ? config.systemGovernance.roots.apiSpecRoots.map(normalizePath)
    : [];
  return files.filter((file) => {
    if (API_SPEC_PATTERNS.some((pattern) => pattern.test(file))) return true;
    return configuredRoots.some((root) => file === root || file.startsWith(`${root}/`));
  }).sort();
}

function detectDbFiles(files) {
  return files.filter((file) => /migrations?\//i.test(file) || /schema\.(prisma|sql)$/i.test(file)).sort();
}

function inferPackageOwner(cwd, relativePath, roots = []) {
  const normalized = normalizePath(relativePath);
  const explicit = roots.find((root) => normalized === root || normalized.startsWith(`${root}/`));
  if (explicit) return explicit;
  const segments = normalized.split('/');
  for (let index = segments.length; index >= 1; index -= 1) {
    const candidate = segments.slice(0, index).join('/');
    if (fs.existsSync(path.join(cwd, candidate, 'package.json'))) return candidate;
  }
  return '.';
}

function detectCriticalLibraries(dependencies) {
  const critical = ['react', 'next', 'vue', 'axios', '@tanstack/react-query', 'graphql', 'apollo-client', 'redux', 'tailwindcss', 'vite', 'webpack'];
  return critical.filter((name) => name in dependencies);
}

function discoverSystemInventory(cwd, options = {}) {
  const config = options.config || {};
  const files = findPackageFiles(cwd);
  const manifests = collectWorkspacePackageManifests(cwd);
  const rootManifest = readPackageJson(cwd);
  const frontendRoots = detectFrontendRoots(cwd, manifests);
  const backendRoots = detectBackendRoots(cwd, manifests);
  const apiSpecFiles = detectApiSpecFiles(files, config);
  const dbFiles = detectDbFiles(files);
  const packageManager = detectPackageManager(files, rootManifest);
  const monorepoTool = detectMonorepoTool(files, manifests);
  const frontendFrameworks = manifests.map((entry) => detectFrontendFramework(entry.data)).filter(Boolean);
  const backendFrameworks = manifests.map((entry) => detectBackendFramework(entry.data)).filter(Boolean);
  const profile = config?.systemGovernance?.profile && config.systemGovernance.profile !== 'auto'
    ? config.systemGovernance.profile
    : classifyProfile(frontendRoots, backendRoots, apiSpecFiles, dbFiles);

  return {
    generatedAt: new Date().toISOString(),
    root: normalizePath(cwd),
    profile,
    packageManager,
    monorepoTool,
    languages: inferLanguages(listRepoFiles(cwd, { includeExtensions: ['.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx', '.py', '.go', '.java'] })),
    frontend: {
      roots: frontendRoots,
      frameworks: [...new Set(frontendFrameworks)].sort(),
      manifests: manifests
        .filter((entry) => detectFrontendFramework(entry.data))
        .map((entry) => entry.path),
      lockfiles: files.filter((file) => LOCKFILE_NAMES.includes(path.basename(file))).sort(),
    },
    backend: {
      roots: backendRoots,
      frameworks: [...new Set(backendFrameworks)].sort(),
      manifests: manifests
        .filter((entry) => detectBackendFramework(entry.data))
        .map((entry) => entry.path),
    },
    api: {
      styles: detectApiStyles(apiSpecFiles, manifests),
      specFiles: apiSpecFiles,
    },
    db: {
      schemaAndMigrationFiles: dbFiles,
    },
    packageRoots: findPackageOwners(cwd),
    constraints: config?.systemGovernance?.constraints || {},
    rulesets: {
      recommended: profile === 'web-ui'
        ? ['fe-deps@v1', 'api-compat@v1']
        : profile === 'api-service'
          ? ['db-safety@v1', 'api-compat@v1']
          : ['db-safety@v1', 'api-compat@v1', 'fe-deps@v1'],
    },
  };
}

function getSystemArtifactPaths(cwd) {
  return {
    inventoryPath: path.join(cwd, '.grabby', 'system.inventory.json'),
    apiSnapshotPath: path.join(cwd, '.grabby', 'be', 'api.snapshot.json'),
    feDepsSnapshotPath: path.join(cwd, '.grabby', 'fe', 'deps.snapshot.json'),
    feImportGraphPath: path.join(cwd, '.grabby', 'fe', 'import.graph.json'),
    feApiUsageMapPath: path.join(cwd, '.grabby', 'fe', 'api.usage.map.json'),
  };
}

function saveSystemInventoryArtifact(cwd, options = {}) {
  const artifact = discoverSystemInventory(cwd, options);
  const paths = getSystemArtifactPaths(cwd);
  return {
    artifact,
    outputPath: writeJson(paths.inventoryPath, artifact),
  };
}

function parseOpenApiSpec(cwd, relativePath) {
  const document = readYamlOrJson(path.join(cwd, relativePath));
  const operations = [];
  Object.entries(document.paths || {}).forEach(([routePath, methods]) => {
    Object.entries(methods || {}).forEach(([method, details]) => {
      if (!['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(method.toLowerCase())) return;
      operations.push({
        id: details.operationId || `${method.toUpperCase()} ${routePath}`,
        kind: 'rest',
        method: method.toUpperCase(),
        path: routePath,
        deprecated: Boolean(details.deprecated),
        version: document.info?.version || null,
        requestShape: Object.keys(details.requestBody?.content || {}),
        responseShape: Object.keys(details.responses || {}),
        source: relativePath,
      });
    });
  });
  return {
    style: 'rest-openapi',
    source: relativePath,
    version: document.info?.version || null,
    operations,
  };
}

function parseGraphqlSchema(cwd, relativePath) {
  const content = fs.readFileSync(path.join(cwd, relativePath), 'utf8');
  const operations = [];
  const typePattern = /type\s+(Query|Mutation)\s*\{([\s\S]*?)\}/g;
  let match;
  while ((match = typePattern.exec(content)) !== null) {
    const kind = match[1].toLowerCase();
    const body = match[2];
    body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => {
      const fieldMatch = line.match(/^([A-Za-z0-9_]+)\s*(\([^)]*\))?\s*:\s*([A-Za-z0-9_\[\]!]+)/);
      if (!fieldMatch) return;
      operations.push({
        id: `${match[1]}.${fieldMatch[1]}`,
        kind: 'graphql',
        method: match[1].toUpperCase(),
        path: fieldMatch[1],
        deprecated: /@deprecated/.test(line),
        version: null,
        requestShape: fieldMatch[2] ? [fieldMatch[2]] : [],
        responseShape: [fieldMatch[3]],
        source: relativePath,
      });
    });
  }
  return {
    style: 'graphql',
    source: relativePath,
    version: null,
    operations,
  };
}

function parseProtoSchema(cwd, relativePath) {
  const content = fs.readFileSync(path.join(cwd, relativePath), 'utf8');
  const operations = [];
  const servicePattern = /service\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)\}/g;
  let match;
  while ((match = servicePattern.exec(content)) !== null) {
    const serviceName = match[1];
    const body = match[2];
    const rpcPattern = /rpc\s+([A-Za-z0-9_]+)\s*\(([^)]+)\)\s+returns\s+\(([^)]+)\)/g;
    let rpcMatch;
    while ((rpcMatch = rpcPattern.exec(body)) !== null) {
      operations.push({
        id: `${serviceName}.${rpcMatch[1]}`,
        kind: 'grpc',
        method: 'RPC',
        path: rpcMatch[1],
        deprecated: false,
        version: null,
        requestShape: [rpcMatch[2].trim()],
        responseShape: [rpcMatch[3].trim()],
        source: relativePath,
      });
    }
  }
  return {
    style: 'grpc',
    source: relativePath,
    version: null,
    operations,
  };
}

function parseApiSpec(cwd, relativePath) {
  if (/(openapi|swagger).*\.(ya?ml|json)$/i.test(relativePath)) return parseOpenApiSpec(cwd, relativePath);
  if (/\.graphql$/i.test(relativePath)) return parseGraphqlSchema(cwd, relativePath);
  if (/\.proto$/i.test(relativePath)) return parseProtoSchema(cwd, relativePath);
  return { style: 'unknown', source: relativePath, version: null, operations: [] };
}

function summarizeBreakingApiChanges(previousSnapshot, nextSnapshot) {
  if (!previousSnapshot || !Array.isArray(previousSnapshot.operations)) {
    return [];
  }
  const nextIds = new Set((nextSnapshot.operations || []).map((operation) => `${operation.kind}:${operation.method}:${operation.path}:${operation.id}`));
  return (previousSnapshot.operations || [])
    .filter((operation) => !nextIds.has(`${operation.kind}:${operation.method}:${operation.path}:${operation.id}`))
    .map((operation) => `Removed API surface: ${operation.id}`);
}

function buildApiSnapshot(cwd, inventory, previousSnapshot = null) {
  const parsedSpecs = (inventory.api.specFiles || []).map((relativePath) => parseApiSpec(cwd, relativePath));
  const operations = parsedSpecs.flatMap((entry) => entry.operations || []);
  const versions = parsedSpecs.map((entry) => entry.version).filter(Boolean);
  const snapshot = {
    generatedAt: new Date().toISOString(),
    profile: inventory.profile,
    styles: inventory.api.styles || [],
    sources: (inventory.api.specFiles || []).slice(),
    versions: [...new Set(versions)],
    operations: operations.sort((a, b) => `${a.kind}:${a.method}:${a.path}:${a.id}`.localeCompare(`${b.kind}:${b.method}:${b.path}:${b.id}`)),
    compatibility: {
      comparedToGeneratedAt: previousSnapshot?.generatedAt || null,
      breakingChanges: [],
    },
    warnings: operations.length === 0 ? ['No API operations discovered from source-of-truth specs.'] : [],
  };
  snapshot.compatibility.breakingChanges = summarizeBreakingApiChanges(previousSnapshot, snapshot);
  return snapshot;
}

function collectDependencyVersionMap(manifest) {
  return {
    ...(manifest.dependencies || {}),
    ...(manifest.devDependencies || {}),
    ...(manifest.peerDependencies || {}),
  };
}

function buildFrontendDependencySnapshot(cwd, inventory) {
  const manifests = collectWorkspacePackageManifests(cwd);
  const frontendPackages = manifests.filter((entry) => {
    const owner = normalizePath(entry.dir || '.');
    return (inventory.frontend.roots || []).some((root) => owner === root || owner.startsWith(`${root}/`) || root === '.');
  });
  const packages = frontendPackages.map((entry) => {
    const dependencies = collectDependencyVersionMap(entry.data);
    const lockfiles = LOCKFILE_NAMES
      .map((name) => normalizePath(path.join(entry.dir || '.', name)))
      .filter((relativePath) => fs.existsSync(path.join(cwd, relativePath)));
    return {
      name: entry.data.name || ownerName(entry.dir),
      path: entry.path,
      packageManager: inventory.packageManager,
      dependencies,
      criticalLibraries: detectCriticalLibraries(dependencies),
      lockfiles,
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    profile: inventory.profile,
    packageManager: inventory.packageManager,
    monorepoTool: inventory.monorepoTool,
    packages: packages.sort((a, b) => a.path.localeCompare(b.path)),
    lockfiles: [...new Set(packages.flatMap((entry) => entry.lockfiles))].sort(),
    warnings: packages.length === 0 ? ['No frontend package manifests discovered.'] : [],
  };
}

function ownerName(relativeDir) {
  return normalizePath(relativeDir || '.').split('/').filter(Boolean).pop() || 'root';
}

function isFrontendFile(relativePath, inventory) {
  const ext = path.extname(relativePath).toLowerCase();
  if (!FRONTEND_EXTENSIONS.includes(ext)) return false;
  if (/\.d\.ts$/i.test(relativePath)) return false;
  return (inventory.frontend.roots || []).some((root) => {
    if (root === '.') return !relativePath.startsWith('lib/') && !relativePath.startsWith('tests/');
    return relativePath === root || relativePath.startsWith(`${root}/`);
  });
}

function buildFrontendImportGraph(cwd, inventory) {
  const packageRoots = inventory.packageRoots || [];
  const files = listCodeFiles(cwd, { includeExtensions: FRONTEND_EXTENSIONS })
    .filter((relativePath) => isFrontendFile(relativePath, inventory));
  const nodes = [];
  const edges = [];
  files.forEach((relativePath) => {
    const content = fs.readFileSync(path.join(cwd, relativePath), 'utf8');
    nodes.push({
      id: relativePath,
      package: inferPackageOwner(cwd, relativePath, packageRoots),
    });
    extractImports(content).forEach((specifier) => {
      edges.push({
        from: relativePath,
        to: specifier.startsWith('.') ? normalizePath(path.join(path.dirname(relativePath), specifier)) : specifier,
        kind: specifier.startsWith('.') ? 'relative' : 'package',
      });
    });
  });
  return {
    generatedAt: new Date().toISOString(),
    profile: inventory.profile,
    nodes: nodes.sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges.sort((a, b) => `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`)),
  };
}

function extractRestCalls(content) {
  const calls = [];
  const fetchPattern = /fetch\s*\(\s*['"`]([^'"`]+)['"`]/g;
  const axiosPattern = /axios\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  let match;
  while ((match = fetchPattern.exec(content)) !== null) {
    calls.push({ method: 'GET', target: match[1], source: 'fetch' });
  }
  while ((match = axiosPattern.exec(content)) !== null) {
    calls.push({ method: match[1].toUpperCase(), target: match[2], source: 'axios' });
  }
  return calls;
}

function extractGeneratedClientCalls(content) {
  const calls = [];
  const clientPattern = /\b(?:api|client)\.([A-Za-z0-9_]+)\s*\(/g;
  let match;
  while ((match = clientPattern.exec(content)) !== null) {
    calls.push({ operationId: match[1], source: 'generated-client' });
  }
  return calls;
}

function matchApiOperation(restCall, operations) {
  return operations.find((operation) => operation.kind === 'rest' && operation.method === restCall.method && operation.path === restCall.target);
}

function buildFrontendApiUsageMap(cwd, inventory, apiSnapshot) {
  const files = listCodeFiles(cwd, { includeExtensions: FRONTEND_EXTENSIONS })
    .filter((relativePath) => isFrontendFile(relativePath, inventory));
  const operations = apiSnapshot.operations || [];
  const entries = [];
  files.forEach((relativePath) => {
    const content = fs.readFileSync(path.join(cwd, relativePath), 'utf8');
    extractRestCalls(content).forEach((call) => {
      const operation = matchApiOperation(call, operations);
      entries.push({
        file: relativePath,
        callSite: call.target,
        method: call.method,
        matchType: operation ? 'exact' : 'unresolved',
        operationId: operation ? operation.id : null,
      });
    });
    extractGeneratedClientCalls(content).forEach((call) => {
      const operation = operations.find((entry) => entry.id === call.operationId || entry.id.endsWith(`.${call.operationId}`));
      entries.push({
        file: relativePath,
        callSite: call.operationId,
        method: operation?.method || null,
        matchType: operation ? 'inferred-from-generated-client' : 'unresolved',
        operationId: operation ? operation.id : null,
      });
    });
  });
  return {
    generatedAt: new Date().toISOString(),
    profile: inventory.profile,
    entries: entries.sort((a, b) => `${a.file}:${a.callSite}`.localeCompare(`${b.file}:${b.callSite}`)),
  };
}

function refreshApiArtifacts(cwd, options = {}) {
  const inventory = discoverSystemInventory(cwd, options);
  const paths = getSystemArtifactPaths(cwd);
  const previousSnapshot = readJsonSafe(paths.apiSnapshotPath);
  const apiSnapshot = buildApiSnapshot(cwd, inventory, previousSnapshot);
  writeJson(paths.inventoryPath, inventory);
  writeJson(paths.apiSnapshotPath, apiSnapshot);
  return { inventory, apiSnapshot, paths };
}

function refreshFrontendArtifacts(cwd, options = {}) {
  const inventory = discoverSystemInventory(cwd, options);
  const paths = getSystemArtifactPaths(cwd);
  const previousApiSnapshot = readJsonSafe(paths.apiSnapshotPath);
  const apiSnapshot = previousApiSnapshot || buildApiSnapshot(cwd, inventory);
  const depsSnapshot = buildFrontendDependencySnapshot(cwd, inventory);
  const importGraph = buildFrontendImportGraph(cwd, inventory);
  const apiUsageMap = buildFrontendApiUsageMap(cwd, inventory, apiSnapshot);
  writeJson(paths.inventoryPath, inventory);
  writeJson(paths.feDepsSnapshotPath, depsSnapshot);
  writeJson(paths.feImportGraphPath, importGraph);
  writeJson(paths.feApiUsageMapPath, apiUsageMap);
  return { inventory, depsSnapshot, importGraph, apiUsageMap, paths };
}

function relevantApiSourceFiles(inventory) {
  return inventory?.api?.specFiles || [];
}

function relevantFrontendSourceFiles(cwd, inventory) {
  const dependencyInputs = findPackageFiles(cwd).filter((relativePath) => {
    const base = path.basename(relativePath);
    return base === 'package.json'
      || LOCKFILE_NAMES.includes(base)
      || base === 'pnpm-workspace.yaml'
      || base === 'pnpm-workspace.yml';
  });
  const importInputs = listCodeFiles(cwd, { includeExtensions: FRONTEND_EXTENSIONS })
    .filter((relativePath) => isFrontendFile(relativePath, inventory));
  return [...dependencyInputs, ...importInputs];
}

function lintApiArtifacts(cwd, options = {}) {
  const strict = options.strict === true;
  const paths = getSystemArtifactPaths(cwd);
  const errors = [];
  const warnings = [];
  let inventory = null;
  let snapshot = null;

  if (!fs.existsSync(paths.inventoryPath)) {
    errors.push(`Missing artifact: ${normalizePath(path.relative(cwd, paths.inventoryPath))}`);
  } else {
    inventory = readJson(paths.inventoryPath);
  }
  if (!fs.existsSync(paths.apiSnapshotPath)) {
    errors.push(`Missing artifact: ${normalizePath(path.relative(cwd, paths.apiSnapshotPath))}`);
  } else {
    snapshot = readJson(paths.apiSnapshotPath);
  }

  if (inventory && snapshot) {
    const snapshotMtime = fs.statSync(paths.apiSnapshotPath).mtimeMs;
    relevantApiSourceFiles(inventory).forEach((relativePath) => {
      const fullPath = path.join(cwd, relativePath);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).mtimeMs > snapshotMtime) {
        warnings.push(`Stale API snapshot: ${relativePath}`);
      }
    });
    (snapshot.compatibility?.breakingChanges || []).forEach((item) => warnings.push(`Breaking API change detected: ${item}`));
  }

  return { valid: errors.length === 0 && (!strict || warnings.length === 0), errors, warnings, paths };
}

function lintFrontendArtifacts(cwd, options = {}) {
  const strict = options.strict === true;
  const paths = getSystemArtifactPaths(cwd);
  const errors = [];
  const warnings = [];
  const required = [paths.inventoryPath, paths.feDepsSnapshotPath, paths.feImportGraphPath, paths.feApiUsageMapPath];
  required.forEach((filePath) => {
    if (!fs.existsSync(filePath)) {
      errors.push(`Missing artifact: ${normalizePath(path.relative(cwd, filePath))}`);
    }
  });

  if (errors.length === 0) {
    const inventory = readJson(paths.inventoryPath);
    const depsSnapshot = readJson(paths.feDepsSnapshotPath);
    const snapshotMtime = fs.statSync(paths.feDepsSnapshotPath).mtimeMs;
    relevantFrontendSourceFiles(cwd, inventory).forEach((relativePath) => {
      const fullPath = path.join(cwd, relativePath);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).mtimeMs > snapshotMtime) {
        warnings.push(`Stale FE artifact: ${relativePath}`);
      }
    });
    depsSnapshot.packages.forEach((pkg) => {
      Object.entries(pkg.dependencies || {}).forEach(([name, version]) => {
        if (String(version).trim() === '*' || String(version).trim().toLowerCase() === 'latest') {
          warnings.push(`Unpinned FE dependency version: ${pkg.path} -> ${name}@${version}`);
        }
      });
    });
  }

  return { valid: errors.length === 0 && (!strict || warnings.length === 0), errors, warnings, paths };
}

function detectApiSpecChanges(changedFiles = [], config = {}) {
  const normalizedFiles = changedFiles.map((file) => normalizePath(file));
  const configuredRoots = Array.isArray(config?.systemGovernance?.roots?.apiSpecRoots)
    ? config.systemGovernance.roots.apiSpecRoots.map(normalizePath)
    : [];
  return normalizedFiles.some((file) => {
    if (API_SPEC_PATTERNS.some((pattern) => pattern.test(file))) return true;
    return configuredRoots.some((root) => file === root || file.startsWith(`${root}/`));
  });
}

function detectFrontendDependencyChanges(changedFiles = [], config = {}) {
  const normalizedFiles = changedFiles.map((file) => normalizePath(file));
  const configuredRoots = Array.isArray(config?.systemGovernance?.roots?.frontendRoots)
    ? config.systemGovernance.roots.frontendRoots.map(normalizePath)
    : [];
  return normalizedFiles.some((file) => {
    const base = path.basename(file);
    if (base === 'package.json' || LOCKFILE_NAMES.includes(base) || /pnpm-workspace\.ya?ml$/i.test(base)) return true;
    return configuredRoots.some((root) => file === `${root}/package.json` || file.startsWith(`${root}/`));
  });
}

function looksLikeApiChangeContract(content = '') {
  return /\*\*API Change:\*\*\s*(yes|true)/i.test(content)
    || /## API Impact/i.test(content)
    || /openapi|graphql|grpc|endpoint|operation id|api version/i.test(content);
}

function looksLikeDepsChangeContract(content = '') {
  return /\*\*Dependency Change:\*\*\s*(yes|true)/i.test(content)
    || /## Dependency Impact/i.test(content)
    || /package\.json|lockfile|dependency upgrade|workspace dependency/i.test(content);
}

// Component and language setup integration
const { saveComponentIndex, buildComponentIndex } = require('./component-indexer.cjs');
const { saveLanguageSetup, buildLanguageSetup } = require('./language-setup.cjs');

function refreshComponentIndex(cwd, options = {}) {
  const inventory = discoverSystemInventory(cwd, options);
  return saveComponentIndex(cwd, inventory);
}

function refreshLanguageSetup(cwd) {
  return saveLanguageSetup(cwd);
}

function refreshAllIndexes(cwd, options = {}) {
  const inventory = discoverSystemInventory(cwd, options);
  const paths = getSystemArtifactPaths(cwd);

  // Save system inventory
  writeJson(paths.inventoryPath, inventory);

  // Refresh component index for frontend projects
  const componentResult = saveComponentIndex(cwd, inventory);

  // Refresh language setup for non-Node projects
  const languageResult = saveLanguageSetup(cwd);

  return {
    inventory,
    componentIndex: componentResult.index,
    languageSetup: languageResult.setup,
    paths: {
      ...paths,
      componentIndexPath: componentResult.outputPath,
      languageSetupPath: languageResult.outputPath,
    },
  };
}

module.exports = {
  getSystemArtifactPaths,
  discoverSystemInventory,
  saveSystemInventoryArtifact,
  buildApiSnapshot,
  buildFrontendDependencySnapshot,
  buildFrontendImportGraph,
  buildFrontendApiUsageMap,
  refreshApiArtifacts,
  refreshFrontendArtifacts,
  lintApiArtifacts,
  lintFrontendArtifacts,
  detectApiSpecChanges,
  detectFrontendDependencyChanges,
  looksLikeApiChangeContract,
  looksLikeDepsChangeContract,
  // Component and language setup
  refreshComponentIndex,
  refreshLanguageSetup,
  refreshAllIndexes,
  buildComponentIndex,
  buildLanguageSetup,
};
