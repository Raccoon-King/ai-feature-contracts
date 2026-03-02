const fs = require('fs');
const os = require('os');
const path = require('path');
const { collectMetrics, generateReport, saveMetricsSnapshot, loadMetricsHistory, calculateTrends } = require('../lib/metrics.cjs');

describe('metrics', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metrics-'));
    const contracts = path.join(dir, 'contracts');
    fs.mkdirSync(contracts);
    fs.writeFileSync(path.join(contracts, 'a.fc.md'), '# FC: A\n**ID:** FC-1 | **Status:** approved\n## Objective\nOk\n## Scope\n- one\n## Done When\n- done\n');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('collects and reports metrics', () => {
    const data = collectMetrics(path.join(dir, 'contracts'));
    expect(data.summary.total).toBe(1);
    expect(generateReport(data)).toContain('GRABBY METRICS REPORT');
  });

  test('saves and loads history with trends', () => {
    const metricsDir = path.join(dir, '.grabby', 'metrics');
    const data = collectMetrics(path.join(dir, 'contracts'));
    saveMetricsSnapshot(metricsDir, data);
    saveMetricsSnapshot(metricsDir, data);
    const history = loadMetricsHistory(metricsDir, 10);
    expect(history.length).toBeGreaterThan(0);
    expect(calculateTrends(history)).toHaveProperty('hasData');
  });
});
