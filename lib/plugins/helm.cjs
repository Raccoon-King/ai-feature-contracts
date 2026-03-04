const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);
const SENSITIVE_KEY_PATTERN = /(secret|password|token|key|credential)/i;

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

  return files;
}

function readYamlFile(filePath) {
  return yaml.parse(fs.readFileSync(filePath, 'utf8')) || {};
}

function collectValueSummary(value, prefix = '') {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectValueSummary(entry, `${prefix}[${index}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, entryValue]) => {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      return collectValueSummary(entryValue, nextPrefix);
    });
  }
  return prefix ? [prefix] : [];
}

function summarizeValuesFile(filePath, baseDir) {
  const parsed = readYamlFile(filePath);
  const keys = collectValueSummary(parsed).sort();
  return {
    path: normalizeRepoPath(baseDir, filePath),
    keys: keys.slice(0, 50),
    sensitiveKeys: keys.filter((key) => SENSITIVE_KEY_PATTERN.test(key)).length,
  };
}

function findHelmCharts(baseDir, options = {}) {
  const roots = Array.isArray(options.roots) ? options.roots : [];
  return walk(baseDir, roots)
    .filter((filePath) => path.basename(filePath) === 'Chart.yaml')
    .sort()
    .map((chartPath) => path.dirname(chartPath));
}

function discoverHelmChart(chartDir, baseDir = chartDir) {
  const chartPath = path.join(chartDir, 'Chart.yaml');
  const chart = readYamlFile(chartPath);
  const templatesDir = path.join(chartDir, 'templates');
  const chartsDir = path.join(chartDir, 'charts');
  const templates = fs.existsSync(templatesDir)
    ? fs.readdirSync(templatesDir)
      .filter((file) => /\.(ya?ml|tpl)$/i.test(file))
      .sort()
      .map((file) => normalizeRepoPath(baseDir, path.join(templatesDir, file)))
    : [];
  const valuesFiles = fs.readdirSync(chartDir)
    .filter((file) => /^values.*\.ya?ml$/i.test(file))
    .sort()
    .map((file) => summarizeValuesFile(path.join(chartDir, file), baseDir));
  const vendoredDependencies = fs.existsSync(chartsDir)
    ? fs.readdirSync(chartsDir)
      .filter((file) => /\.(tgz|ya?ml)$/i.test(file) || fs.statSync(path.join(chartsDir, file)).isDirectory())
      .sort()
      .map((file) => normalizeRepoPath(baseDir, path.join(chartsDir, file)))
    : [];

  return {
    name: chart.name || path.basename(chartDir),
    version: chart.version || null,
    appVersion: chart.appVersion || null,
    type: chart.type || 'application',
    path: normalizeRepoPath(baseDir, chartDir),
    templates,
    valuesFiles,
    dependencies: (chart.dependencies || []).map((dependency) => ({
      name: dependency.name,
      version: dependency.version || null,
      repository: dependency.repository || null,
      condition: dependency.condition || null,
    })),
    vendoredDependencies,
  };
}

function discoverHelmCharts(baseDir, options = {}) {
  return findHelmCharts(baseDir, options).map((chartDir) => discoverHelmChart(chartDir, baseDir));
}

function buildHelmPluginContext(baseDir, options = {}) {
  const charts = discoverHelmCharts(baseDir, options);
  return {
    plugin: 'helm',
    generatedAt: new Date().toISOString(),
    charts,
    summary: {
      chartCount: charts.length,
      dependencyCount: charts.reduce((count, chart) => count + chart.dependencies.length, 0),
      templateCount: charts.reduce((count, chart) => count + chart.templates.length, 0),
      sensitiveValueFileCount: charts.reduce((count, chart) => count + chart.valuesFiles.filter((file) => file.sensitiveKeys > 0).length, 0),
    },
  };
}

module.exports = {
  findHelmCharts,
  discoverHelmChart,
  discoverHelmCharts,
  buildHelmPluginContext,
};
