const PERSONAS = {
  orchestrator: {
    agentKey: 'architect',
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
  { key: 'orchestrator', pattern: /\b(orchestrate|full flow|full handoff|end to end|run the team|full team)\b/i },
  { key: 'auditor', pattern: /\b(audit|review|verify|inspection|qa signoff)\b/i },
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

module.exports = {
  PERSONAS,
  selectPersonaForTask,
};
