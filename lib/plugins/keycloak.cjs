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

function isKeycloakConfigFile(filePath) {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  const baseName = path.basename(normalized);
  return (
    baseName === 'realm-export.json'
    || baseName === 'keycloak.json'
    || baseName === 'keycloak.yaml'
    || baseName === 'keycloak.yml'
    || normalized.includes('/keycloak/')
  );
}

function parseConfig(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (/\.json$/i.test(filePath)) {
    return JSON.parse(content);
  }
  if (/\.(ya?ml)$/i.test(filePath)) {
    return yaml.parse(content) || {};
  }
  return null;
}

function sanitizeClient(client = {}) {
  return {
    clientId: client.clientId || null,
    protocol: client.protocol || 'openid-connect',
    publicClient: client.publicClient === true,
    bearerOnly: client.bearerOnly === true,
    enabled: client.enabled !== false,
    redirectUriCount: Array.isArray(client.redirectUris) ? client.redirectUris.length : 0,
    webOriginCount: Array.isArray(client.webOrigins) ? client.webOrigins.length : 0,
    hasSecret: typeof client.secret === 'string' && client.secret.length > 0,
    roles: Array.isArray(client.roles) ? client.roles.map((role) => role?.name).filter(Boolean).sort() : [],
  };
}

function summarizeRealm(config, file) {
  const realmRoles = Array.isArray(config.roles?.realm)
    ? config.roles.realm.map((role) => role?.name).filter(Boolean).sort()
    : [];
  const clients = Array.isArray(config.clients)
    ? config.clients.map((client) => sanitizeClient(client)).sort((a, b) => String(a.clientId).localeCompare(String(b.clientId)))
    : [];
  const groups = Array.isArray(config.groups)
    ? config.groups.map((group) => group?.name).filter(Boolean).sort()
    : [];
  const identityProviders = Array.isArray(config.identityProviders)
    ? config.identityProviders.map((provider) => ({
      alias: provider?.alias || null,
      providerId: provider?.providerId || null,
      enabled: provider?.enabled !== false,
    })).sort((a, b) => String(a.alias).localeCompare(String(b.alias)))
    : [];

  return {
    file,
    realm: config.realm || null,
    enabled: config.enabled !== false,
    clientCount: clients.length,
    clients,
    realmRoles,
    groupCount: groups.length,
    groups,
    identityProviders,
  };
}

function discoverKeycloakRealms(baseDir, options = {}) {
  const roots = Array.isArray(options.roots) ? options.roots : [];
  return walk(baseDir, roots)
    .filter((filePath) => isKeycloakConfigFile(filePath))
    .map((filePath) => {
      try {
        const parsed = parseConfig(filePath);
        return summarizeRealm(parsed || {}, normalizeRepoPath(baseDir, filePath));
      } catch {
        return {
          file: normalizeRepoPath(baseDir, filePath),
          realm: null,
          enabled: null,
          clientCount: 0,
          clients: [],
          realmRoles: [],
          groupCount: 0,
          groups: [],
          identityProviders: [],
          malformed: true,
        };
      }
    });
}

function discoverKeycloakClientConfig(baseDir, options = {}) {
  const realms = discoverKeycloakRealms(baseDir, options);
  return realms.flatMap((realm) => realm.clients.map((client) => ({
    realm: realm.realm,
    file: realm.file,
    ...client,
  })));
}

function buildKeycloakPluginContext(baseDir, options = {}) {
  const realms = discoverKeycloakRealms(baseDir, options);
  const clients = discoverKeycloakClientConfig(baseDir, options);

  return {
    plugin: 'keycloak',
    generatedAt: new Date().toISOString(),
    realms,
    clients,
    summary: {
      realmCount: realms.length,
      malformedRealmCount: realms.filter((entry) => entry.malformed).length,
      clientCount: clients.length,
      publicClientCount: clients.filter((client) => client.publicClient).length,
      confidentialClientCount: clients.filter((client) => client.hasSecret).length,
      identityProviderCount: realms.reduce((sum, realm) => sum + realm.identityProviders.length, 0),
      realmNames: realms.map((realm) => realm.realm).filter(Boolean).sort(),
    },
  };
}

module.exports = {
  discoverKeycloakRealms,
  discoverKeycloakClientConfig,
  buildKeycloakPluginContext,
};
