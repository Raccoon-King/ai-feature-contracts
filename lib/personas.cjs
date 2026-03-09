const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

const DEFAULT_AGENTS_DIR = path.join(__dirname, '..', 'agents');
const DEFAULT_WORKFLOWS_DIR = path.join(__dirname, '..', 'workflows');

const PERSONA_DEFAULTS = {
  analyst: {
    fileName: 'analyst.agent.yaml',
    aliases: ['analyst'],
    mode: 'analysis',
    handoffCommand: 'grabby agent analyst AN',
    rationale: 'Use intake analysis first when the request is still raw, ambiguous, or needs to be structured into a ticket.',
  },
  orchestrator: {
    aliases: ['orchestrator'],
    agentName: 'Conductor',
    title: 'Workflow Orchestrator',
    mode: 'orchestration',
    handoffCommand: 'grabby orchestrate "<request>"',
    rationale: 'Use orchestration when Grabby should drive contract, planning, execution prep, and audit prep in one CLI session.',
  },
  architect: {
    fileName: 'contract-architect.agent.yaml',
    aliases: ['architect', 'contract-architect'],
    mode: 'contract',
    handoffCommand: 'grabby agent architect CC',
    rationale: 'Use a full contract interview when scope or shape is still emerging.',
  },
  validator: {
    fileName: 'scope-validator.agent.yaml',
    aliases: ['validator', 'scope-validator'],
    mode: 'validation',
    handoffCommand: 'grabby agent validator VC',
    rationale: 'Use validation-first thinking when the main concern is safety, risk, or correctness.',
  },
  strategist: {
    fileName: 'plan-strategist.agent.yaml',
    aliases: ['strategist', 'plan-strategist'],
    mode: 'planning',
    handoffCommand: 'grabby agent strategist GP',
    rationale: 'Use planning mode when the task needs epics, sequencing, or implementation strategy.',
  },
  dev: {
    fileName: 'dev-agent.agent.yaml',
    aliases: ['dev', 'dev-agent'],
    mode: 'execution',
    handoffCommand: 'grabby agent dev EX',
    rationale: 'Use implementation mode when the scope is already defined and work should move to execution.',
  },
  tester: {
    fileName: 'test-engineer.agent.yaml',
    aliases: ['tester', 'test-engineer'],
    mode: 'verification',
    handoffCommand: 'grabby agent tester TS',
    rationale: 'Use verification mode when implementation exists and the next job is proving behavior, closing regressions, and preparing for audit.',
  },
  auditor: {
    fileName: 'auditor.agent.yaml',
    aliases: ['auditor'],
    mode: 'audit',
    handoffCommand: 'grabby agent auditor AU',
    rationale: 'Use audit mode when the main request is review, verification, or post-change checks.',
  },
  quick: {
    fileName: 'quick-flow.agent.yaml',
    aliases: ['quick', 'quick-flow'],
    mode: 'quick',
    handoffCommand: 'grabby quick',
    rationale: 'Use quick flow for small, bounded tasks like unit tests, narrow bug fixes, and low-risk tweaks.',
  },
};

const PERSONA_RULES = [
  { key: 'analyst', pattern: /\b(ticket|intake|triage|clarify|clarification|analyze request|analyze this request|scope this request)\b/i },
  { key: 'orchestrator', pattern: /\b(orchestrate|full flow|full handoff|end to end|run the team|full team)\b/i },
  { key: 'auditor', pattern: /\b(audit|review|verify|inspection|qa signoff)\b/i },
  { key: 'tester', pattern: /\b(test suite|coverage|verification|regression coverage|prove it|qa|test engineer)\b/i },
  { key: 'validator', pattern: /\b(validate|validation|risk|security|compliance|guardrail)\b/i },
  { key: 'strategist', pattern: /\b(plan|planning|backlog|epic|story|subtask|roadmap|break down|decompose)\b/i },
  { key: 'quick', pattern: /\b(unit test|test case|small fix|small change|tiny fix|typo|quick|minor|tweak)\b/i },
  { key: 'dev', pattern: /\b(bug|fix|regression)\b/i },
  { key: 'dev', pattern: /\b(implement|execute|ship|code|build out)\b/i },
  { key: 'architect', pattern: /\b(create|feature|api|endpoint|component|integration|refactor)\b/i },
];

