const { createShellHandlers } = require('../lib/interactive-shell.cjs');

function createLogger() {
  const lines = [];
  return {
    lines,
    log: (...values) => lines.push(values.join(' ')),
  };
}

function createFormatter() {
  return {
    error: (v) => v,
    success: (v) => v,
    warn: (v) => v,
    info: (v) => v,
    dim: (v) => v,
    bold: (v) => v,
    heading: (v) => v,
    agent: (v) => v,
  };
}

describe('Interactive shell', () => {
  it('shows empty and populated agent lists', () => {
    const logger = createLogger();
    const handlers = createShellHandlers({
      c: createFormatter(),
      logger,
      runtime: {
        listAgents: () => [],
      },
    });

    handlers.agentList();
    expect(logger.lines.join('\n')).toContain('No agents found.');

    logger.lines.length = 0;
    const populated = createShellHandlers({
      c: createFormatter(),
      logger,
      runtime: {
        listAgents: () => [{ icon: '*', name: 'Dev', title: 'Builder', capabilities: 'ships code' }],
      },
    });

    populated.agentList();
    expect(logger.lines.join('\n')).toContain('AVAILABLE AGENTS');
    expect(logger.lines.join('\n')).toContain('Dev - Builder');
  });

  it('routes agent command execution from argv', async () => {
    const executed = [];
    const handlers = createShellHandlers({
      c: createFormatter(),
      argv: ['node', 'cli', 'agent', 'architect', 'CC', 'demo.fc.md'],
      runtime: {
        listAgents: () => [],
        executeAgentCommand: async (...args) => executed.push(args),
      },
    });

    await handlers.agent();
    expect(executed).toEqual([['architect', 'CC', ['demo.fc.md']]]);
  });

  it('handles agent list mode without execution', async () => {
    const logger = createLogger();
    const handlers = createShellHandlers({
      c: createFormatter(),
      logger,
      argv: ['node', 'cli', 'agent', 'list'],
      runtime: {
        listAgents: () => [],
        executeAgentCommand: async () => {
          throw new Error('should not run');
        },
      },
    });

    await handlers.agent();
    expect(logger.lines.join('\n')).toContain('No agents found.');
  });

  it('runs quick workflows for missing and present quick specs', async () => {
    const logger = createLogger();
    const closed = [];
    const calls = [];
    const handlers = createShellHandlers({
      c: createFormatter(),
      logger,
      argv: ['node', 'cli', 'quick'],
      runtime: {
        createPromptInterface: () => ({ close: () => closed.push('closed') }),
        loadAgent: () => ({ agent: { metadata: { name: 'Quick' } } }),
        runQuickSpecWorkflow: async () => calls.push('spec'),
        runQuickDevWorkflow: async () => calls.push('dev'),
      },
    });

    await handlers.quick();
    expect(calls).toEqual(['spec']);
    expect(closed).toEqual(['closed']);

    const handlersWithFile = createShellHandlers({
      c: createFormatter(),
      logger,
      argv: ['node', 'cli', 'quick', 'demo.quick.md'],
      runtime: {
        createPromptInterface: () => ({ close: () => closed.push('closed-2') }),
        loadAgent: () => ({ agent: { metadata: { name: 'Quick' } } }),
        runQuickSpecWorkflow: async () => calls.push('spec-2'),
        runQuickDevWorkflow: async (_rl, _agent, file) => calls.push(file),
      },
    });

    await handlersWithFile.quick();
    expect(calls).toContain('demo.quick.md');
    expect(closed).toContain('closed-2');
  });

  it('routes task breakdown through the interactive runtime', async () => {
    const closed = [];
    const calls = [];
    const handlers = createShellHandlers({
      c: createFormatter(),
      argv: ['node', 'cli', 'task', 'create', 'a', 'unit', 'test'],
      runtime: {
        createPromptInterface: () => ({ close: () => closed.push('closed') }),
        runTaskBreakdownWorkflow: async (_rl, request) => calls.push(request),
      },
    });

    await handlers.task();
    expect(calls).toEqual(['create a unit test']);
    expect(closed).toEqual(['closed']);
  });

  it('passes non-interactive task flags through to the runtime', async () => {
    const closed = [];
    const calls = [];
    const handlers = createShellHandlers({
      c: createFormatter(),
      argv: [
        'node', 'cli', 'task', 'create', 'a', 'unit', 'test',
        '--task-name', 'Login Unit Test',
        '--scope', 'add login test,keep scope bounded',
        '--done-when', 'tests pass,lint passes',
        '--session-format', 'json',
        '--yes',
      ],
      runtime: {
        createPromptInterface: () => ({ close: () => closed.push('closed') }),
        runTaskBreakdownWorkflow: async (_rl, request, options) => calls.push({ request, options }),
      },
    });

    await handlers.task();
    expect(calls).toEqual([{
      request: 'create a unit test',
      options: {
        orchestrate: false,
        input: {
          request: 'create a unit test',
          taskName: 'Login Unit Test',
          objective: undefined,
          scopeItems: ['add login test', 'keep scope bounded'],
          nonGoals: undefined,
          directories: undefined,
          constraints: undefined,
          dependencies: undefined,
          doneWhen: ['tests pass', 'lint passes'],
          testing: undefined,
        },
        nonInteractive: true,
        sessionFormat: 'json',
        sessionOutput: undefined,
      },
    }]);
    expect(closed).toEqual(['closed']);
  });

  it('routes orchestration through the interactive runtime', async () => {
    const closed = [];
    const calls = [];
    const handlers = createShellHandlers({
      c: createFormatter(),
      argv: ['node', 'cli', 'orchestrate', 'fix', 'login', 'redirect', 'bug'],
      runtime: {
        createPromptInterface: () => ({ close: () => closed.push('closed') }),
        runTaskBreakdownWorkflow: async (_rl, request, options) => calls.push({ request, options }),
      },
    });

    await handlers.orchestrate();
    expect(calls).toEqual([{
      request: 'fix login redirect bug',
      options: {
        orchestrate: true,
        input: {
          request: 'fix login redirect bug',
          taskName: undefined,
          objective: undefined,
          scopeItems: undefined,
          nonGoals: undefined,
          directories: undefined,
          constraints: undefined,
          dependencies: undefined,
          doneWhen: undefined,
          testing: undefined,
        },
        nonInteractive: false,
        sessionFormat: undefined,
        sessionOutput: undefined,
      },
    }]);
    expect(closed).toEqual(['closed']);
  });

  it('reports missing quick agent', async () => {
    const logger = createLogger();
    const handlers = createShellHandlers({
      c: createFormatter(),
      logger,
      argv: ['node', 'cli', 'quick'],
      runtime: {
        createPromptInterface: () => ({ close: () => {} }),
        loadAgent: () => null,
      },
    });

    await handlers.quick();
    expect(logger.lines.join('\n')).toContain('Quick Flow agent not found');
  });

  it('renders party output', async () => {
    const logger = createLogger();
    const handlers = createShellHandlers({
      c: createFormatter(),
      logger,
      runtime: {
        listAgents: () => [{ icon: '*', name: 'Dev', title: 'Builder' }],
      },
    });

    await handlers.party();
    expect(logger.lines.join('\n')).toContain('PARTY MODE - Full Team');
    expect(logger.lines.join('\n')).toContain('TEAM WORKFLOW');
  });

  it('lists and displays workflows', async () => {
    const logger = createLogger();
    const handlers = createShellHandlers({
      c: createFormatter(),
      logger,
      argv: ['node', 'cli', 'workflow'],
      runtime: {
        listWorkflowMetadata: () => [{ name: 'generate-plan', description: 'Build a plan' }],
        getWorkflowDetails: () => null,
      },
    });

    await handlers.workflow();
    expect(logger.lines.join('\n')).toContain('Available Workflows');
    expect(logger.lines.join('\n')).toContain('generate-plan');

    logger.lines.length = 0;
    const detailHandlers = createShellHandlers({
      c: createFormatter(),
      logger,
      argv: ['node', 'cli', 'workflow', 'generate-plan'],
      runtime: {
        listWorkflowMetadata: () => [],
        getWorkflowDetails: () => ({
          name: 'generate-plan',
          description: 'Build a plan',
          agent: 'strategist',
          steps: [{ goal: 'Read contract' }, { goal: 'Write plan' }],
        }),
      },
    });

    await detailHandlers.workflow();
    expect(logger.lines.join('\n')).toContain('Workflow: generate-plan');
    expect(logger.lines.join('\n')).toContain('1. Read contract');
  });

  it('reports missing workflow', async () => {
    const logger = createLogger();
    const handlers = createShellHandlers({
      c: createFormatter(),
      logger,
      argv: ['node', 'cli', 'workflow', 'missing'],
      runtime: {
        listWorkflowMetadata: () => [],
        getWorkflowDetails: () => null,
      },
    });

    await handlers.workflow();
    expect(logger.lines.join('\n')).toContain('Workflow not found: missing');
  });

  it('shows resume output for empty and populated progress', () => {
    const logger = createLogger();
    const handlers = createShellHandlers({
      c: createFormatter(),
      logger,
      runtime: {
        listProgress: () => [],
      },
    });

    handlers.resume();
    expect(logger.lines.join('\n')).toContain('No saved progress found.');

    logger.lines.length = 0;
    const resumed = createShellHandlers({
      c: createFormatter(),
      logger,
      runtime: {
        listProgress: () => [{
          workflow: 'generate-plan',
          step: 2,
          timestamp: new Date().toISOString(),
        }],
      },
    });

    resumed.resume();
    expect(logger.lines.join('\n')).toContain('Saved Progress');
    expect(logger.lines.join('\n')).toContain('generate-plan');
  });

  it('renders help and delegates resolveContract', () => {
    const logger = createLogger();
    const handlers = createShellHandlers({
      c: createFormatter(),
      logger,
      runtime: {
        resolveContract: (file) => `resolved:${file}`,
      },
    });

    handlers.help();
    expect(logger.lines.join('\n')).toContain('Grabby - CLI');
    expect(logger.lines.join('\n')).toContain('grabby backlog <file>');
    expect(logger.lines.join('\n')).toContain('grabby task <request>');
    expect(logger.lines.join('\n')).toContain('grabby orchestrate <request>');

    expect(handlers.resolveContract('demo.fc.md')).toBe('resolved:demo.fc.md');
  });
});

