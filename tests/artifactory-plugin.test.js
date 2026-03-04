const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  discoverArtifactoryConfig,
  discoverArtifactoryReferences,
  buildArtifactoryPluginContext,
} = require('../lib/plugins/artifactory.cjs');

describe('artifactory plugin', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-artifactory-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeFixture() {
    fs.mkdirSync(path.join(dir, '.jfrog', 'projects'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'java'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'jfrog.yaml'), `
artifactory:
  serverId: corp
  url: https://acme.jfrog.io/artifactory
  repository: npm-dev-local
  releaseRepository: npm-release-local
  accessToken: top-secret
`, 'utf8');
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: 'demo-app',
      publishConfig: {
        registry: 'https://acme.jfrog.io/artifactory/api/npm/npm-release-local/',
      },
    }, null, 2), 'utf8');
    fs.writeFileSync(path.join(dir, '.npmrc'), [
      'registry=https://acme.jfrog.io/artifactory/api/npm/npm-virtual/',
      '//acme.jfrog.io/artifactory/api/npm/npm-virtual/:_authToken=secret-token',
    ].join('\n'), 'utf8');
    fs.writeFileSync(path.join(dir, 'java', 'pom.xml'), `
<project>
  <distributionManagement>
    <repository>
      <id>releases</id>
      <url>https://acme.jfrog.io/artifactory/libs-release-local</url>
    </repository>
  </distributionManagement>
</project>
`, 'utf8');
  }

  test('discovers Artifactory config, repository references, and redacts credentials', () => {
    writeFixture();

    const configs = discoverArtifactoryConfig(dir);
    const refs = discoverArtifactoryReferences(dir);
    const context = buildArtifactoryPluginContext(dir);

    expect(configs).toEqual([
      expect.objectContaining({
        path: 'jfrog.yaml',
        servers: [
          expect.objectContaining({
            serverId: 'corp',
            url: 'https://acme.jfrog.io/artifactory',
            repository: 'npm-dev-local',
            releaseRepository: 'npm-release-local',
          }),
        ],
        redactedConfig: expect.objectContaining({
          artifactory: expect.objectContaining({
            accessToken: '[redacted]',
          }),
        }),
      }),
    ]);
    expect(refs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        file: 'package.json',
        packageManager: 'npm',
        host: 'acme.jfrog.io',
      }),
      expect.objectContaining({
        file: '.npmrc',
        packageManager: 'npm',
        path: '/artifactory/api/npm/npm-virtual',
      }),
      expect.objectContaining({
        file: 'java/pom.xml',
        packageManager: 'maven',
        path: '/artifactory/libs-release-local',
      }),
    ]));
    expect(context.summary).toEqual(expect.objectContaining({
      configCount: 1,
      repositoryReferenceCount: 4,
      hosts: ['acme.jfrog.io'],
      packageManagers: ['maven', 'npm'],
    }));
    expect(context.promotionHints).toEqual(expect.arrayContaining([
      expect.objectContaining({
        from: 'npm-dev-local',
        to: 'npm-release-local',
        source: 'jfrog.yaml',
      }),
    ]));
  });
});
