const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  discoverArgoCdResources,
  buildArgoCdPluginContext,
} = require('../lib/plugins/argocd.cjs');

describe('argocd plugin', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-argocd-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeArgoFixture() {
    fs.mkdirSync(path.join(dir, 'argocd'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'argocd', 'applications.yaml'), `
apiVersion: argoproj.io/v1alpha1
kind: AppProject
metadata:
  name: platform
  namespace: argocd
spec:
  sourceRepos:
    - https://git.example/platform.git
  destinations:
    - namespace: prod
      server: https://kubernetes.default.svc
---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: platform-root
  namespace: argocd
spec:
  project: platform
  source:
    repoURL: https://git.example/platform.git
    path: services
    targetRevision: main
  destination:
    server: https://kubernetes.default.svc
    namespace: argocd
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
---
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: services
  namespace: argocd
spec:
  generators:
    - list:
        elements:
          - name: api
  template:
    spec:
      project: platform
      destination:
        namespace: prod
        server: https://kubernetes.default.svc
`, 'utf8');
  }

  test('discovers Argo CD resources and summarizes sync and project context', () => {
    writeArgoFixture();

    const resources = discoverArgoCdResources(dir);
    const context = buildArgoCdPluginContext(dir);

    expect(resources.map((resource) => resource.kind)).toEqual(expect.arrayContaining([
      'AppProject',
      'Application',
      'ApplicationSet',
    ]));
    expect(context.projects).toEqual([
      expect.objectContaining({
        name: 'platform',
        sourceRepos: ['https://git.example/platform.git'],
      }),
    ]);
    expect(context.applications).toEqual([
      expect.objectContaining({
        name: 'platform-root',
        project: 'platform',
        syncPolicy: expect.objectContaining({
          automated: true,
          prune: true,
          selfHeal: true,
        }),
      }),
    ]);
    expect(context.applicationSets).toEqual([
      expect.objectContaining({
        name: 'services',
        templateProject: 'platform',
      }),
    ]);
    expect(context.summary).toEqual(expect.objectContaining({
      applicationCount: 1,
      projectCount: 1,
      applicationSetCount: 1,
      automatedSyncCount: 1,
    }));
  });
});
