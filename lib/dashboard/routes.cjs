'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

const { loadConfig, loadRulesetsConfig } = require('../config.cjs');
const { createProjectContext, createCommandHandlers } = require('../commands.cjs');
const features = require('../features.cjs');
const core = require('../core.cjs');
const commandCatalog = require('./commands.cjs');
const { listRulesets } = require('../ruleset-registry.cjs');
const { readLock, isLockStale, getLockAge } = require('../sync-lock.cjs');
const manifestParser = require('../rulesets/common/manifest-parser.cjs');

const COMPLETE_STATUSES = new Set(['complete', 'completed']);

const CONTRACT_ID_PATTERN = /^[A-Za-z][A-Za-z0-9-]*$/;
const ALLOWED_STATUSES = new Set(['draft', 'approved', 'executing', 'complete', 'completed', 'paused']);

function sanitizeContractId(id) {
  const normalized = String(id || '').trim();
  if (!normalized || !CONTRACT_ID_PATTERN.test(normalized) || normalized !== path.basename(normalized)) {
    return null;
  }
  return normalized.toUpperCase();
}

function readTextIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath, 'utf8');
}

function readTimestamp(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  return fs.statSync(filePath).mtime.toISOString();
}

function extractSection(content, heading) {
  return String(content || '').match(new RegExp(`## ${heading}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, 'i'))?.[1]?.trim() || '';
}

function extractChecklist(content, heading) {
  return extractSection(content, heading)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^- \[[ xX]\]/.test(line))
    .map((line) => ({
      text: line.replace(/^- \[[ xX]\]\s*/, ''),
      done: /^- \[[xX]\]/.test(line),
    }));
}

function getWorkflowModel() {
  return {
    phases: [
      { id: 'create', name: 'Create', description: 'Contract exists and can be edited.' },
      { id: 'validate', name: 'Validate', description: 'Run structure and governance validation.' },
      { id: 'plan', name: 'Plan', description: 'Generate the scoped implementation plan.' },
      { id: 'approve', name: 'Approve', description: 'Record approval before implementation.' },
      { id: 'execute', name: 'Execute', description: 'Implement within the approved scope.' },
      { id: 'audit', name: 'Audit', description: 'Capture verification results and findings.' },
      { id: 'complete', name: 'Complete', description: 'Contract is done and ready to close.' },
    ],
    transitions: [
      { from: 'create', to: 'validate' },
      { from: 'validate', to: 'plan' },
      { from: 'plan', to: 'approve' },
      { from: 'approve', to: 'execute' },
      { from: 'execute', to: 'audit' },
      { from: 'audit', to: 'complete' },
    ],
  };
}

function getMode(cwd) {
  const config = loadConfig(cwd) || {};
  return {
    externalLlmOnly: config.workflow?.externalLlmOnly === true,
  };
}

function getRulesetsRuntimeConfig(cwd) {
  const config = loadConfig(cwd) || {};
  const rulesetsConfig = loadRulesetsConfig(cwd, config) || config?.rulesets || null;

  return { config, rulesetsConfig };
}

function getLockRulesetRef(ruleset) {
  if (!ruleset || typeof ruleset !== 'object') return '';

  const category = String(ruleset.category || '').trim();
  const name = String(ruleset.name || '').trim();

  if (category.includes('/')) {
    return category;
  }

  if (category && name) {
    return `${category}/${name}`;
  }

  return category;
}

function getRulesManifestPath(cwd, rulesetsConfig) {
  const cacheDir = rulesetsConfig?.cacheDir || '.grabby/rulesets/cache';
  const candidates = [
    path.join(cwd, cacheDir, 'central-repo', 'manifest.yaml'),
    path.join(cwd, '.grabby', 'rulesets', 'central-repo', 'manifest.yaml'),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function listLocalRules(cwd) {
  return listRulesets(cwd).filter((ruleset) => ruleset.type !== 'remote');
}

function listRepoRules(cwd, rulesetsConfig, lock = null) {
  const manifestPath = getRulesManifestPath(cwd, rulesetsConfig);
  if (!fs.existsSync(manifestPath)) {
    return [];
  }

  const manifest = manifestParser.parseManifestFile(manifestPath);
  const lockEntries = new Map((lock?.active || []).map((entry) => [getLockRulesetRef(entry), entry]));
  const configuredActive = new Set(rulesetsConfig?.active || []);

  return manifestParser.getAllRulesets(manifest)
    .map((ruleset) => {
      const lockEntry = lockEntries.get(ruleset.ref);
      const isActive = configuredActive.has(ruleset.ref) || Boolean(lockEntry);

      return {
        ref: ruleset.ref,
        category: ruleset.category,
        name: ruleset.name,
        description: ruleset.description || '',
        version: lockEntry?.version || ruleset.version || null,
        tags: Array.isArray(ruleset.tags) ? ruleset.tags : [],
        extends: Array.isArray(ruleset.extends) ? ruleset.extends : [],
        active: isActive,
        hash: lockEntry?.hash || null,
        fetchedAt: lockEntry?.fetchedAt || lock?.lastSync || null,
      };
    })
    .sort((left, right) => left.ref.localeCompare(right.ref));
}

function readRepoRulesetContent(cwd, rulesetsConfig, ref) {
  if (typeof ref !== 'string' || !ref.includes('/')) {
    return null;
  }

  const [category, name] = ref.split('/');
  const cacheDir = rulesetsConfig?.cacheDir || '.grabby/rulesets/cache';
  const candidates = [
    path.join(cwd, cacheDir, 'central-repo', category, `${name}.md`),
    path.join(cwd, cacheDir, 'central-repo', 'rulesets', category, `${name}.yaml`),
    path.join(cwd, cacheDir, 'central-repo', 'rulesets', category, `${name}.yml`),
    path.join(cwd, cacheDir, category, `${name}.md`),
    path.join(cwd, '.grabby', 'rulesets', 'cache', category, `${name}.md`),
  ];

  const contentPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!contentPath) {
    return null;
  }

  return {
    content: fs.readFileSync(contentPath, 'utf8'),
    contentPath: path.relative(cwd, contentPath),
  };
}

function readLocalRule(cwd, filePath) {
  const localRule = listLocalRules(cwd).find((entry) => entry.file === filePath);
  if (!localRule) {
    return null;
  }

  const resolvedPath = path.resolve(cwd, localRule.file);
  const relativePath = path.relative(cwd, resolvedPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath) || !fs.existsSync(resolvedPath)) {
    return null;
  }

  return {
    entry: localRule,
    content: fs.readFileSync(resolvedPath, 'utf8'),
  };
}

function getRulesetsStatus(cwd) {
  const result = {
    configured: false,
    local: [],
    repo: [],
    active: [],
    available: [],
    sync: null,
  };

  try {
    const { rulesetsConfig } = getRulesetsRuntimeConfig(cwd);

    // Get all discovered rulesets
    try {
      result.local = listLocalRules(cwd);
      result.available = result.local;
    } catch {
      result.local = [];
      result.available = [];
    }

    // Check if sync is configured
    const hasSource = Boolean(rulesetsConfig?.source?.repo && rulesetsConfig.source.repo.length > 0);
    result.configured = hasSource;

    let lock = null;

    // Try to read the sync lock
    try {
      const lockPath = rulesetsConfig?.lockPath || '.grabby/rulesets/sync.lock.yaml';
      lock = readLock(lockPath, cwd);

      if (lock) {
        const syncInterval = rulesetsConfig?.sync?.interval || '24h';
        const maxAgeMs = parseSyncInterval(syncInterval);
        const stale = isLockStale(lock, maxAgeMs);
        const ageMs = getLockAge(lock);

        result.sync = {
          lastSync: lock.lastSync,
          source: lock.source || {},
          stale,
          ageMs,
          ageHours: Math.floor(ageMs / (60 * 60 * 1000)),
          mode: rulesetsConfig?.sync?.mode || 'warn',
        };
      }
    } catch {
      // No lock file or invalid
    }

    try {
      result.repo = listRepoRules(cwd, rulesetsConfig, lock);
      result.active = result.repo.filter((ruleset) => ruleset.active);
    } catch {
      result.repo = [];
      result.active = [];
    }
  } catch {
    // Config loading failed, return defaults
  }

  return result;
}

function parseSyncInterval(interval) {
  if (typeof interval === 'number') return interval;
  const match = String(interval).match(/^(\d+)(h|m|d)?$/i);
  if (!match) return 24 * 60 * 60 * 1000;
  const value = parseInt(match[1], 10);
  const unit = (match[2] || 'h').toLowerCase();
  if (unit === 'd') return value * 24 * 60 * 60 * 1000;
  if (unit === 'm') return value * 60 * 1000;
  return value * 60 * 60 * 1000;
}

function getLifecyclePhase(contractStatus, planStatus, auditStatus) {
  const normalizedContract = String(contractStatus || '').toLowerCase();
  const normalizedPlan = String(planStatus || '').toLowerCase();
  const normalizedAudit = String(auditStatus || '').toLowerCase();

  if (normalizedContract === 'complete' || normalizedContract === 'completed') {
    return 'complete';
  }
  if (normalizedAudit) {
    return 'audit';
  }
  if (normalizedPlan === 'executing') {
    return 'execute';
  }
  if (normalizedPlan === 'approved' || normalizedContract === 'approved') {
    return 'approve';
  }
  if (normalizedPlan) {
    return 'plan';
  }
  return 'validate';
}

function buildTimeline(feature, planData, auditText, artifactPaths) {
  const auditStatus = String(auditText?.match(/- Status:\s*([^\n\r]+)/)?.[1] || '').trim() || null;
  const timeline = [
    {
      id: 'contract',
      label: 'Contract active',
      timestamp: feature.lastModifiedAt,
      detail: `Status: ${feature.status}`,
    },
  ];

  if (planData?.timestamp) {
    timeline.push({
      id: 'plan',
      label: 'Plan generated',
      timestamp: planData.timestamp,
      detail: `Plan status: ${planData.status || 'pending'}`,
    });
  }
  if (planData?.approved_at) {
    timeline.push({
      id: 'approve',
      label: 'Plan approved',
      timestamp: planData.approved_at,
      detail: `Token: ${planData.approval_token || 'Approved'}`,
    });
  }
  if (planData?.executed_at) {
    timeline.push({
      id: 'execute',
      label: 'Execution handoff recorded',
      timestamp: planData.executed_at,
      detail: `Plan status: ${planData.status || 'executing'}`,
    });
  }
  if (auditText) {
    timeline.push({
      id: 'audit',
      label: 'Audit artifact written',
      timestamp: readTimestamp(artifactPaths.auditPath),
      detail: `Audit status: ${auditStatus || 'recorded'}`,
    });
  }
  if (feature.status === 'complete' || feature.status === 'completed') {
    timeline.push({
      id: 'complete',
      label: 'Contract marked complete',
      timestamp: feature.lastModifiedAt,
      detail: 'Done-when criteria should be fully checked.',
    });
  }

  return timeline
    .filter((entry) => entry.timestamp)
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
}

function createBufferedHandlers(cwd) {
  const lines = [];
  const logger = {
    log: (...values) => lines.push(values.join(' ')),
    warn: (...values) => lines.push(values.join(' ')),
    error: (...values) => lines.push(values.join(' ')),
  };

  const context = createProjectContext({
    cwd,
    pkgRoot: path.join(__dirname, '..', '..'),
  });
  const handlers = createCommandHandlers({
    context,
    logger,
    exit: (code) => {
      const error = new Error(`Command exited with code ${code}`);
      error.exitCode = code;
      throw error;
    },
  });

  return { handlers, lines };
}

function getArtifactPaths(id, cwd) {
  return features.getFeatureArtifactPaths(id, cwd);
}

function buildAvailableActions(detail, mode) {
  const planStatus = String(detail.plan?.status || '').toLowerCase();
  const contractStatus = String(detail.status || '').toLowerCase();
  const isComplete = COMPLETE_STATUSES.has(contractStatus);

  return [
    { id: 'validate', label: 'Validate', enabled: true, note: 'Check contract structure and governance rules.' },
    { id: 'plan', label: 'Plan', enabled: true, note: 'Generate or refresh the implementation plan.' },
    { id: 'approve', label: 'Approve', enabled: Boolean(detail.artifacts.planPath), note: 'Record approval in the plan and contract.' },
    {
      id: 'execute',
      label: 'Execute',
      enabled: !mode.externalLlmOnly && (planStatus === 'approved' || contractStatus === 'approved'),
      note: mode.externalLlmOnly
        ? 'Execution is handled in an external AI workflow for this repo.'
        : 'Write the execution handoff and move the plan to executing.',
    },
    {
      id: 'audit',
      label: 'Audit',
      enabled: !mode.externalLlmOnly && (planStatus === 'executing' || Boolean(detail.artifacts.auditPath)),
      note: mode.externalLlmOnly
        ? 'Audit artifact creation is handled outside Grabby CLI in this repo.'
        : 'Run verification and write the audit artifact.',
    },
    {
      id: 'gc',
      label: 'Archive',
      enabled: isComplete,
      note: 'Archive the completed contract to history.',
    },
  ];
}

function buildContractListItem(detail) {
  return {
    id: detail.id,
    title: detail.title,
    type: detail.type,
    status: detail.status,
    phase: detail.phase,
    branch: detail.branch,
    lastModifiedAt: detail.lastModifiedAt,
    artifacts: detail.artifacts,
  };
}

function buildHistoryItem(feature) {
  return {
    id: feature.id,
    title: feature.title,
    type: feature.type || 'FEATURE_CONTRACT',
    status: feature.status || 'archived',
    closedAt: feature.closedAt || null,
    archivePath: feature.archivePath || null,
    objective: feature.objective || '',
    files: Array.isArray(feature.files) ? feature.files : [],
  };
}

function buildContractDetail(id, cwd) {
  const feature = features.getContractFeatureStatus(id, cwd);
  if (!feature || !feature.contractPath) {
    return null;
  }

  const artifactPaths = getArtifactPaths(id, cwd);
  const contractText = readTextIfExists(artifactPaths.contractPath);
  const planText = readTextIfExists(artifactPaths.planPath);
  const auditText = readTextIfExists(artifactPaths.auditPath);
  const planData = planText ? yaml.parse(planText) : null;
  const auditStatus = String(auditText?.match(/- Status:\s*([^\n\r]+)/)?.[1] || '').trim() || null;
  const workflow = getWorkflowModel();
  const currentPhase = getLifecyclePhase(feature.status, planData?.status, auditStatus);
  const currentPhaseIndex = workflow.phases.findIndex((phase) => phase.id === currentPhase);
  const mode = getMode(cwd);

  const detail = {
    id: feature.id,
    title: feature.title,
    type: feature.type,
    status: feature.status,
    branch: feature.branch || null,
    lastModifiedAt: feature.lastModifiedAt,
    phase: {
      id: currentPhase,
      label: workflow.phases[currentPhaseIndex]?.name || currentPhase,
      progressPercent: Math.round(((currentPhaseIndex + 1) / workflow.phases.length) * 100),
    },
    summary: {
      objective: extractSection(contractText, 'Objective'),
      scope: extractSection(contractText, 'Scope'),
      nonGoals: extractSection(contractText, 'Non-Goals'),
      testing: extractSection(contractText, 'Testing'),
      doneWhen: extractChecklist(contractText, 'Done When'),
    },
    artifacts: {
      contractPath: feature.contractPath,
      planPath: feature.planPath,
      auditPath: feature.auditPath,
      planStatus: planData?.status || null,
      auditStatus,
    },
    content: contractText,
    plan: planData,
    planText,
    auditText,
    timeline: buildTimeline(feature, planData, auditText, artifactPaths),
    validation: core.validateContract(contractText),
    mode,
  };

  detail.availableActions = buildAvailableActions(detail, mode);
  return detail;
}

async function runContractAction(action, id, cwd) {
  const feature = features.getContractFeatureStatus(id, cwd);
  if (!feature || !feature.contractPath) {
    const error = new Error('Contract not found');
    error.statusCode = 404;
    throw error;
  }

  const mode = getMode(cwd);
  if ((action === 'execute' || action === 'audit') && mode.externalLlmOnly) {
    const error = new Error(`${action} is disabled because workflow.externalLlmOnly=true in this repository.`);
    error.statusCode = 409;
    throw error;
  }

  const { handlers, lines } = createBufferedHandlers(cwd);
  const artifactPaths = getArtifactPaths(id, cwd);
  const target = artifactPaths.contractPath;

  switch (action) {
    case 'validate':
      await handlers.validate(target);
      break;
    case 'plan':
      await handlers.plan(target);
      break;
    case 'approve':
      handlers.approve(target);
      break;
    case 'execute':
      await handlers.execute(target, { yes: true });
      break;
    case 'audit':
      handlers.audit(target, { yes: true });
      break;
    case 'gc': {
      const archived = features.createArchiveBundle(id, cwd);
      lines.push(`Archived ${id} to ${archived.historyFile}`);
      return {
        action,
        logs: lines,
        archived: true,
        archivePath: archived.historyFile,
      };
    }
    default: {
      const error = new Error(`Unsupported action: ${action}`);
      error.statusCode = 400;
      throw error;
    }
  }

  return {
    action,
    logs: lines,
    contract: buildContractDetail(id, cwd),
  };
}

function createRouter(options = {}) {
  const { cwd = process.cwd() } = options;
  const router = express.Router();

  router.get('/bootstrap', (req, res) => {
    const contracts = features.listContractFeatures(cwd)
      .map((feature) => buildContractDetail(feature.id, cwd))
      .filter(Boolean)
      .map(buildContractListItem);
    const history = features.listArchivedFeatures(cwd)
      .map(buildHistoryItem)
      .sort((left, right) => {
        const leftTime = left.closedAt ? new Date(left.closedAt).getTime() : 0;
        const rightTime = right.closedAt ? new Date(right.closedAt).getTime() : 0;
        return rightTime - leftTime || left.id.localeCompare(right.id);
      });

    res.json({
      ok: true,
      status: {
        cwd,
        timestamp: new Date().toISOString(),
        mode: getMode(cwd),
      },
      workflow: getWorkflowModel(),
      commands: commandCatalog.getAllCommands(),
      contracts,
      history,
      rulesets: getRulesetsStatus(cwd),
    });
  });

  router.get('/contracts', (req, res) => {
    const contracts = features.listContractFeatures(cwd)
      .map((feature) => buildContractDetail(feature.id, cwd))
      .filter(Boolean)
      .map(buildContractListItem);

    res.json({ ok: true, contracts, mode: getMode(cwd) });
  });

  router.get('/history', (req, res) => {
    const history = features.listArchivedFeatures(cwd)
      .map(buildHistoryItem)
      .sort((left, right) => {
        const leftTime = left.closedAt ? new Date(left.closedAt).getTime() : 0;
        const rightTime = right.closedAt ? new Date(right.closedAt).getTime() : 0;
        return rightTime - leftTime || left.id.localeCompare(right.id);
      });

    res.json({ ok: true, history });
  });

  router.get('/contracts/:id', (req, res) => {
    const id = sanitizeContractId(req.params.id);
    if (!id) {
      res.status(400).json({ ok: false, error: 'Invalid contract id' });
      return;
    }

    const detail = buildContractDetail(id, cwd);
    if (!detail) {
      res.status(404).json({ ok: false, error: 'Contract not found' });
      return;
    }

    res.json({ ok: true, contract: detail });
  });

  router.put('/contracts/:id', (req, res) => {
    const id = sanitizeContractId(req.params.id);
    if (!id) {
      res.status(400).json({ ok: false, error: 'Invalid contract id' });
      return;
    }

    const detail = buildContractDetail(id, cwd);
    if (!detail) {
      res.status(404).json({ ok: false, error: 'Contract not found' });
      return;
    }

    const { content, status } = req.body || {};
    if (content !== undefined && typeof content !== 'string') {
      res.status(400).json({ ok: false, error: 'content must be a string' });
      return;
    }
    if (status !== undefined && !ALLOWED_STATUSES.has(String(status).toLowerCase())) {
      res.status(400).json({ ok: false, error: 'Unsupported status value' });
      return;
    }

    const artifactPaths = getArtifactPaths(id, cwd);
    let nextContent = content !== undefined ? content : detail.content;

    if (status !== undefined) {
      if (/\*\*Status:\*\*\s*([^\n\r|]+)/i.test(nextContent)) {
        nextContent = nextContent.replace(/\*\*Status:\*\*\s*([^\n\r|]+)/i, `**Status:** ${status}`);
      } else {
        res.status(400).json({ ok: false, error: 'Contract is missing a **Status:** line' });
        return;
      }
    }

    fs.writeFileSync(artifactPaths.contractPath, nextContent, 'utf8');
    res.json({ ok: true, contract: buildContractDetail(id, cwd) });
  });

  router.post('/contracts/:id/actions/:action', async (req, res) => {
    const id = sanitizeContractId(req.params.id);
    if (!id) {
      res.status(400).json({ ok: false, error: 'Invalid contract id' });
      return;
    }

    try {
      const result = await runContractAction(String(req.params.action || '').toLowerCase(), id, cwd);
      res.json({ ok: true, ...result });
    } catch (error) {
      res.status(error.statusCode || 400).json({
        ok: false,
        error: error.message,
      });
    }
  });

  router.get('/commands', (req, res) => {
    res.json({
      ok: true,
      commands: commandCatalog.getAllCommands(),
    });
  });

  router.get('/workflow', (req, res) => {
    res.json({
      ok: true,
      workflow: getWorkflowModel(),
      mode: getMode(cwd),
    });
  });

  router.get('/status', (req, res) => {
    res.json({
      ok: true,
      cwd,
      timestamp: new Date().toISOString(),
      mode: getMode(cwd),
    });
  });

  router.get('/rulesets', (req, res) => {
    res.json({
      ok: true,
      rulesets: getRulesetsStatus(cwd),
    });
  });

  router.get('/rulesets/read', (req, res) => {
    const scope = String(req.query.scope || '').trim().toLowerCase();

    if (scope === 'local') {
      const file = String(req.query.file || '').trim();
      if (!file) {
        res.status(400).json({ ok: false, error: 'file is required for local rules' });
        return;
      }

      const localRule = readLocalRule(cwd, file);
      if (!localRule) {
        res.status(404).json({ ok: false, error: 'Rule not found' });
        return;
      }

      res.json({
        ok: true,
        rule: {
          scope: 'local',
          ...localRule.entry,
          content: localRule.content,
        },
      });
      return;
    }

    if (scope === 'repo') {
      const ref = String(req.query.ref || '').trim();
      if (!ref) {
        res.status(400).json({ ok: false, error: 'ref is required for repo rules' });
        return;
      }

      const { rulesetsConfig } = getRulesetsRuntimeConfig(cwd);
      const repoRule = getRulesetsStatus(cwd).repo.find((entry) => entry.ref === ref);
      const repoContent = readRepoRulesetContent(cwd, rulesetsConfig, ref);

      if (!repoRule || !repoContent) {
        res.status(404).json({ ok: false, error: 'Rule not found' });
        return;
      }

      res.json({
        ok: true,
        rule: {
          scope: 'repo',
          ...repoRule,
          file: repoContent.contentPath,
          content: repoContent.content,
        },
      });
      return;
    }

    res.status(400).json({ ok: false, error: 'scope must be "local" or "repo"' });
  });

  return router;
}

module.exports = {
  createRouter,
};
