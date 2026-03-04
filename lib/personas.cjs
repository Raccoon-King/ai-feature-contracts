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
  { key: 'quick', pattern: /\b(bug|fix|regression)\b/i },
  { key: 'dev', pattern: /\b(implement|execute|ship|code|build out)\b/i },
  { key: 'architect', pattern: /\b(create|feature|api|endpoint|component|integration|refactor)\b/i },
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

function selectPersonaForTask(request, options = {}) {
  const normalizedRequest = String(request || '').trim();
  const matchedRule = PERSONA_RULES.find((rule) => rule.pattern.test(normalizedRequest));
  const personas = getPersonaMap(options);
  const persona = personas[matchedRule ? matchedRule.key : 'architect'] || personas.architect;

  return {
    ...persona,
    request: normalizedRequest,
  };
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
      return context.quick ? { ...personas.quick } : { ...personas.dev };
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
  } = context;
  const normalizedStatus = String(contractStatus || '').trim().toLowerCase();

  let primary;
  if (orchestrate) {
    primary = selectPersonaForStage('orchestration', {}, options);
  } else if (!hasContract) {
    primary = selectPersonaForStage('contract', {}, options);
  } else if (normalizedStatus === 'draft' && !hasPlan) {
    primary = selectPersonaForStage('validation', {}, options);
  } else if (!hasPlan || (hasPlan && !planApproved)) {
    primary = selectPersonaForStage('planning', {}, options);
  } else if (verificationComplete || normalizedStatus === 'complete') {
    primary = selectPersonaForStage('audit', {}, options);
  } else if (implementationComplete) {
    primary = selectPersonaForStage('verification', {}, options);
  } else if (normalizedStatus === 'approved' && hasPlan && planApproved) {
    primary = selectPersonaForStage('execution', { quick }, options);
  } else {
    primary = selectPersonaForTask(request, options);
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
    primary,
    next,
    transitions,
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
  selectPersonaForTask,
  selectPersonaForStage,
  deriveWorkflowRoles,
};
