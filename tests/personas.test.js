const path = require('path');
const { selectPersonaForTask } = require('../lib/personas.cjs');
const { buildTaskBrief, getTaskBriefPath } = require('../lib/task-brief.cjs');

describe('Persona selection', () => {
  it('routes explicit team orchestration requests to the orchestrator persona', () => {
    const persona = selectPersonaForTask('run the full team orchestration');

    expect(persona.agentName).toBe('Conductor');
    expect(persona.mode).toBe('orchestration');
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

  it('routes explicit implementation and bug-fix requests without losing the original request text', () => {
    expect(selectPersonaForTask('implement the oauth callback flow')).toEqual(expect.objectContaining({
      agentKey: 'dev',
      mode: 'execution',
      request: 'implement the oauth callback flow',
    }));
    expect(selectPersonaForTask('bug regression in profile save')).toEqual(expect.objectContaining({
      agentKey: 'quick',
      mode: 'quick',
    }));
    expect(selectPersonaForTask('')).toEqual(expect.objectContaining({
      agentKey: 'architect',
      request: '',
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
