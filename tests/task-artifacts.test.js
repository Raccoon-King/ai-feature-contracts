const path = require('path');
const {
  SESSION_SCHEMA_VERSION,
  getTaskDefaults,
  normalizeDoneWhen,
  buildTaskContract,
  buildExecutionBrief,
  buildAuditChecklist,
  getExecutionBriefPath,
  getAuditChecklistPath,
  getSessionPath,
  buildSessionSummary,
  validateSessionSummary,
} = require('../lib/task-artifacts.cjs');

describe('Task artifacts', () => {
  it('provides api-endpoint defaults with planned files', () => {
    const defaults = getTaskDefaults('api-endpoint', 'login status');

    expect(defaults.directories).toContain('src/api/');
    expect(defaults.files[0].path).toBe('src/api/login-status.ts');
  });

  it('normalizes done-when criteria with required validation checks', () => {
    const doneWhen = normalizeDoneWhen(['Feature works']);

    expect(doneWhen).toContain('Feature works');
    expect(doneWhen.some((item) => item.includes('80%+'))).toBe(true);
    expect(doneWhen).toContain('Lint passes');
    expect(doneWhen).toContain('Build succeeds');
  });

  it('builds a populated contract from task interview data', () => {
    const contract = buildTaskContract({
      taskName: 'login redirect bug',
      id: 'FC-1',
      objective: 'Fix the redirect loop after login.',
      scopeItems: ['Reproduce the bug', 'Fix the redirect condition'],
      nonGoals: ['No auth redesign'],
      directories: ['src/', 'tests/'],
      files: [
        { action: 'modify', path: 'src/login.ts', reason: 'Bug fix' },
        { action: 'create', path: 'tests/login.test.ts', reason: 'Regression coverage' },
      ],
      dependencies: 'none',
      doneWhen: ['Bug no longer reproduces'],
      testing: '- Regression: `tests/login.test.ts`',
    });

    expect(contract).toContain('# FC: login redirect bug');
    expect(contract).toContain('## Security Considerations');
    expect(contract).toContain('| modify | `src/login.ts` | Bug fix |');
    expect(contract).toContain('- [ ] Bug no longer reproduces');
    expect(contract).toContain('Lint passes');
  });

  it('builds execution and audit handoff artifacts', () => {
    const executionBrief = buildExecutionBrief({
      fileName: 'login.fc.md',
      plan: {
        context: ['ARCH_INDEX_v1', 'RULESET_CORE_v1'],
        files: [{ action: 'modify', path: 'src/login.ts' }],
      },
      backlog: {
        epics: [{ tasks: [{ id: 'TASK-1', title: 'Fix redirect logic' }] }],
      },
    });
    const auditChecklist = buildAuditChecklist({
      fileName: 'login.fc.md',
      contractContent: `## Done When
- [ ] Bug no longer reproduces
- [ ] Tests pass (80%+ coverage)
`,
    });

    expect(executionBrief).toContain('Owner: Dev');
    expect(executionBrief).toContain('1. modify: src/login.ts');
    expect(executionBrief).toContain('TASK-1: Fix redirect logic');
    expect(auditChecklist).toContain('Owner: Iris');
    expect(auditChecklist).toContain('- [ ] Bug no longer reproduces');
    expect(auditChecklist).toContain('`grabby audit login.fc.md`');
  });

  it('derives stable execution and audit artifact paths', () => {
    expect(getExecutionBriefPath('C:\\repo\\contracts', 'login.fc.md'))
      .toBe(path.join('C:\\repo\\contracts', 'login.execute.md'));
    expect(getAuditChecklistPath('C:\\repo\\contracts', 'login.fc.md'))
      .toBe(path.join('C:\\repo\\contracts', 'login.audit.md'));
    expect(getSessionPath('C:\\repo\\contracts', 'login.fc.md', 'json'))
      .toBe(path.join('C:\\repo\\contracts', 'login.session.json'));
  });

  it('builds a machine-readable session summary', () => {
    const session = buildSessionSummary({
      request: 'create a unit test',
      persona: {
        agentKey: 'quick',
        agentName: 'Flash',
        title: 'Quick Flow Dev',
        handoffCommand: 'grabby quick',
      },
      contractFile: 'contracts/unit-test.fc.md',
      briefFile: 'contracts/unit-test.brief.md',
      handoff: 'grabby quick',
      mode: 'task',
    });

    expect(session.mode).toBe('task');
    expect(session.persona.key).toBe('quick');
    expect(session.artifacts.contractFile).toBe('contracts/unit-test.fc.md');
    expect(session.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(validateSessionSummary(session)).toEqual({ valid: true, errors: [] });
  });

  it('rejects invalid session summaries', () => {
    const validation = validateSessionSummary({
      version: SESSION_SCHEMA_VERSION,
      mode: 'broken',
      request: '',
      persona: {},
      artifacts: {},
      generatedAt: 'not-a-date',
    });

    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain('Invalid mode: broken');
  });
});
