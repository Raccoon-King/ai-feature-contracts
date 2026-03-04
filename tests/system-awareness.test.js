const fs = require('fs');
const os = require('os');
const path = require('path');
const {
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
} = require('../lib/system-awareness.cjs');

describe('system-awareness', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-system-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeFixtureRepo() {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      packageManager: 'npm@10.0.0',
      dependencies: {
        express: '^4.0.0',
      },
      workspaces: ['apps/*', 'packages/*'],
    }, null, 2));
    fs.writeFileSync(path.join(tempDir, 'package-lock.json'), '{"lockfileVersion":3}\n', 'utf8');

    fs.mkdirSync(path.join(tempDir, 'apps', 'web', 'src', 'components'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'packages', 'api', 'src', 'routes'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'packages', 'api', 'prisma', 'migrations', '001_init'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'specs'), { recursive: true });

    fs.writeFileSync(path.join(tempDir, 'apps', 'web', 'package.json'), JSON.stringify({
      name: '@repo/web',
      dependencies: {
        react: '^18.0.0',
        axios: '^1.7.0',
      },
    }, null, 2));
    fs.writeFileSync(path.join(tempDir, 'packages', 'api', 'package.json'), JSON.stringify({
      name: '@repo/api',
      dependencies: {
        express: '^4.0.0',
      },
    }, null, 2));

    fs.mkdirSync(path.join(tempDir, 'apps', 'web', 'src', 'generated'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'apps', 'web', 'src', 'components', 'Users.tsx'), `
import axios from 'axios';
import { getUsers } from '../generated/client';

export async function Users() {
  await axios.get('/users');
  return getUsers();
}
`, 'utf8');
    fs.writeFileSync(path.join(tempDir, 'apps', 'web', 'src', 'generated', 'client.ts'), `
export function getUsers() {
  return fetch('/users');
}
`, 'utf8');
    fs.writeFileSync(path.join(tempDir, 'packages', 'api', 'src', 'routes', 'users.ts'), `
export function registerUsers(app) {
  app.get('/users', () => []);
}
`, 'utf8');
    fs.writeFileSync(path.join(tempDir, 'packages', 'api', 'prisma', 'schema.prisma'), `
model User {
  id Int @id
}
`, 'utf8');
    fs.writeFileSync(path.join(tempDir, 'packages', 'api', 'prisma', 'migrations', '001_init', 'migration.sql'), `
CREATE TABLE users (
  id INT PRIMARY KEY
);
`, 'utf8');
    fs.writeFileSync(path.join(tempDir, 'specs', 'openapi.yaml'), `
openapi: 3.0.0
info:
  title: API
  version: 1.0.0
paths:
  /users:
    get:
      operationId: getUsers
      responses:
        '200':
          description: ok
`, 'utf8');
  }

  test('discovers a fullstack inventory and writes system.inventory.json', () => {
    writeFixtureRepo();
    const inventory = discoverSystemInventory(tempDir);
    const saved = saveSystemInventoryArtifact(tempDir);

    expect(inventory.profile).toBe('fullstack');
    expect(inventory.frontend.frameworks).toContain('react');
    expect(inventory.backend.frameworks).toContain('express');
    expect(inventory.api.styles).toContain('rest-openapi');
    expect(fs.existsSync(saved.outputPath)).toBe(true);
  });

  test('builds API snapshot with deterministic operations and compatibility diff', () => {
    writeFixtureRepo();
    const inventory = discoverSystemInventory(tempDir);
    const previous = {
      generatedAt: '2026-01-01T00:00:00.000Z',
      operations: [{ kind: 'rest', method: 'GET', path: '/removed', id: 'removedOp' }],
    };
    const snapshot = buildApiSnapshot(tempDir, inventory, previous);

    expect(snapshot.operations.some((operation) => operation.id === 'getUsers')).toBe(true);
    expect(snapshot.compatibility.breakingChanges).toContain('Removed API surface: removedOp');
  });

  test('builds FE dependency snapshot, import graph, and API usage map', () => {
    writeFixtureRepo();
    const inventory = discoverSystemInventory(tempDir);
    const apiSnapshot = buildApiSnapshot(tempDir, inventory);
    const depsSnapshot = buildFrontendDependencySnapshot(tempDir, inventory);
    const importGraph = buildFrontendImportGraph(tempDir, inventory);
    const usageMap = buildFrontendApiUsageMap(tempDir, inventory, apiSnapshot);

    expect(depsSnapshot.packages.some((pkg) => pkg.criticalLibraries.includes('react'))).toBe(true);
    expect(importGraph.nodes.some((node) => node.id.endsWith('Users.tsx'))).toBe(true);
    expect(usageMap.entries.some((entry) => entry.operationId === 'getUsers')).toBe(true);
  });

  test('refreshes API and FE artifacts and lints them successfully', () => {
    writeFixtureRepo();
    const apiResult = refreshApiArtifacts(tempDir);
    const feResult = refreshFrontendArtifacts(tempDir);
    const apiLint = lintApiArtifacts(tempDir);
    const feLint = lintFrontendArtifacts(tempDir);

    expect(fs.existsSync(apiResult.paths.apiSnapshotPath)).toBe(true);
    expect(fs.existsSync(feResult.paths.feDepsSnapshotPath)).toBe(true);
    expect(fs.existsSync(feResult.paths.feImportGraphPath)).toBe(true);
    expect(fs.existsSync(feResult.paths.feApiUsageMapPath)).toBe(true);
    expect(apiLint.errors).toHaveLength(0);
    expect(feLint.errors).toHaveLength(0);
  });

  test('reports stale API and FE artifacts when sources change after refresh', () => {
    writeFixtureRepo();
    refreshApiArtifacts(tempDir);
    refreshFrontendArtifacts(tempDir);

    const futureTime = new Date(Date.now() + 5000);
    fs.utimesSync(path.join(tempDir, 'specs', 'openapi.yaml'), futureTime, futureTime);
    fs.utimesSync(path.join(tempDir, 'apps', 'web', 'package.json'), futureTime, futureTime);

    expect(lintApiArtifacts(tempDir).warnings.some((warning) => warning.includes('Stale API snapshot'))).toBe(true);
    expect(lintFrontendArtifacts(tempDir).warnings.some((warning) => warning.includes('Stale FE artifact'))).toBe(true);
  });

  test('detects API spec and FE dependency changes and recognizes contract metadata', () => {
    expect(detectApiSpecChanges(['specs/openapi.yaml'])).toBe(true);
    expect(detectApiSpecChanges(['src/app.ts'])).toBe(false);
    expect(detectFrontendDependencyChanges(['apps/web/package.json'])).toBe(true);
    expect(detectFrontendDependencyChanges(['src/app.ts'])).toBe(false);
    expect(looksLikeApiChangeContract('**API Change:** yes')).toBe(true);
    expect(looksLikeApiChangeContract('Update OpenAPI payload shape')).toBe(true);
    expect(looksLikeDepsChangeContract('**Dependency Change:** yes')).toBe(true);
    expect(looksLikeDepsChangeContract('Upgrade package.json lockfile')).toBe(true);
  });
});