const SUBSTEP_KEYWORDS = [
  { substep: 'audit_evidence', pattern: /\b(audit|evidence|compliance review|signoff)\b/i },
  { substep: 'test_gap', pattern: /\b(test|coverage|verification|regression suite|qa)\b/i },
  { substep: 'risk_check', pattern: /\b(validate|validation|risk|security|compliance|guardrail|migration)\b/i },
  { substep: 'requirements_clarification', pattern: /\b(clarify|intake|triage|ambigu|requirements?)\b/i },
  { substep: 'scope_boundary', pattern: /\b(scope|non-goal|boundary|contract|acceptance)\b/i },
  { substep: 'file_plan', pattern: /\b(plan|order|sequence|backlog|files?|dependency|decompose)\b/i },
  { substep: 'implementation', pattern: /\b(implement|execute|ship|code|bug|fix|regression|build)\b/i },
];

let cachedCatalog = null;

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function detectPersonaKey(fileName, rawAgent = {}) {
  const normalizedFile = String(fileName || '').toLowerCase();
  const metadataId = String(rawAgent?.agent?.metadata?.id || '').toLowerCase();
  return Object.entries(PERSONA_DEFAULTS).find(([, persona]) => {
    return [persona.fileName, ...persona.aliases].filter(Boolean).some((candidate) => {
      const normalizedCandidate = String(candidate).toLowerCase();
      return normalizedCandidate === normalizedFile
        || normalizedCandidate === metadataId
        || normalizedFile.includes(normalizedCandidate)
        || metadataId.includes(normalizedCandidate);
    });
  })?.[0] || null;
}

