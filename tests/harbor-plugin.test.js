const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  discoverHarborConfig,
  discoverHarborImageReferences,
  buildHarborPluginContext,
} = require('../lib/plugins/harbor.cjs');

describe('harbor plugin', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-harbor-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeFixture() {
    fs.mkdirSync(path.join(dir, 'deploy'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'harbor.yml'), `
hostname: harbor.internal.example.com
project: platform
replication:
  endpoints:
    - name: backup
robotAccounts:
  - name: ci-bot
`, 'utf8');
    fs.writeFileSync(path.join(dir, 'deploy', 'app.yaml'), `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  template:
    spec:
      containers:
        - name: api
          image: harbor.internal.example.com/platform/api:1.2.3
        - name: worker
          image: harbor.internal.example.com/platform/worker:4.5.6
`, 'utf8');
  }

  test('discovers Harbor config and Harbor-backed image references', () => {
    writeFixture();

    const configs = discoverHarborConfig(dir);
    const refs = discoverHarborImageReferences(dir);
    const context = buildHarborPluginContext(dir);

    expect(configs).toEqual([
      expect.objectContaining({
        path: 'harbor.yml',
        hostname: 'harbor.internal.example.com',
        project: 'platform',
        replicationEndpoints: 1,
        robotAccountsConfigured: 1,
      }),
    ]);
    expect(refs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        registry: 'harbor.internal.example.com',
        repository: 'platform/api',
        tag: '1.2.3',
        file: 'deploy/app.yaml',
      }),
      expect.objectContaining({
        registry: 'harbor.internal.example.com',
        repository: 'platform/worker',
        tag: '4.5.6',
        file: 'deploy/app.yaml',
      }),
    ]));
    expect(context.summary).toEqual(expect.objectContaining({
      configCount: 1,
      imageReferenceCount: 2,
      projects: ['platform'],
      registries: ['harbor.internal.example.com'],
    }));
  });
});
