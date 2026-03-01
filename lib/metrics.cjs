/**
 * Metrics collection and reporting for Grabby
 * Tracks contract completion stats, coverage trends, workflow analytics
 */

const fs = require('fs');
const path = require('path');
const { validateContract } = require('./core.cjs');
const { scoreContractComplexity } = require('./complexity.cjs');

/**
 * Collect metrics from all contracts in a directory
 */
function collectMetrics(contractsDir) {
  if (!fs.existsSync(contractsDir)) {
    return { contracts: [], summary: getEmptySummary() };
  }

  const files = fs.readdirSync(contractsDir).filter(f => f.endsWith('.fc.md'));
  const contracts = [];

  for (const file of files) {
    const filePath = path.join(contractsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const stats = fs.statSync(filePath);

    // Extract metadata
    const titleMatch = content.match(/^# FC:\s+(.+)$/m);
    const idMatch = content.match(/\*\*ID:\*\*\s*(FC-\d+)/);
    const statusMatch = content.match(/\*\*Status:\*\*\s*(\w+)/);

    // Run validation
    const validation = validateContract(content);
    const complexity = scoreContractComplexity(content);

    // Count done-when completion
    const doneWhenSection = content.match(/## Done When[\s\S]*?(?=## |$)/)?.[0] || '';
    const totalChecks = (doneWhenSection.match(/- \[[\sx]\]/g) || []).length;
    const completedChecks = (doneWhenSection.match(/- \[x\]/gi) || []).length;

    contracts.push({
      file,
      title: titleMatch?.[1] || file,
      id: idMatch?.[1] || 'unknown',
      status: statusMatch?.[1] || 'unknown',
      created: stats.birthtime,
      modified: stats.mtime,
      validation: {
        valid: validation.valid,
        errorCount: validation.errors.length,
        warningCount: validation.warnings.length,
      },
      complexity: {
        score: complexity.score,
        level: complexity.level,
      },
      progress: {
        total: totalChecks,
        completed: completedChecks,
        percentage: totalChecks > 0 ? Math.round((completedChecks / totalChecks) * 100) : 0,
      },
      stats: validation.stats,
    });
  }

  return {
    contracts,
    summary: calculateSummary(contracts),
  };
}

function getEmptySummary() {
  return {
    total: 0,
    byStatus: {},
    byComplexity: {},
    avgComplexity: 0,
    validationHealth: 0,
    overallProgress: 0,
  };
}

function calculateSummary(contracts) {
  if (contracts.length === 0) return getEmptySummary();

  const byStatus = {};
  const byComplexity = {};
  let totalComplexity = 0;
  let validCount = 0;
  let totalProgress = 0;

  for (const contract of contracts) {
    // Count by status
    byStatus[contract.status] = (byStatus[contract.status] || 0) + 1;

    // Count by complexity level
    byComplexity[contract.complexity.level] = (byComplexity[contract.complexity.level] || 0) + 1;

    // Sum metrics
    totalComplexity += contract.complexity.score;
    if (contract.validation.valid) validCount++;
    totalProgress += contract.progress.percentage;
  }

  return {
    total: contracts.length,
    byStatus,
    byComplexity,
    avgComplexity: Math.round((totalComplexity / contracts.length) * 10) / 10,
    validationHealth: Math.round((validCount / contracts.length) * 100),
    overallProgress: Math.round(totalProgress / contracts.length),
  };
}

/**
 * Generate a text report of metrics
 */
function generateReport(metrics, options = {}) {
  const { format = 'text' } = options;
  const { contracts, summary } = metrics;

  if (format === 'json') {
    return JSON.stringify(metrics, null, 2);
  }

  const lines = [];
  const hr = '═'.repeat(60);
  const thin = '─'.repeat(60);

  lines.push(hr);
  lines.push('GRABBY METRICS REPORT');
  lines.push(hr);
  lines.push('');

  // Summary section
  lines.push('SUMMARY');
  lines.push(thin);
  lines.push(`Total Contracts:     ${summary.total}`);
  lines.push(`Validation Health:   ${summary.validationHealth}%`);
  lines.push(`Avg Complexity:      ${summary.avgComplexity}/10`);
  lines.push(`Overall Progress:    ${summary.overallProgress}%`);
  lines.push('');

  // Status breakdown
  lines.push('BY STATUS');
  lines.push(thin);
  for (const [status, count] of Object.entries(summary.byStatus)) {
    const pct = Math.round((count / summary.total) * 100);
    const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));
    lines.push(`${status.padEnd(12)} ${bar} ${count} (${pct}%)`);
  }
  lines.push('');

  // Complexity breakdown
  lines.push('BY COMPLEXITY');
  lines.push(thin);
  for (const [level, count] of Object.entries(summary.byComplexity)) {
    const pct = Math.round((count / summary.total) * 100);
    lines.push(`${level.padEnd(12)} ${count} contracts (${pct}%)`);
  }
  lines.push('');

  // Individual contracts
  if (contracts.length > 0 && !options.summaryOnly) {
    lines.push('CONTRACTS');
    lines.push(thin);
    lines.push('');

    for (const contract of contracts) {
      const statusIcon = {
        draft: '📝',
        approved: '✓ ',
        executing: '⚡',
        complete: '✓✓',
      }[contract.status] || '? ';

      const validIcon = contract.validation.valid ? '✓' : '✗';
      const progressBar = '█'.repeat(Math.round(contract.progress.percentage / 10)) +
                         '░'.repeat(10 - Math.round(contract.progress.percentage / 10));

      lines.push(`${statusIcon} ${contract.title}`);
      lines.push(`   ID: ${contract.id} | Status: ${contract.status}`);
      lines.push(`   Complexity: ${contract.complexity.score}/10 (${contract.complexity.level})`);
      lines.push(`   Validation: ${validIcon} (${contract.validation.errorCount} errors, ${contract.validation.warningCount} warnings)`);
      lines.push(`   Progress: ${progressBar} ${contract.progress.percentage}% (${contract.progress.completed}/${contract.progress.total})`);
      lines.push('');
    }
  }

  lines.push(hr);
  lines.push(`Generated: ${new Date().toISOString()}`);

  return lines.join('\n');
}

/**
 * Save metrics history for trend analysis
 */
function saveMetricsSnapshot(metricsDir, metrics) {
  if (!fs.existsSync(metricsDir)) {
    fs.mkdirSync(metricsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotFile = path.join(metricsDir, `metrics-${timestamp}.json`);

  fs.writeFileSync(snapshotFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: metrics.summary,
    contractCount: metrics.contracts.length,
  }, null, 2));

  return snapshotFile;
}

/**
 * Load metrics history for trend analysis
 */
function loadMetricsHistory(metricsDir, limit = 30) {
  if (!fs.existsSync(metricsDir)) return [];

  const files = fs.readdirSync(metricsDir)
    .filter(f => f.startsWith('metrics-') && f.endsWith('.json'))
    .sort()
    .slice(-limit);

  return files.map(f => {
    const content = JSON.parse(fs.readFileSync(path.join(metricsDir, f), 'utf8'));
    return content;
  });
}

/**
 * Calculate trends from history
 */
function calculateTrends(history) {
  if (history.length < 2) {
    return { hasData: false };
  }

  const recent = history.slice(-7);
  const first = recent[0];
  const last = recent[recent.length - 1];

  return {
    hasData: true,
    period: `${first.timestamp.split('T')[0]} to ${last.timestamp.split('T')[0]}`,
    contractChange: last.contractCount - first.contractCount,
    healthChange: last.summary.validationHealth - first.summary.validationHealth,
    progressChange: last.summary.overallProgress - first.summary.overallProgress,
    complexityChange: Math.round((last.summary.avgComplexity - first.summary.avgComplexity) * 10) / 10,
  };
}

module.exports = {
  collectMetrics,
  calculateSummary,
  generateReport,
  saveMetricsSnapshot,
  loadMetricsHistory,
  calculateTrends,
};
