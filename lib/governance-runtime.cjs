const fs = require('fs');
const { ensureDir } = require('./fs-utils.cjs');
const path = require('path');
const { execSync } = require('child_process');
const yaml = require('yaml');

function parseContractMetadata(content) {
  const section = content.match(/## Context Refs[\s\S]*?(?=##|$)/)?.[0] || '';
  const refs = {};
  section.split('\n').forEach((line) => {
    const m = line.match(/^[-*]\s*(ARCH|RULESET|ENV):\s*([\w-]+@v\d+)/i);
    if (m) refs[m[1].toUpperCase()] = m[2];
  });

  return {
    refs,
    archVersion: content.match(/^ARCH_VERSION:\s*(v\d+)/m)?.[1] || null,
    rulesetVersion: content.match(/^RULESET_VERSION:\s*(v\d+)/m)?.[1] || null,
    envVersion: content.match(/^ENV_VERSION:\s*(v\d+)/m)?.[1] || null,
    type: content.match(/^CONTRACT_TYPE:\s*(\w+)/m)?.[1] || 'FEATURE_CONTRACT',
  };
}

function estimateTokens(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 1.33);
}

function loadContextIndex(docsDir) {
  const indexPath = path.join(docsDir, 'context-index.yaml');
  if (!fs.existsSync(indexPath)) {
    throw new Error('Missing docs/context-index.yaml');
  }
  return yaml.parse(fs.readFileSync(indexPath, 'utf8'));
}


