const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  discoverKubernetesResources,
  buildKubernetesRelationships,
  buildKubernetesPluginContext,
} = require('../lib/plugins/kubernetes.cjs');

describe('kubernetes plugin', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-k8s-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeManifestFixture() {
    fs.mkdirSync(path.join(dir, 'deploy', 'k8s'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'deploy', 'k8s', 'app.yaml'), `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: prod
spec:
  template:
    metadata:
      labels:
        app: web
    spec:
      serviceAccountName: web-sa
      containers:
        - name: web
          image: example/web
          envFrom:
            - configMapRef:
                name: web-config
---
apiVersion: v1
kind: Service
metadata:
  name: web
  namespace: prod
spec:
  selector:
    app: web
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
  namespace: prod
spec:
  rules:
    - host: example.test
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 80
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: web-config
  namespace: prod
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: web-sa
  namespace: prod
`, 'utf8');
  }

  test('discovers Kubernetes resources and derives relationships', () => {
    writeManifestFixture();

    const resources = discoverKubernetesResources(dir);
    const relationships = buildKubernetesRelationships(resources);
    const context = buildKubernetesPluginContext(dir);

    expect(resources.map((resource) => resource.kind)).toEqual(expect.arrayContaining([
      'Deployment',
      'Service',
      'Ingress',
      'ConfigMap',
      'ServiceAccount',
    ]));
    expect(relationships).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'service-target',
        from: 'Service:prod:web',
        to: 'Deployment:prod:web',
      }),
      expect.objectContaining({
        type: 'ingress-route',
        from: 'Ingress:prod:web',
        to: 'Service:prod:web',
      }),
      expect.objectContaining({
        type: 'configMap-reference',
        from: 'Deployment:prod:web',
        to: 'ConfigMap:prod:web-config',
      }),
      expect.objectContaining({
        type: 'service-account',
        from: 'Deployment:prod:web',
        to: 'ServiceAccount:prod:web-sa',
      }),
    ]));
    expect(context.summary).toEqual(expect.objectContaining({
      resourceCount: 5,
      namespaceCount: 1,
      workloadCount: 1,
    }));
  });
});
