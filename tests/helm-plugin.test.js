const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  findHelmCharts,
  discoverHelmChart,
  discoverHelmCharts,
  buildHelmPluginContext,
} = require('../lib/plugins/helm.cjs');

describe('helm plugin', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-helm-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeChartFixture() {
    fs.mkdirSync(path.join(dir, 'deploy', 'helm', 'demo', 'templates'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'deploy', 'helm', 'demo', 'charts'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'deploy', 'helm', 'demo', 'Chart.yaml'), `
apiVersion: v2
name: demo
version: 1.2.3
appVersion: 9.9.9
dependencies:
  - name: redis
    version: 18.0.0
    repository: https://charts.bitnami.com/bitnami
`, 'utf8');
    fs.writeFileSync(path.join(dir, 'deploy', 'helm', 'demo', 'values.yaml'), `
image:
  repository: example/demo
auth:
  clientSecret: dont-print
`, 'utf8');
    fs.writeFileSync(path.join(dir, 'deploy', 'helm', 'demo', 'values.prod.yaml'), `
replicaCount: 3
`, 'utf8');
    fs.writeFileSync(path.join(dir, 'deploy', 'helm', 'demo', 'templates', 'deployment.yaml'), 'kind: Deployment\n', 'utf8');
    fs.writeFileSync(path.join(dir, 'deploy', 'helm', 'demo', 'templates', '_helpers.tpl'), '{{- define "x" -}}', 'utf8');
    fs.writeFileSync(path.join(dir, 'deploy', 'helm', 'demo', 'charts', 'redis-18.0.0.tgz'), 'binary', 'utf8');
  }

  test('finds and summarizes Helm charts deterministically', () => {
    writeChartFixture();

    const chartDirs = findHelmCharts(dir);
    const chart = discoverHelmChart(path.join(dir, 'deploy', 'helm', 'demo'), dir);
    const charts = discoverHelmCharts(dir);
    const context = buildHelmPluginContext(dir);

    expect(chartDirs).toEqual([path.join(dir, 'deploy', 'helm', 'demo')]);
    expect(chart).toEqual(expect.objectContaining({
      name: 'demo',
      version: '1.2.3',
      appVersion: '9.9.9',
      path: 'deploy/helm/demo',
    }));
    expect(chart.dependencies).toEqual([
      expect.objectContaining({ name: 'redis', version: '18.0.0' }),
    ]);
    expect(chart.templates).toEqual([
      'deploy/helm/demo/templates/_helpers.tpl',
      'deploy/helm/demo/templates/deployment.yaml',
    ]);
    expect(chart.valuesFiles[0]).toEqual(expect.objectContaining({
      path: 'deploy/helm/demo/values.prod.yaml',
    }));
    expect(charts).toHaveLength(1);
    expect(context.summary).toEqual(expect.objectContaining({
      chartCount: 1,
      dependencyCount: 1,
      templateCount: 2,
      sensitiveValueFileCount: 1,
    }));
  });
});