function listSections(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return Array.from(content.matchAll(/^##\s+(.+)$/gm)).map((m) => m[1].trim());
}

function suggestSections(target, sections) {
  const needle = String(target || '').toLowerCase();
  return sections
    .map((name) => ({ name, score: Math.abs(name.toLowerCase().length - needle.length) + (name.toLowerCase().includes(needle) || needle.includes(name.toLowerCase()) ? 0 : 5) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((item) => item.name);
}

function getDocSection(filePath, section) {
  const content = fs.readFileSync(filePath, 'utf8');
  const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(`^##\\s+${escaped}\\s*$[\\s\\S]*?(?=^##\\s+|$)`, 'im');
  return content.match(rx)?.[0] || null;
}

function resolveContextRefs({
  docsDir,
  contractContent,
  phase,
  tokenBudget,
  useDefaults = true,
  explicitOnly = false,
  maxSections = null,
}) {
  const index = loadContextIndex(docsDir);
  const { refs } = parseContractMetadata(contractContent);
  const phaseKey = phase.toLowerCase();
  const resolved = [];
  let tokenUsage = 0;
  const sectionLimit = Number.isInteger(maxSections) && maxSections > 0 ? maxSections : null;
  const explicitKinds = new Set(Object.keys(refs || {}));

  ['ARCH', 'RULESET', 'ENV'].forEach((kind) => {
    if (sectionLimit && resolved.length >= sectionLimit) return;
    if (explicitOnly && !explicitKinds.has(kind)) return;
    const ref = refs[kind] || (useDefaults ? index.defaults?.[kind] : null);
    if (!ref) {
      return;
    }
    const entry = index.references?.[kind]?.[ref];
    if (!entry) {
      throw new Error(`Unresolved context reference: ${kind}:${ref}`);
    }
    if (entry.status === 'deprecated') {
      throw new Error(`Deprecated context reference: ${kind}:${ref}`);
    }
    const phaseAllowed = entry.phases || ['plan', 'execute'];
    if (!phaseAllowed.includes(phaseKey)) return;
    const filePath = path.join(docsDir, entry.file);
    const section = getDocSection(filePath, entry.section);
    if (!section) {
      const available = listSections(filePath);
      const suggestions = suggestSections(entry.section, available);
      const suggestionText = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(', ')}?` : '';
      throw new Error(`[GRABBY] Section not found for ${kind}:${ref} in ${entry.file} -> ## ${entry.section}.${suggestionText} Update docs/context-index.yaml or add the missing heading.`);
    }
    const sectionTokens = estimateTokens(section);
    tokenUsage += sectionTokens;
    resolved.push({ kind, ref, file: entry.file, section: entry.section, tokens: sectionTokens, content: section });
  });

  if (tokenUsage > tokenBudget) {
    throw new Error(`Context token budget exceeded for ${phase}: ${tokenUsage}/${tokenBudget}`);
  }

  return { resolved, tokenUsage, tokenBudget };
}

function checkVersionCompatibility(contractContent, docsDir) {
  const index = loadContextIndex(docsDir);
  const metadata = parseContractMetadata(contractContent);
  const errors = [];
  const warnings = [];

  if (!metadata.archVersion || !metadata.rulesetVersion || !metadata.envVersion) {
    warnings.push('Missing version pins: ARCH_VERSION, RULESET_VERSION, ENV_VERSION');
  }

  const latest = index.versions?.latest || {};
  const deprecated = index.versions?.deprecated || {};

  [
    ['ARCH_VERSION', metadata.archVersion],
    ['RULESET_VERSION', metadata.rulesetVersion],
    ['ENV_VERSION', metadata.envVersion],
  ].forEach(([key, version]) => {
    if (!version) return;
    if (deprecated[key]?.includes(version)) {
      errors.push(`${key} uses deprecated version ${version}`);
    } else if (latest[key] && version !== latest[key]) {
      warnings.push(`${key} is not latest (${version} < ${latest[key]})`);
    }
  });

  return { errors, warnings, metadata };
}

function parsePlanFilePaths(planData) {
  return new Set((planData.files || []).map((item) => normalizeScopePath(item.path)));
}

function normalizeScopePath(targetPath) {
  return String(targetPath || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
}

function isContractArtifactPath(targetPath) {
  const normalized = normalizeScopePath(targetPath);
  return /^contracts\/.+\.(fc\.md|plan\.yaml|audit\.md|brief\.md|prompt\.md|backlog\.yaml|execute\.md|session\.(json|yaml))$/i.test(normalized);
}

function parseContractDirectories(contractContent) {
  const dirsSection = contractContent.match(/## Directories[\s\S]*?(?=##|$)/)?.[0] || '';
  const allowed = (dirsSection.match(/\*\*Allowed:\*\*\s*(.+)$/m)?.[1] || '')
    .split(',').map((d) => d.trim().replace(/`/g, '')).filter(Boolean);
  const restricted = (dirsSection.match(/\*\*Restricted:\*\*\s*(.+)$/m)?.[1] || '')
    .split(',').map((d) => d.trim().replace(/`/g, '')).filter(Boolean);
  return { allowed, restricted };
}

function getChangedFiles(cwd) {
  try {
    const out = execSync('git status --porcelain', { cwd, encoding: 'utf8' });
    if (!out || !out.trim()) return [];
    return out
      .split('\n')
      .map((line) => line.replace(/\r$/, ''))
      .filter(Boolean)
      .map((line) => line.slice(3).trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function validateExecutionScope({ cwd, planData, contractContent, changedFiles = null }) {
  const changed = (Array.isArray(changedFiles) ? changedFiles : getChangedFiles(cwd))
    .map((file) => normalizeScopePath(file));
  const actionableChanges = changed.filter((file) => !isContractArtifactPath(file));
  const planned = parsePlanFilePaths(planData);
  const { allowed, restricted } = parseContractDirectories(contractContent);
  const normalizedAllowed = allowed.map((dir) => normalizeScopePath(dir));
  const normalizedRestricted = restricted.map((dir) => normalizeScopePath(dir).replace(/\*$/, ''));
  const violations = [];

  actionableChanges.forEach((file) => {
    const normalized = normalizeScopePath(file);
    const inRestricted = normalizedRestricted.some((dir) => normalized.startsWith(dir));
    if (inRestricted) violations.push(`Restricted directory modified: ${normalized}`);

    const existsInPlan = planned.has(normalized);
    const existsOnDisk = fs.existsSync(path.join(cwd, normalized));

    if (!existsInPlan) violations.push(`Out-of-scope file modified: ${normalized}`);

    if (!existsOnDisk) return;
    if (!existsInPlan) {
      const inAllowed = normalizedAllowed.some((dir) => normalized.startsWith(dir));
      if (!inAllowed) violations.push(`New/modified file outside allowed directories: ${normalized}`);
    }
  });

  return { valid: violations.length === 0, violations, changedFiles: actionableChanges };
}

function collectFeatureMetrics({ cwd, contractFileName, planData, contextStats, violations }) {
  let numstat = '';
  try {
    numstat = execSync('git diff --numstat', { cwd, encoding: 'utf8' }).trim();
  } catch {
    numstat = '';
  }
  let linesChanged = 0;
  if (numstat) {
    numstat.split('\n').forEach((line) => {
      const [adds, dels] = line.split('\t');
      linesChanged += (parseInt(adds, 10) || 0) + (parseInt(dels, 10) || 0);
    });
  }
  const changedFiles = getChangedFiles(cwd);
  const planned = parsePlanFilePaths(planData);
  const outOfPlan = changedFiles.filter((f) => !planned.has(f));

  return {
    feature: contractFileName.replace(/\.fc\.md$/, ''),
    timestamp: new Date().toISOString(),
    token_usage: {
      plan: contextStats?.plan || 0,
      execute: contextStats?.execute || 0,
      total: (contextStats?.plan || 0) + (contextStats?.execute || 0),
    },
    files_modified: changedFiles.length,
    lines_changed: linesChanged,
    rule_violations_detected: violations.length,
    plan_execution_drift: {
      out_of_plan_files: outOfPlan,
      drift_count: outOfPlan.length,
    },
  };
}

function saveFeatureMetrics(metricsDir, metrics) {
  ensureDir(metricsDir);
  const target = path.join(metricsDir, `${metrics.feature}.metrics.json`);
  fs.writeFileSync(target, `${JSON.stringify(metrics, null, 2)}\n`);
  return target;
}

function summarizeFeatureMetrics(metricsDir) {
  if (!fs.existsSync(metricsDir)) {
    return { features: 0, total_tokens: 0, total_files_modified: 0, total_lines_changed: 0, total_violations: 0, total_drift: 0 };
  }
  const files = fs.readdirSync(metricsDir).filter((f) => f.endsWith('.metrics.json'));
  const entries = files.map((file) => JSON.parse(fs.readFileSync(path.join(metricsDir, file), 'utf8')));
  return {
    features: entries.length,
    total_tokens: entries.reduce((sum, e) => sum + (e.token_usage?.total || 0), 0),
    total_files_modified: entries.reduce((sum, e) => sum + (e.files_modified || 0), 0),
    total_lines_changed: entries.reduce((sum, e) => sum + (e.lines_changed || 0), 0),
    total_violations: entries.reduce((sum, e) => sum + (e.rule_violations_detected || 0), 0),
    total_drift: entries.reduce((sum, e) => sum + (e.plan_execution_drift?.drift_count || 0), 0),
  };
}

function upgradeContractVersions(content, docsDir) {
  const index = loadContextIndex(docsDir);
  const latest = index.versions?.latest || {};
  return content
    .replace(/^ARCH_VERSION:\s*v\d+/m, `ARCH_VERSION: ${latest.ARCH_VERSION || 'v1'}`)
    .replace(/^RULESET_VERSION:\s*v\d+/m, `RULESET_VERSION: ${latest.RULESET_VERSION || 'v1'}`)
    .replace(/^ENV_VERSION:\s*v\d+/m, `ENV_VERSION: ${latest.ENV_VERSION || 'v1'}`);
}


function lintContextIndex(docsDir) {
  const indexPath = path.join(docsDir, 'context-index.yaml');
  const index = loadContextIndex(docsDir);
  const errors = [];

  ['ARCH', 'RULESET', 'ENV'].forEach((kind) => {
    const refs = index.references?.[kind] || {};
    const seen = new Set();
    Object.entries(refs).forEach(([key, entry]) => {
      if (seen.has(key)) errors.push(`[GRABBY] Duplicate key in ${indexPath}: ${kind}:${key}`);
      seen.add(key);
      const target = path.join(docsDir, entry.file || '');
      if (!entry.file || !fs.existsSync(target)) {
        errors.push(`[GRABBY] Missing file for ${kind}:${key} -> ${entry.file || '<empty>'}. Add the file or fix docs/context-index.yaml.`);
        return;
      }
      const section = getDocSection(target, entry.section || '');
      if (!entry.section || !section) {
        errors.push(`[GRABBY] Missing section for ${kind}:${key} in ${entry.file} -> ## ${entry.section || '<empty>'}. Add the section heading.`);
      }
      if (entry.token_budget !== undefined && Number.isNaN(Number(entry.token_budget))) {
        errors.push(`[GRABBY] Non-numeric token_budget for ${kind}:${key}. Use a number.`);
      }
    });
  });

  return { valid: errors.length === 0, errors };
}

function findCompletedContractsInActive(cwd) {
  const activeDir = path.join(cwd, 'contracts', 'active');
  if (!fs.existsSync(activeDir)) {
    return [];
  }

  return fs.readdirSync(activeDir)
    .filter((file) => file.endsWith('.fc.md'))
    .filter((file) => {
      const content = fs.readFileSync(path.join(activeDir, file), 'utf8');
      const status = String(content.match(/\*\*Status:\*\*\s*([^\n\r|]+)/i)?.[1] || '').trim().toLowerCase();
      return ['complete', 'completed'].includes(status);
    })
    .map((file) => path.join('contracts', 'active', file).replace(/\\/g, '/'));
}

/**
 * Check if a plan file exists for a contract
 */
function checkPlanExists(contractId, cwd) {
  const normalizedId = String(contractId || '').trim().toUpperCase();
  const planPaths = [
    path.join(cwd, 'contracts', `${normalizedId}.plan.yaml`),
    path.join(cwd, 'contracts', 'active', `${normalizedId}.plan.yaml`),
  ];
  for (const planPath of planPaths) {
    if (fs.existsSync(planPath)) {
      return { exists: true, path: planPath };
    }
  }
  return { exists: false, path: null };
}

/**
 * Check if a plan is approved (has approval_token: Approved)
 */
function checkApprovalStatus(planPath) {
  if (!planPath || !fs.existsSync(planPath)) {
    return { approved: false, reason: 'Plan file not found' };
  }
  try {
    const planData = yaml.parse(fs.readFileSync(planPath, 'utf8'));
    if (planData.approval_token === 'Approved') {
      return { approved: true, approvedAt: planData.approved_at || null };
    }
    return { approved: false, reason: 'Missing approval_token: Approved' };
  } catch (err) {
    return { approved: false, reason: `Failed to parse plan: ${err.message}` };
  }
}

/**
 * Validate that execution can proceed for a contract
 */
function validateExecutionGate(contractId, cwd) {
  const errors = [];
  const warnings = [];

  // Check contract exists
  const normalizedId = String(contractId || '').trim().toUpperCase();
  const contractPaths = [
    path.join(cwd, 'contracts', `${normalizedId}.fc.md`),
    path.join(cwd, 'contracts', 'active', `${normalizedId}.fc.md`),
  ];
  const contractPath = contractPaths.find((p) => fs.existsSync(p));
  if (!contractPath) {
    errors.push(`Contract not found: ${normalizedId}`);
    return { valid: false, errors, warnings };
  }

  // Check plan exists
  const planCheck = checkPlanExists(normalizedId, cwd);
  if (!planCheck.exists) {
    errors.push(`Plan not found for ${normalizedId}. Run: grabby plan ${normalizedId}`);
    return { valid: false, errors, warnings };
  }

  // Check approval
  const approvalCheck = checkApprovalStatus(planCheck.path);
  if (!approvalCheck.approved) {
    errors.push(`Execution blocked: ${approvalCheck.reason}. Run: grabby approve ${normalizedId}`);
    return { valid: false, errors, warnings };
  }

  return { valid: true, errors, warnings, planPath: planCheck.path, contractPath };
}

/**
 * Detect if a request looks like a feature/change request without a contract reference
 */
function detectUncontractedRequest(requestText) {
  const text = String(requestText || '').toLowerCase();
  const featureKeywords = [
    'implement', 'add', 'create', 'build', 'fix', 'refactor',
    'change', 'update', 'modify', 'enhance', 'improve', 'feature',
  ];
  const hasFeatureKeyword = featureKeywords.some((kw) => text.includes(kw));
  const hasContractRef = /contracts\/[A-Z][A-Z0-9]+-\d+\.fc\.md/i.test(requestText)
    || /\b[A-Z][A-Z0-9]+-\d+\b/.test(requestText);

  return {
    isFeatureRequest: hasFeatureKeyword,
    hasContractRef,
    needsRouting: hasFeatureKeyword && !hasContractRef,
  };
}

module.exports = {
  parseContractMetadata,
  resolveContextRefs,
  checkVersionCompatibility,
  validateExecutionScope,
  collectFeatureMetrics,
  saveFeatureMetrics,
  summarizeFeatureMetrics,
  upgradeContractVersions,
  lintContextIndex,
  findCompletedContractsInActive,
  checkPlanExists,
  checkApprovalStatus,
  validateExecutionGate,
  detectUncontractedRequest,
};
