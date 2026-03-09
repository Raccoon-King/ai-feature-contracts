const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  selectPersonaForTask,
  selectPersonaForStage,
  inferSubstep,
  selectPersonaForSubstep,
  deriveWorkflowRoles,
  validateAgentDefinition,
  lintAgentDefinitions,
} = require('../lib/personas.cjs');
const { buildTaskBrief, getTaskBriefPath } = require('../lib/task-brief.cjs');

describe('Persona selection', () => {
  it('routes explicit team orchestration requests to the orchestrator persona', () => {
    const persona = selectPersonaForTask('run the full team orchestration');

    expect(persona.agentName).toBe('Conductor');
    expect(persona.mode).toBe('orchestration');
  });

  it('routes intake-style requests to the analyst persona', () => {
    const persona = selectPersonaForTask('triage this request into a ticket');

    expect(persona.agentKey).toBe('analyst');
    expect(persona.agentName).toBe('Ari');
    expect(persona.mode).toBe('analysis');
  });

  it('routes unit-test style work to the quick persona', () => {
    const persona = selectPersonaForTask('create a unit test for the login hook');

    expect(persona.agentKey).toBe('quick');
    expect(persona.agentName).toBe('Flash');
    expect(persona.handoffCommand).toBe('grabby quick');
  });

  it('routes backlog and decomposition requests to the strategist persona', () => {
    const persona = selectPersonaForTask('break down this feature into epic task subtask backlog');

    expect(persona.agentKey).toBe('strategist');
    expect(persona.agentName).toBe('Sage');
  });

  it('falls back to the architect persona for general feature work', () => {
    const persona = selectPersonaForTask('create a new onboarding feature');

    expect(persona.agentKey).toBe('architect');
    expect(persona.agentName).toBe('Archie');
  });

  it('routes review and validation requests to their specialized personas', () => {
    expect(selectPersonaForTask('audit this contract before merge')).toEqual(expect.objectContaining({
      agentKey: 'auditor',
      mode: 'audit',
      agentName: 'Iris',
    }));
    expect(selectPersonaForTask('validate the security guardrails')).toEqual(expect.objectContaining({
      agentKey: 'validator',
      mode: 'validation',
      agentName: 'Val',
    }));
  });

  it('routes verification-heavy requests to the test engineer persona', () => {
    expect(selectPersonaForTask('close the regression coverage gap for this change')).toEqual(expect.objectContaining({
      agentKey: 'tester',
      mode: 'verification',
      agentName: 'Tess',
    }));
  });

  it('routes explicit implementation and bug-fix requests without losing the original request text', () => {
    expect(selectPersonaForTask('implement the oauth callback flow')).toEqual(expect.objectContaining({
      agentKey: 'dev',
      mode: 'execution',
      request: 'implement the oauth callback flow',
    }));
    expect(selectPersonaForTask('bug regression in profile save')).toEqual(expect.objectContaining({
      agentKey: 'dev',
      mode: 'execution',
    }));
    expect(selectPersonaForTask('')).toEqual(expect.objectContaining({
      agentKey: 'architect',
      request: '',
    }));
  });

  it('escalates quick-flow candidates when risk signals are high', () => {
    const persona = selectPersonaForTask('tiny fix in auth payment path', {}, {
      quick: true,
      securityImpact: 'high',
      fileCount: 2,
    });
    expect(persona.agentKey).toBe('validator');
    expect(persona.reason).toContain('high risk');
  });

  it('selects dedicated owners for explicit workflow stages', () => {
    expect(selectPersonaForStage('intake')).toEqual(expect.objectContaining({
      agentKey: 'analyst',
      agentName: 'Ari',
    }));
    expect(selectPersonaForStage('contract')).toEqual(expect.objectContaining({
      agentKey: 'architect',
      agentName: 'Archie',
    }));
    expect(selectPersonaForStage('execution', { quick: true })).toEqual(expect.objectContaining({
      agentKey: 'quick',
      agentName: 'Flash',
    }));
    expect(selectPersonaForStage('verification')).toEqual(expect.objectContaining({
      agentKey: 'tester',
      agentName: 'Tess',
    }));
  });

  it('derives workflow roles from artifact state', () => {
    expect(deriveWorkflowRoles({
      request: 'new feature request',
      hasContract: false,
    })).toEqual(expect.objectContaining({
      intake: expect.objectContaining({ agentKey: 'analyst' }),
      primary: expect.objectContaining({ agentKey: 'architect' }),
      next: expect.objectContaining({ agentKey: 'validator' }),
    }));

    expect(deriveWorkflowRoles({
      request: 'validate this draft contract',
      hasContract: true,
      contractStatus: 'draft',
      hasPlan: false,
    })).toEqual(expect.objectContaining({
      primary: expect.objectContaining({ agentKey: 'validator' }),
      next: expect.objectContaining({ agentKey: 'strategist' }),
    }));

    expect(deriveWorkflowRoles({
      request: 'implement the approved plan',
      hasContract: true,
      contractStatus: 'approved',
      hasPlan: true,
      planApproved: true,
    })).toEqual(expect.objectContaining({
      primary: expect.objectContaining({ agentKey: 'dev' }),
      next: expect.objectContaining({ agentKey: 'tester' }),
    }));

    expect(deriveWorkflowRoles({
      request: 'verify the implemented change',
      hasContract: true,
      contractStatus: 'approved',
      hasPlan: true,
      planApproved: true,
      implementationComplete: true,
    })).toEqual(expect.objectContaining({
      primary: expect.objectContaining({ agentKey: 'tester' }),
      next: expect.objectContaining({ agentKey: 'auditor' }),
    }));
  });

  it('adds blocked transitions when execution or audit are requested before gates are met', () => {
    const executionBlocked = deriveWorkflowRoles({
      request: 'implement now',
      hasContract: true,
      contractStatus: 'draft',
      hasPlan: false,
      substep: 'implementation',
    });
    expect(executionBlocked.primary.agentKey).toBe('validator');
    expect(executionBlocked.primary.blockedTransitions).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: 'execution' }),
    ]));

    const auditBlocked = deriveWorkflowRoles({
      request: 'prepare audit evidence',
      hasContract: true,
      contractStatus: 'approved',
      hasPlan: true,
      planApproved: true,
      implementationComplete: true,
      verificationComplete: false,
      substep: 'audit_evidence',
    });
    expect(auditBlocked.primary.agentKey).toBe('tester');
    expect(auditBlocked.primary.blockedTransitions).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: 'audit' }),
    ]));
  });

  it('uses routing memory when provided for a substep', () => {
    const roles = deriveWorkflowRoles({
      request: 'close test gaps',
      hasContract: true,
      contractStatus: 'approved',
      hasPlan: true,
      planApproved: true,
      implementationComplete: true,
      substep: 'test_gap',
      routingMemory: {
        lastSuccessfulAgentBySubstep: {
          test_gap: 'tester',
        },
      },
    });
    expect(roles.primary.agentKey).toBe('tester');
    expect(roles.primary.reason).toContain('Routing memory preferred agent');
  });

  it('infers and routes substeps directly', () => {
    expect(inferSubstep('clarify the request')).toBe('requirements_clarification');
    expect(inferSubstep('plan file sequencing')).toBe('file_plan');
    expect(selectPersonaForSubstep('risk_check', { request: 'security review' })).toEqual(expect.objectContaining({
      agentKey: 'validator',
      confidence: expect.any(Number),
      fallbackAgent: 'analyst',
    }));
  });
});

