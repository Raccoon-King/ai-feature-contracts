const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  discoverOpenShiftResources,
  buildOpenShiftRelationships,
  buildOpenShiftPluginContext,
} = require('../lib/plugins/openshift.cjs');

describe('openshift plugin', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-openshift-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeFixture() {
    fs.mkdirSync(path.join(dir, 'openshift'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'openshift', 'app.yaml'), `
apiVersion: v1
kind: Service
metadata:
  name: web
  namespace: prod
---
apiVersion: route.openshift.io/v1
kind: Route
metadata:
  name: web
  namespace: prod
spec:
  to:
    kind: Service
    name: web
---
apiVersion: image.openshift.io/v1
kind: ImageStream
metadata:
  name: web
  namespace: prod
---
apiVersion: apps.openshift.io/v1
kind: DeploymentConfig
metadata:
  name: web
  namespace: prod
spec:
  triggers:
    - type: ImageChange
      imageChangeParams:
        from:
          kind: ImageStreamTag
          name: web:latest
---
apiVersion: template.openshift.io/v1
kind: Template
metadata:
  name: web-template
  namespace: prod
objects:
  - apiVersion: v1
    kind: Service
    metadata:
      name: generated-web
---
apiVersion: security.openshift.io/v1
kind: SecurityContextConstraints
metadata:
  name: restricted-v2
---
apiVersion: project.openshift.io/v1
kind: Project
metadata:
  name: prod
`, 'utf8');
  }

  test('discovers OpenShift resources and relationship context', () => {
    writeFixture();

    const resources = discoverOpenShiftResources(dir);
    const relationships = buildOpenShiftRelationships(resources);
    const context = buildOpenShiftPluginContext(dir);

    expect(resources.map((resource) => resource.kind)).toEqual(expect.arrayContaining([
      'Route',
      'ImageStream',
      'DeploymentConfig',
      'Template',
      'SecurityContextConstraints',
      'Project',
    ]));
    expect(relationships).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'route-service',
        from: 'Route:prod:web',
        to: 'Service:prod:web',
      }),
      expect.objectContaining({
        type: 'deploymentconfig-imagestream',
        from: 'DeploymentConfig:prod:web',
        to: 'ImageStream:prod:web',
      }),
      expect.objectContaining({
        type: 'template-object',
        from: 'Template:prod:web-template',
        to: 'Service:prod:generated-web',
      }),
    ]));
    expect(context.summary).toEqual(expect.objectContaining({
      routeCount: 1,
      templateCount: 1,
      securityConstraintCount: 1,
      projectCount: 1,
    }));
  });
});
