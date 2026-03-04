const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  discoverRancherAssets,
  buildRancherPluginContext,
} = require('../lib/plugins/rancher.cjs');

describe('rancher plugin', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-rancher-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeFixtures() {
    fs.mkdirSync(path.join(dir, 'legacy'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'fleet'), { recursive: true });

    fs.writeFileSync(path.join(dir, 'legacy', 'rancher-compose.yml'), `
version: '2'
services:
  web:
    scale: 2
    health_check:
      port: 8080
  lb:
    lb_config:
      port_rules:
        - source_port: 80
`, 'utf8');

    fs.writeFileSync(path.join(dir, 'fleet', 'gitrepo.yaml'), `
apiVersion: fleet.cattle.io/v1alpha1
kind: GitRepo
metadata:
  name: platform-apps
  namespace: fleet-default
spec:
  repo: https://git.example.com/platform/apps.git
  paths:
    - apps/base
  targetNamespace: workloads
`, 'utf8');

    fs.writeFileSync(path.join(dir, 'fleet', 'cluster.yaml'), `
apiVersion: provisioning.cattle.io/v1
kind: Cluster
metadata:
  name: downstream-prod
  namespace: fleet-default
spec:
  kubernetesVersion: v1.29.0+rke2r1
`, 'utf8');

    fs.writeFileSync(path.join(dir, 'fleet', 'project.yaml'), `
apiVersion: management.cattle.io/v3
kind: Project
metadata:
  name: project-abc
  namespace: c-m-123
  labels:
    field.cattle.io/projectId: c-m-123:p-abc
spec:
  clusterName: downstream-prod
`, 'utf8');

    fs.writeFileSync(path.join(dir, 'fleet', 'broken.yaml'), 'kind: [oops', 'utf8');
  }

  test('normalizes legacy and modern Rancher metadata across versions', () => {
    writeFixtures();

    const discovery = discoverRancherAssets(dir);
    const context = buildRancherPluginContext(dir);

    expect(discovery.legacy).toEqual([
      expect.objectContaining({
        file: 'legacy/rancher-compose.yml',
        rancherVersion: 'v1',
        serviceCount: 2,
        services: ['lb', 'web'],
        loadBalancerServiceCount: 1,
        healthCheckServiceCount: 1,
      }),
    ]);
    expect(discovery.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'GitRepo',
        rancherVersion: 'v2-fleet',
        name: 'platform-apps',
        namespace: 'fleet-default',
        repo: 'https://git.example.com/platform/apps.git',
        targetNamespace: 'workloads',
      }),
      expect.objectContaining({
        kind: 'Cluster',
        rancherVersion: 'v2-provisioning',
        name: 'downstream-prod',
      }),
      expect.objectContaining({
        kind: 'Project',
        rancherVersion: 'v2-management',
        clusterName: 'downstream-prod',
        projectName: 'c-m-123:p-abc',
      }),
    ]));
    expect(discovery.malformed).toContain('fleet/broken.yaml');
    expect(context.fleetRepos).toEqual([
      expect.objectContaining({
        name: 'platform-apps',
        namespace: 'fleet-default',
        targetNamespace: 'workloads',
      }),
    ]);
    expect(context.summary).toEqual(expect.objectContaining({
      legacyConfigCount: 1,
      modernResourceCount: 3,
      malformedFileCount: 1,
      supportedVersions: ['v1', 'v2-fleet', 'v2-management', 'v2-provisioning'],
      clusters: ['downstream-prod'],
      projects: ['c-m-123:p-abc'],
      namespaces: ['c-m-123', 'fleet-default', 'workloads'],
      fleetRepoCount: 1,
    }));
  });
});