describe('Task brief', () => {
  it('derives a stable brief path from the task name', () => {
    const briefPath = getTaskBriefPath('C:\\repo\\contracts', 'Create a Unit Test');

    expect(briefPath).toBe(path.join('C:\\repo\\contracts', 'create-a-unit-test.brief.md'));
  });

  it('renders a brief with persona guidance and handoff', () => {
    const persona = selectPersonaForTask('create a unit test');
    const brief = buildTaskBrief({
      taskName: 'Create a Unit Test',
      request: 'create a unit test',
      persona,
      objective: 'Cover the login flow with a bounded automated test.',
      scopeItems: ['Add a unit test', 'Keep production code unchanged'],
      constraints: 'Stay inside src/tests and avoid new dependencies.',
      doneWhen: 'The test passes locally and documents the regression.',
    });

    expect(brief).toContain('Persona: Flash');
    expect(brief).toContain('## Scope Breakdown');
    expect(brief).toContain('Stay inside src/tests');
    expect(brief).toContain('`grabby quick`');
  });
});

describe('Agent schema validation', () => {
  it('accepts built-in agent definitions', () => {
    const result = lintAgentDefinitions();

    expect(result.valid).toBe(true);
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results.every((entry) => entry.valid)).toBe(true);
  });

  it('fails invalid agent definitions with actionable errors', () => {
    const invalid = validateAgentDefinition({
      agent: {
        metadata: {
          name: 'Broken',
        },
        persona: {},
        menu: [{}],
      },
    }, {
      fileName: 'broken.agent.yaml',
      agentsDir: path.join('C:', 'repo', 'agents'),
      workflowsDir: path.join('C:', 'repo', 'workflows'),
    });

    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toEqual(expect.arrayContaining([
      'agent.metadata.id is required',
      'agent.metadata.title is required',
      'agent.persona.role is required',
      'agent.persona.principles must contain at least one item',
      'agent.menu[0].trigger is required',
    ]));
  });

  it('reports parse and workflow errors from lint results', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-agents-'));
    const agentsDir = path.join(tempDir, 'agents');
    const workflowsDir = path.join(tempDir, 'workflows');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.mkdirSync(workflowsDir, { recursive: true });

    fs.writeFileSync(path.join(agentsDir, 'broken.agent.yaml'), `agent:
  metadata:
    id: agents/broken
    name: Broken
    title: Broken Agent
    icon: "!"
    capabilities: broken
  persona:
    role: Broken
    identity: Broken identity
    communication_style: terse
    principles:
      - test
  greeting: Hello
  menu:
    - trigger: BK
      command: broken
      workflow: workflows/missing/workflow.yaml
      description: broken
`, 'utf8');

    const result = lintAgentDefinitions({ agentsDir, workflowsDir });

    expect(result.valid).toBe(false);
    expect(result.results[0].errors).toContain('agent.menu[0].workflow not found: workflows/missing/workflow.yaml');

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