function getWorkflowPath(workflowsDir, workflowRef) {
  if (!workflowRef) return null;
  const rawRef = String(workflowRef).trim();
  const normalizedRef = rawRef.replace(/\\/g, '/');
  const trimmedRef = normalizedRef.replace(/^workflows\//, '');
  const candidates = [
    path.isAbsolute(rawRef) ? rawRef : path.join(workflowsDir, rawRef),
    path.join(path.dirname(workflowsDir), normalizedRef),
    path.join(path.dirname(workflowsDir), normalizedRef, 'workflow.yaml'),
    path.join(workflowsDir, trimmedRef),
    path.join(workflowsDir, trimmedRef, 'workflow.yaml'),
    path.join(workflowsDir, path.basename(trimmedRef), 'workflow.yaml'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function validateAgentDefinition(rawAgent, options = {}) {
  const { agentsDir = DEFAULT_AGENTS_DIR, workflowsDir = DEFAULT_WORKFLOWS_DIR, fileName = '' } = options;
  const errors = [];
  const warnings = [];

  if (!rawAgent || typeof rawAgent !== 'object') {
    return { valid: false, errors: ['Agent definition must be an object'], warnings };
  }

  const agent = rawAgent.agent;
  if (!agent || typeof agent !== 'object') {
    return { valid: false, errors: ['Missing root "agent" object'], warnings };
  }

  const metadata = agent.metadata || {};
  const persona = agent.persona || {};
  const menu = Array.isArray(agent.menu) ? agent.menu : [];
  const personaKey = detectPersonaKey(fileName, rawAgent);

  ['id', 'name', 'title', 'icon', 'capabilities'].forEach((field) => {
    if (!String(metadata[field] || '').trim()) {
      errors.push(`agent.metadata.${field} is required`);
    }
  });

  ['role', 'identity', 'communication_style'].forEach((field) => {
    if (!String(persona[field] || '').trim()) {
      errors.push(`agent.persona.${field} is required`);
    }
  });

  if (normalizeArray(persona.principles).length === 0) {
    errors.push('agent.persona.principles must contain at least one item');
  }

  if (!String(agent.greeting || '').trim()) {
    warnings.push('agent.greeting is recommended');
  }

  if (menu.length === 0) {
    errors.push('agent.menu must contain at least one item');
  }

  menu.forEach((entry, index) => {
    const prefix = `agent.menu[${index}]`;
    ['trigger', 'command', 'workflow', 'description'].forEach((field) => {
      if (!String(entry?.[field] || '').trim()) {
        errors.push(`${prefix}.${field} is required`);
      }
    });

    if (entry?.workflow) {
      const workflowPath = getWorkflowPath(workflowsDir, entry.workflow);
      if (!workflowPath) {
        errors.push(`${prefix}.workflow not found: ${entry.workflow}`);
      }
    }
  });

  if (personaKey && !metadata.id.includes(personaKey)) {
    warnings.push(`agent.metadata.id does not include the expected persona key "${personaKey}"`);
  }

  if (fileName && agentsDir) {
    const expectedPath = path.join(agentsDir, fileName);
    if (!fs.existsSync(expectedPath)) {
      warnings.push(`Agent file is not present at ${path.relative(process.cwd(), expectedPath).replace(/\\/g, '/')}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function buildPersonaRecord(personaKey, rawAgent) {
  const defaults = PERSONA_DEFAULTS[personaKey];
  if (!defaults || !rawAgent?.agent) return null;

  return {
    agentKey: personaKey,
    agentName: rawAgent.agent.metadata?.name || defaults.agentName || personaKey,
    title: rawAgent.agent.metadata?.title || defaults.title || personaKey,
    mode: defaults.mode,
    handoffCommand: defaults.handoffCommand,
    rationale: defaults.rationale,
    fileName: defaults.fileName || null,
    menu: Array.isArray(rawAgent.agent.menu) ? rawAgent.agent.menu : [],
    metadata: rawAgent.agent.metadata || {},
  };
}

function loadAgentCatalog(options = {}) {
  const {
    agentsDir = DEFAULT_AGENTS_DIR,
    workflowsDir = DEFAULT_WORKFLOWS_DIR,
    useCache = true,
  } = options;
  const cacheKey = `${agentsDir}::${workflowsDir}`;
  if (useCache && cachedCatalog?.cacheKey === cacheKey) {
    return cachedCatalog;
  }

  const personas = {};
  const results = [];

  if (fs.existsSync(agentsDir)) {
    fs.readdirSync(agentsDir)
      .filter((fileName) => fileName.endsWith('.agent.yaml'))
      .sort()
      .forEach((fileName) => {
        const filePath = path.join(agentsDir, fileName);
        let parsed;
        try {
          parsed = yaml.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (error) {
          results.push({
            fileName,
            filePath,
            valid: false,
            errors: [`Failed to parse YAML: ${error.message}`],
            warnings: [],
          });
          return;
        }

        const validation = validateAgentDefinition(parsed, { agentsDir, workflowsDir, fileName });
        const personaKey = detectPersonaKey(fileName, parsed);
        const persona = personaKey ? buildPersonaRecord(personaKey, parsed) : null;

        if (persona) {
          personas[personaKey] = persona;
        }

        results.push({
          fileName,
          filePath,
          personaKey,
          valid: validation.valid,
          errors: validation.errors,
          warnings: validation.warnings,
          agent: parsed,
        });
      });
  }

  Object.entries(PERSONA_DEFAULTS).forEach(([key, defaults]) => {
    if (!personas[key] && defaults.fileName) {
      personas[key] = {
        agentKey: key,
        agentName: defaults.agentName || key,
        title: defaults.title || key,
        mode: defaults.mode,
        handoffCommand: defaults.handoffCommand,
        rationale: defaults.rationale,
        fileName: defaults.fileName,
        menu: [],
        metadata: {},
      };
    }
  });

  personas.orchestrator = personas.orchestrator || {
    agentKey: 'orchestrator',
    agentName: PERSONA_DEFAULTS.orchestrator.agentName,
    title: PERSONA_DEFAULTS.orchestrator.title,
    mode: PERSONA_DEFAULTS.orchestrator.mode,
    handoffCommand: PERSONA_DEFAULTS.orchestrator.handoffCommand,
    rationale: PERSONA_DEFAULTS.orchestrator.rationale,
    fileName: null,
    menu: [],
    metadata: {},
  };

  const catalog = {
    cacheKey,
    personas,
    results,
    valid: results.every((entry) => entry.valid),
  };
  cachedCatalog = catalog;
  return catalog;
}

function clearPersonaCache() {
  cachedCatalog = null;
}

function getPersonaMap(options = {}) {
  const catalog = loadAgentCatalog(options);
  return catalog.personas;
}

function getPersonaByKey(key, options = {}) {
  const personas = getPersonaMap(options);
  return personas[key] ? { ...personas[key] } : null;
}

function lintAgentDefinitions(options = {}) {
  const catalog = loadAgentCatalog({ ...options, useCache: false });
  return {
    valid: catalog.valid,
    results: catalog.results,
  };
}

function inferSubstep(request, context = {}) {
  const explicit = String(context.substep || '').trim().toLowerCase();
  if (explicit) return explicit;
  const normalizedRequest = String(request || '').trim();
  const matched = SUBSTEP_KEYWORDS.find((entry) => entry.pattern.test(normalizedRequest));
  return matched ? matched.substep : '';
}

function isHighRiskRequest(request, context = {}) {
  const normalizedRequest = String(request || '').toLowerCase();
  const securityImpact = String(context.securityImpact || '').toLowerCase();
  const keywordMatch = /\b(security|auth|payment|migration|database|compliance|multi-file|critical|prod|production|breaking)\b/i.test(normalizedRequest);
  return Boolean(context.highRisk || context.dataChange || keywordMatch || securityImpact.includes('high') || securityImpact.includes('yes'));
}

function isQuickEligible(request, context = {}) {
  const normalizedRequest = String(request || '').toLowerCase();
  const tinyKeywords = /\b(unit test|test case|small fix|small change|tiny fix|typo|quick|minor|tweak)\b/i.test(normalizedRequest);
  const fileCount = Number.isFinite(context.fileCount) ? Number(context.fileCount) : null;
  const boundedByFileCount = fileCount === null ? true : fileCount <= 3;
  return (context.quick || tinyKeywords) && boundedByFileCount && !isHighRiskRequest(request, context);
}

function confidenceFor(source, context = {}) {
  switch (source) {
    case 'orchestration':
      return 0.98;
    case 'state':
      return 0.93;
    case 'substep':
      return 0.86;
    case 'keyword':
      return 0.72;
    case 'fallback':
    default:
      return context.request ? 0.6 : 0.55;
  }
}

function attachRoutingMeta(persona, {
  request = '',
  source = 'fallback',
  reason = '',
  substep = '',
  fallbackAgent = 'analyst',
  confidence = null,
  blockedTransitions = [],
} = {}) {
  const resolvedConfidence = typeof confidence === 'number' ? confidence : confidenceFor(source, { request });
  return {
    ...persona,
    request,
    substep,
    source,
    confidence: resolvedConfidence,
    fallbackAgent,
    reason: reason || `Routed by ${source}`,
    blockedTransitions,
  };
}

function selectPersonaForSubstep(substep, context = {}, options = {}) {
  const normalizedSubstep = String(substep || '').trim().toLowerCase();
  switch (normalizedSubstep) {
    case 'requirements_clarification':
      return attachRoutingMeta(selectPersonaForStage('intake', context, options), {
        request: context.request || '',
        source: 'substep',
        substep: normalizedSubstep,
        reason: 'Substep is requirements clarification.',
      });
    case 'scope_boundary':
      return attachRoutingMeta(selectPersonaForStage('contract', context, options), {
        request: context.request || '',
        source: 'substep',
        substep: normalizedSubstep,
        reason: 'Substep is contract/scope definition.',
      });
    case 'risk_check':
      return attachRoutingMeta(selectPersonaForStage('validation', context, options), {
        request: context.request || '',
        source: 'substep',
        substep: normalizedSubstep,
        reason: 'Substep is risk/guardrail analysis.',
      });
    case 'file_plan':
      return attachRoutingMeta(selectPersonaForStage('planning', context, options), {
        request: context.request || '',
        source: 'substep',
        substep: normalizedSubstep,
        reason: 'Substep is planning and sequencing.',
      });
    case 'implementation':
      if (isHighRiskRequest(context.request, context)) {
        return attachRoutingMeta(selectPersonaForStage('validation', context, options), {
          request: context.request || '',
          source: 'substep',
          substep: normalizedSubstep,
          reason: 'Implementation request flagged as high risk; route to validation first.',
        });
      }
      return attachRoutingMeta(selectPersonaForStage('execution', context, options), {
        request: context.request || '',
        source: 'substep',
        substep: normalizedSubstep,
        reason: 'Substep is implementation.',
      });
    case 'test_gap':
      if (isQuickEligible(context.request, context)) {
        return attachRoutingMeta(selectPersonaForStage('execution', { ...context, quick: true }, options), {
          request: context.request || '',
          source: 'substep',
          substep: normalizedSubstep,
          reason: 'Substep is bounded test work; route to quick flow.',
        });
      }
      return attachRoutingMeta(selectPersonaForStage('verification', context, options), {
        request: context.request || '',
        source: 'substep',
        substep: normalizedSubstep,
        reason: 'Substep is test coverage and verification.',
      });
    case 'audit_evidence':
      return attachRoutingMeta(selectPersonaForStage('audit', context, options), {
        request: context.request || '',
        source: 'substep',
        substep: normalizedSubstep,
        reason: 'Substep is audit evidence and closure.',
      });
    default:
      return null;
  }
}

function selectPersonaForTask(request, options = {}, context = {}) {
  const normalizedRequest = String(request || '').trim();
  const mergedContext = { ...context, request: normalizedRequest };
  const matchedRule = PERSONA_RULES.find((rule) => rule.pattern.test(normalizedRequest));
  const personas = getPersonaMap(options);
  const substep = inferSubstep(normalizedRequest, mergedContext);
  const substepPersona = selectPersonaForSubstep(substep, mergedContext, options);

  if (substepPersona) {
    return substepPersona;
  }

  let persona = personas[matchedRule ? matchedRule.key : 'architect'] || personas.architect;
  let reason = matchedRule ? `Matched keyword rule for ${matchedRule.key}.` : 'No keyword match; defaulting to architect.';
  let source = matchedRule ? 'keyword' : 'fallback';

  if (persona.agentKey === 'quick' && !isQuickEligible(normalizedRequest, mergedContext)) {
    persona = isHighRiskRequest(normalizedRequest, mergedContext) ? personas.validator : personas.dev;
    reason = 'Quick flow rejected due to risk/size signals; escalated routing.';
    source = 'state';
  }

  let confidence = confidenceFor(source, { request: normalizedRequest });
  let fallbackAgent = 'analyst';
  if (confidence < 0.65) {
    fallbackAgent = 'analyst';
    reason = `${reason} Confidence below threshold; analyst fallback available.`;
  }

  return attachRoutingMeta(persona, {
    request: normalizedRequest,
    source,
    reason,
    substep,
    fallbackAgent,
    confidence,
  });
}

function selectPersonaForStage(stage, context = {}, options = {}) {
  const normalizedStage = String(stage || '').trim().toLowerCase();
  const personas = getPersonaMap(options);

  switch (normalizedStage) {
    case 'intake':
    case 'analysis':
    case 'ticket':
      return { ...personas.analyst };
    case 'contract':
    case 'authoring':
      return { ...personas.architect };
    case 'validation':
    case 'risk':
      return { ...personas.validator };
    case 'planning':
    case 'plan':
    case 'backlog':
      return { ...personas.strategist };
    case 'execution':
    case 'implement':
      return isQuickEligible(context.request, context) ? { ...personas.quick } : { ...personas.dev };
    case 'verification':
    case 'verify':
    case 'testing':
    case 'test':
      return { ...personas.tester };
    case 'audit':
    case 'review':
      return { ...personas.auditor };
    case 'orchestration':
      return { ...personas.orchestrator };
    default:
      return { ...personas.architect };
  }
}

function deriveWorkflowRoles(context = {}, options = {}) {
  const {
    request = '',
    orchestrate = false,
    hasContract = false,
    contractStatus = '',
    hasPlan = false,
    planApproved = false,
    implementationComplete = false,
    verificationComplete = false,
    quick = false,
    substep = '',
    routingMemory = null,
  } = context;
  const normalizedStatus = String(contractStatus || '').trim().toLowerCase();
  const normalizedRequest = String(request || '').trim();
  const inferredSubstep = inferSubstep(normalizedRequest, { ...context, substep });
  const blockedTransitions = [];

  let primary;
  let reason = '';
  let source = 'fallback';
  if (orchestrate) {
    primary = selectPersonaForStage('orchestration', {}, options);
    reason = 'Explicit orchestration mode.';
    source = 'orchestration';
  } else if (!hasContract) {
    primary = selectPersonaForStage('contract', { ...context, request: normalizedRequest, quick }, options);
    reason = 'No contract exists yet; route to contract authoring.';
    source = 'state';
  } else if (normalizedStatus === 'draft' && !hasPlan) {
    primary = selectPersonaForStage('validation', context, options);
    reason = 'Draft contract without plan requires validation.';
    source = 'state';
  } else if (!hasPlan || (hasPlan && !planApproved)) {
    primary = selectPersonaForStage('planning', context, options);
    reason = 'Planning is incomplete or unapproved.';
    source = 'state';
  } else if (verificationComplete || normalizedStatus === 'complete') {
    primary = selectPersonaForStage('audit', context, options);
    reason = 'Verification is complete; move to audit.';
    source = 'state';
  } else if (implementationComplete) {
    primary = selectPersonaForStage('verification', context, options);
    reason = 'Implementation complete; route to verification.';
    source = 'state';
  } else if (normalizedStatus === 'approved' && hasPlan && planApproved) {
    primary = selectPersonaForStage('execution', { ...context, request: normalizedRequest, quick }, options);
    reason = 'Approved contract and plan; route to execution.';
    source = 'state';
  } else {
    primary = selectPersonaForTask(normalizedRequest, options, { ...context, quick, substep: inferredSubstep });
    reason = primary.reason || 'Fallback task-level routing.';
    source = primary.source || 'keyword';
  }

  if (inferredSubstep === 'implementation' && !(normalizedStatus === 'approved' && hasPlan && planApproved)) {
    blockedTransitions.push({
      stage: 'execution',
      reason: 'Execution blocked until contract and plan are approved.',
    });
  }
  if (inferredSubstep === 'audit_evidence' && !(verificationComplete || normalizedStatus === 'complete')) {
    blockedTransitions.push({
      stage: 'audit',
      reason: 'Audit blocked until verification is complete.',
    });
  }

  const memoryPreferredAgent = routingMemory?.lastSuccessfulAgentBySubstep?.[inferredSubstep];
  if (memoryPreferredAgent && primary.agentKey !== 'orchestrator') {
    const preferred = getPersonaByKey(memoryPreferredAgent, options);
    if (preferred && !(preferred.agentKey === 'quick' && !isQuickEligible(normalizedRequest, context))) {
      primary = preferred;
      source = 'state';
      reason = `Routing memory preferred agent "${memoryPreferredAgent}" for substep "${inferredSubstep}".`;
    }
  }

  let next = null;
  const personas = getPersonaMap(options);
  if (primary.agentKey === personas.analyst.agentKey) {
    next = selectPersonaForStage('contract', {}, options);
  } else if (primary.agentKey === personas.architect.agentKey) {
    next = selectPersonaForStage('validation', {}, options);
  } else if (primary.agentKey === personas.validator.agentKey) {
    next = selectPersonaForStage('planning', {}, options);
  } else if (primary.agentKey === personas.strategist.agentKey) {
    next = selectPersonaForStage('execution', { quick }, options);
  } else if (primary.agentKey === personas.dev.agentKey || primary.agentKey === personas.quick.agentKey) {
    next = selectPersonaForStage('verification', {}, options);
  } else if (primary.agentKey === personas.tester.agentKey) {
    next = selectPersonaForStage('audit', {}, options);
  }

  const transitions = [
    { stage: 'intake', owner: selectPersonaForStage('intake', {}, options) },
    { stage: 'contract', owner: selectPersonaForStage('contract', {}, options) },
    { stage: 'validation', owner: selectPersonaForStage('validation', {}, options) },
    { stage: 'planning', owner: selectPersonaForStage('planning', {}, options) },
    { stage: 'execution', owner: selectPersonaForStage('execution', { quick }, options) },
    { stage: 'verification', owner: selectPersonaForStage('verification', {}, options) },
    { stage: 'audit', owner: selectPersonaForStage('audit', {}, options) },
  ];

  return {
    intake: selectPersonaForStage('intake', {}, options),
    primary: attachRoutingMeta(primary, {
      request: normalizedRequest,
      source,
      reason,
      substep: inferredSubstep,
      blockedTransitions,
    }),
    next,
    transitions,
    decision: {
      source,
      substep: inferredSubstep,
      reason,
      blockedTransitions,
    },
  };
}

const PERSONAS = getPersonaMap();

module.exports = {
  PERSONAS,
  validateAgentDefinition,
  loadAgentCatalog,
  lintAgentDefinitions,
  clearPersonaCache,
  getPersonaMap,
  getPersonaByKey,
  inferSubstep,
  selectPersonaForSubstep,
  selectPersonaForTask,
  selectPersonaForStage,
  deriveWorkflowRoles,
};
