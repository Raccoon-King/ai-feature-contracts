const PERSONAS = {
  analyst: {
    agentKey: 'analyst',
    agentName: 'Ari',
    title: 'Request Analyst',
    mode: 'analysis',
    handoffCommand: 'grabby agent analyst AN',
    rationale: 'Use intake analysis first when the request is still raw, ambiguous, or needs to be structured into a ticket.',
  },
  orchestrator: {
    agentKey: 'orchestrator',
    agentName: 'Conductor',
    title: 'Workflow Orchestrator',
    mode: 'orchestration',
    handoffCommand: 'grabby orchestrate "<request>"',
    rationale: 'Use orchestration when Grabby should drive contract, planning, execution prep, and audit prep in one CLI session.',
  },
  architect: {
    agentKey: 'architect',
    agentName: 'Archie',
    title: 'Contract Architect',
    mode: 'contract',
    handoffCommand: 'grabby agent architect CC',
    rationale: 'Use a full contract interview when scope or shape is still emerging.',
  },
  validator: {
    agentKey: 'validator',
    agentName: 'Val',
    title: 'Scope Validator',
    mode: 'validation',
    handoffCommand: 'grabby agent validator VC',
    rationale: 'Use validation-first thinking when the main concern is safety, risk, or correctness.',
  },
  strategist: {
    agentKey: 'strategist',
    agentName: 'Sage',
    title: 'Plan Strategist',
    mode: 'planning',
    handoffCommand: 'grabby agent strategist GP',
    rationale: 'Use planning mode when the task needs epics, sequencing, or implementation strategy.',
  },
  dev: {
    agentKey: 'dev',
    agentName: 'Dev',
    title: 'Delivery Engineer',
    mode: 'execution',
    handoffCommand: 'grabby agent dev EX',
    rationale: 'Use implementation mode when the scope is already defined and work should move to execution.',
  },
  tester: {
    agentKey: 'tester',
    agentName: 'Tess',
    title: 'Test Engineer',
    mode: 'verification',
    handoffCommand: 'grabby agent tester TS',
    rationale: 'Use verification mode when implementation exists and the next job is proving behavior, closing regressions, and preparing for audit.',
  },
  auditor: {
    agentKey: 'auditor',
    agentName: 'Iris',
    title: 'Audit Lead',
    mode: 'audit',
    handoffCommand: 'grabby agent auditor AU',
    rationale: 'Use audit mode when the main request is review, verification, or post-change checks.',
  },
  quick: {
    agentKey: 'quick',
    agentName: 'Flash',
    title: 'Quick Flow Dev',
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

function selectPersonaForTask(request) {
  const normalizedRequest = String(request || '').trim();
  const matchedRule = PERSONA_RULES.find((rule) => rule.pattern.test(normalizedRequest));
  const persona = PERSONAS[matchedRule ? matchedRule.key : 'architect'];

  return {
    ...persona,
    request: normalizedRequest,
  };
}

function selectPersonaForStage(stage, context = {}) {
  const normalizedStage = String(stage || '').trim().toLowerCase();

  switch (normalizedStage) {
    case 'intake':
    case 'analysis':
    case 'ticket':
      return { ...PERSONAS.analyst };
    case 'contract':
    case 'authoring':
      return { ...PERSONAS.architect };
    case 'validation':
    case 'risk':
      return { ...PERSONAS.validator };
    case 'planning':
    case 'plan':
    case 'backlog':
      return { ...PERSONAS.strategist };
    case 'execution':
    case 'implement':
      return context.quick ? { ...PERSONAS.quick } : { ...PERSONAS.dev };
    case 'verification':
    case 'verify':
    case 'testing':
    case 'test':
      return { ...PERSONAS.tester };
    case 'audit':
    case 'review':
      return { ...PERSONAS.auditor };
    case 'orchestration':
      return { ...PERSONAS.orchestrator };
    default:
      return { ...PERSONAS.architect };
  }
}

function deriveWorkflowRoles(context = {}) {
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
    primary = selectPersonaForStage('orchestration');
  } else if (!hasContract) {
    primary = selectPersonaForStage('contract');
  } else if (normalizedStatus === 'draft' && !hasPlan) {
    primary = selectPersonaForStage('validation');
  } else if (!hasPlan || (hasPlan && !planApproved)) {
    primary = selectPersonaForStage('planning');
  } else if (verificationComplete || normalizedStatus === 'complete') {
    primary = selectPersonaForStage('audit');
  } else if (implementationComplete) {
    primary = selectPersonaForStage('verification');
  } else if (normalizedStatus === 'approved' && hasPlan && planApproved) {
    primary = selectPersonaForStage('execution', { quick });
  } else {
    primary = selectPersonaForTask(request);
  }

  let next = null;
  if (primary.agentKey === PERSONAS.analyst.agentKey) {
    next = selectPersonaForStage('contract');
  } else if (primary.agentKey === PERSONAS.architect.agentKey) {
    next = selectPersonaForStage('validation');
  } else if (primary.agentKey === PERSONAS.validator.agentKey) {
    next = selectPersonaForStage('planning');
  } else if (primary.agentKey === PERSONAS.strategist.agentKey) {
    next = selectPersonaForStage('execution', { quick });
  } else if (primary.agentKey === PERSONAS.dev.agentKey || primary.agentKey === PERSONAS.quick.agentKey) {
    next = selectPersonaForStage('verification');
  } else if (primary.agentKey === PERSONAS.tester.agentKey) {
    next = selectPersonaForStage('audit');
  }

  const transitions = [
    { stage: 'intake', owner: selectPersonaForStage('intake') },
    { stage: 'contract', owner: selectPersonaForStage('contract') },
    { stage: 'validation', owner: selectPersonaForStage('validation') },
    { stage: 'planning', owner: selectPersonaForStage('planning') },
    { stage: 'execution', owner: selectPersonaForStage('execution', { quick }) },
    { stage: 'verification', owner: selectPersonaForStage('verification') },
    { stage: 'audit', owner: selectPersonaForStage('audit') },
  ];

  return {
    intake: selectPersonaForStage('intake'),
    primary,
    next,
    transitions,
  };
}

module.exports = {
  PERSONAS,
  selectPersonaForTask,
  selectPersonaForStage,
  deriveWorkflowRoles,
};
