/**
 * Complexity scoring for contracts and code
 * Provides metrics to assess contract scope and implementation risk
 */

/**
 * Calculate contract complexity score
 * Returns a score from 1-10 with breakdown
 */
function scoreContractComplexity(content) {
  const scores = {
    scope: 0,
    files: 0,
    dependencies: 0,
    security: 0,
    integration: 0,
  };

  // Scope complexity (based on bullet points in Scope section)
  const scopeMatch = content.match(/## Scope[\s\S]*?(?=## |$)/);
  if (scopeMatch) {
    const bullets = (scopeMatch[0].match(/^[\s]*[-*]/gm) || []).length;
    scores.scope = Math.min(bullets / 2, 3); // Max 3 points
  }

  // Files complexity (based on file count and actions)
  const filesMatch = content.match(/## Files[\s\S]*?(?=## |$)/);
  if (filesMatch) {
    const creates = (filesMatch[0].match(/\|\s*create\s*\|/gi) || []).length;
    const modifies = (filesMatch[0].match(/\|\s*modify\s*\|/gi) || []).length;
    scores.files = Math.min((creates * 0.5 + modifies * 0.3), 2); // Max 2 points
  }

  // Dependencies complexity
  const depsMatch = content.match(/## Dependencies[\s\S]*?(?=## |$)/);
  if (depsMatch) {
    const newDeps = (depsMatch[0].match(/new|add|install/gi) || []).length;
    scores.dependencies = Math.min(newDeps * 0.5, 1.5); // Max 1.5 points
  }

  // Security complexity (more security concerns = higher complexity)
  const securityMatch = content.match(/## Security[\s\S]*?(?=## |$)/);
  if (securityMatch) {
    const checks = (securityMatch[0].match(/\[[\sx]\]/gi) || []).length;
    scores.security = Math.min(checks * 0.3, 2); // Max 2 points
  }

  // Integration complexity (API, external services, etc.)
  const integrationKeywords = ['api', 'endpoint', 'webhook', 'external', 'third-party', 'integration', 'database', 'auth'];
  const lowerContent = content.toLowerCase();
  const integrationHits = integrationKeywords.filter(k => lowerContent.includes(k)).length;
  scores.integration = Math.min(integrationHits * 0.25, 1.5); // Max 1.5 points

  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const normalized = Math.min(Math.round(total * 10) / 10, 10);

  return {
    score: normalized,
    breakdown: scores,
    level: getComplexityLevel(normalized),
    recommendations: getRecommendations(scores),
  };
}

function getComplexityLevel(score) {
  if (score <= 2) return 'trivial';
  if (score <= 4) return 'simple';
  if (score <= 6) return 'moderate';
  if (score <= 8) return 'complex';
  return 'very-complex';
}

function getRecommendations(scores) {
  const recs = [];

  if (scores.scope > 2) {
    recs.push('Consider splitting into multiple contracts');
  }
  if (scores.files > 1.5) {
    recs.push('Many file changes - ensure thorough testing');
  }
  if (scores.dependencies > 1) {
    recs.push('New dependencies increase maintenance burden');
  }
  if (scores.security > 1.5) {
    recs.push('Security-sensitive - consider security review');
  }
  if (scores.integration > 1) {
    recs.push('External integrations may need mocking in tests');
  }

  return recs;
}

/**
 * Estimate lines of code from contract
 */
function estimateLOC(content) {
  const filesMatch = content.match(/## Files[\s\S]*?(?=## |$)/);
  if (!filesMatch) return { estimated: 0, confidence: 'low' };

  const creates = (filesMatch[0].match(/\|\s*create\s*\|/gi) || []).length;
  const modifies = (filesMatch[0].match(/\|\s*modify\s*\|/gi) || []).length;

  // Rough estimates: new file ~100 LOC, modify ~30 LOC
  const estimated = creates * 100 + modifies * 30;

  return {
    estimated,
    confidence: creates + modifies > 5 ? 'medium' : 'low',
    newFiles: creates,
    modifiedFiles: modifies,
  };
}

/**
 * Analyze risk factors in contract
 */
function analyzeRisks(content) {
  const risks = [];
  const lowerContent = content.toLowerCase();

  // High-risk patterns
  const riskPatterns = [
    { pattern: /authentication|auth|login|password/i, risk: 'Authentication changes - security critical', severity: 'high' },
    { pattern: /payment|billing|stripe|paypal/i, risk: 'Payment integration - requires careful testing', severity: 'high' },
    { pattern: /database|migration|schema/i, risk: 'Database changes - ensure rollback plan', severity: 'medium' },
    { pattern: /delete|remove|drop/i, risk: 'Destructive operations - verify safeguards', severity: 'medium' },
    { pattern: /refactor|rewrite|restructure/i, risk: 'Refactoring - maintain test coverage', severity: 'medium' },
    { pattern: /api.*breaking|breaking.*change/i, risk: 'Breaking API change - version appropriately', severity: 'high' },
    { pattern: /external|third-party|vendor/i, risk: 'External dependency - check SLA/reliability', severity: 'low' },
    { pattern: /performance|optimize|cache/i, risk: 'Performance work - establish baselines first', severity: 'low' },
  ];

  for (const { pattern, risk, severity } of riskPatterns) {
    if (pattern.test(content)) {
      risks.push({ risk, severity });
    }
  }

  // Check for missing sections
  const requiredSections = ['Scope', 'Files', 'Done When', 'Testing'];
  for (const section of requiredSections) {
    if (!content.includes(`## ${section}`)) {
      risks.push({ risk: `Missing ${section} section`, severity: 'medium' });
    }
  }

  return {
    risks,
    highCount: risks.filter(r => r.severity === 'high').length,
    mediumCount: risks.filter(r => r.severity === 'medium').length,
    lowCount: risks.filter(r => r.severity === 'low').length,
  };
}

/**
 * Check for common contract anti-patterns
 */
function checkAntiPatterns(content) {
  const issues = [];

  // Too broad scope
  const scopeMatch = content.match(/## Scope[\s\S]*?(?=## |$)/);
  if (scopeMatch) {
    const bullets = (scopeMatch[0].match(/^[\s]*[-*]/gm) || []).length;
    if (bullets > 10) {
      issues.push({ type: 'broad-scope', message: 'Scope has too many items (>10). Consider splitting.' });
    }
  }

  // Vague objectives
  const vagueTerms = ['improve', 'enhance', 'better', 'optimize', 'fix various', 'update some'];
  const objectiveMatch = content.match(/## Objective[\s\S]*?(?=## |$)/);
  if (objectiveMatch) {
    for (const term of vagueTerms) {
      if (objectiveMatch[0].toLowerCase().includes(term)) {
        issues.push({ type: 'vague-objective', message: `Vague term "${term}" in objective. Be specific.` });
      }
    }
  }

  // Missing test files
  const filesSection = content.match(/## Files[\s\S]*?(?=## |$)/);
  if (filesSection && !filesSection[0].includes('test')) {
    issues.push({ type: 'missing-tests', message: 'No test files in Files section.' });
  }

  // No done-when criteria
  const doneWhen = content.match(/## Done When[\s\S]*?(?=## |$)/);
  if (doneWhen) {
    const checkboxes = (doneWhen[0].match(/\[[\sx]\]/gi) || []).length;
    if (checkboxes === 0) {
      issues.push({ type: 'no-criteria', message: 'Done When has no checkboxes.' });
    }
  }

  // Unrestricted directories
  const dirsMatch = content.match(/\*\*Allowed:\*\*\s*`([^`]+)`/);
  if (dirsMatch && dirsMatch[1].includes('*')) {
    issues.push({ type: 'unrestricted-dirs', message: 'Wildcard in allowed directories is too permissive.' });
  }

  return issues;
}

module.exports = {
  scoreContractComplexity,
  getComplexityLevel,
  estimateLOC,
  analyzeRisks,
  checkAntiPatterns,
};
