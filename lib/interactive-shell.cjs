function createShellHandlers(deps) {
  const {
    c,
    argv = process.argv,
    logger = console,
    runtime,
    workflowsDirLabel = 'workflow',
  } = deps;

  function parseList(value) {
    return String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function parseCommandInput(startIndex) {
    const positional = [];
    const options = {};

    for (let index = startIndex; index < argv.length; index += 1) {
      const token = argv[index];
      if (!token.startsWith('--')) {
        positional.push(token);
        continue;
      }

      const key = token.slice(2);
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) {
        options[key] = true;
        continue;
      }

      options[key] = next;
      index += 1;
    }

    return {
      request: positional.join(' ').trim(),
      input: {
        request: options.request || positional.join(' ').trim(),
        taskName: options['task-name'],
        objective: options.objective,
        scopeItems: options.scope ? parseList(options.scope) : undefined,
        nonGoals: options['non-goals'] ? parseList(options['non-goals']) : undefined,
        directories: options.directories ? parseList(options.directories) : undefined,
        constraints: options.constraints,
        dependencies: options.dependencies,
        doneWhen: options['done-when'] ? parseList(options['done-when']) : undefined,
        testing: options.testing,
      },
      nonInteractive: Boolean(options.yes || options['non-interactive']),
      sessionFormat: options['session-format'],
      sessionOutput: options['session-output'],
    };
  }

  function agentList() {
    const agents = runtime.listAgents();

    if (agents.length === 0) {
      logger.log('No agents found.');
      return;
    }

    logger.log('\n' + '-'.repeat(50));
    logger.log('AVAILABLE AGENTS');
    logger.log('-'.repeat(50) + '\n');

    agents.forEach((agent) => {
      logger.log(`  ${agent.icon} ${agent.name} - ${agent.title}`);
      logger.log(`     ${agent.capabilities}`);
      logger.log(`     Usage: grabby agent ${agent.name.toLowerCase()}`);
      logger.log('');
    });

    logger.log('-'.repeat(50));
    logger.log('Use: grabby agent <name> to load an agent');
    logger.log('Use: grabby agent <name> <command> to run a workflow');
    logger.log('');
  }

  async function agent() {
    const agentName = argv[3];
    const command = argv[4];
    const commandArgs = argv.slice(5).filter((arg) => !arg.startsWith('--'));

    if (!agentName || agentName === 'list') {
      agentList();
      return;
    }

    await runtime.executeAgentCommand(agentName, command, commandArgs);
  }

  async function quick() {
    const name = argv[3];
    const rl = runtime.createPromptInterface();

    try {
      const agentData = runtime.loadAgent('quick');
      if (!agentData) {
        logger.log(c.error('Quick Flow agent not found'));
        return;
      }

      if (!name) {
        await runtime.runQuickSpecWorkflow(rl, agentData);
      } else {
        await runtime.runQuickDevWorkflow(rl, agentData, name);
      }
    } finally {
      rl.close();
    }
  }

  async function task() {
    const parsed = parseCommandInput(3);
    const rl = runtime.createPromptInterface();

    try {
      await runtime.runTaskBreakdownWorkflow(rl, parsed.request, {
        orchestrate: false,
        input: parsed.input,
        nonInteractive: parsed.nonInteractive,
        sessionFormat: parsed.sessionFormat,
        sessionOutput: parsed.sessionOutput,
      });
    } finally {
      rl.close();
    }
  }

  async function orchestrate() {
    const parsed = parseCommandInput(3);
    const rl = runtime.createPromptInterface();

    try {
      await runtime.runTaskBreakdownWorkflow(rl, parsed.request, {
        orchestrate: true,
        input: parsed.input,
        nonInteractive: parsed.nonInteractive,
        sessionFormat: parsed.sessionFormat,
        sessionOutput: parsed.sessionOutput,
      });
    } finally {
      rl.close();
    }
  }

  async function party() {
    logger.log('\n' + c.heading('-'.repeat(50)));
    logger.log(c.heading('?? PARTY MODE - Full Team'));
    logger.log(c.heading('-'.repeat(50)));

    const agents = runtime.listAgents();
    logger.log('\nLoading the full team...\n');
    agents.forEach((agent) => {
      logger.log(`  ${agent.icon} ${c.agent(agent.name)} - ${agent.title}`);
    });

    logger.log('\n' + '-'.repeat(50));
    logger.log(c.bold('TEAM WORKFLOW'));
    logger.log('-'.repeat(50));
    logger.log(`
Party mode enables sequential agent handoffs:

  1. ${c.agent('Archie')} creates the contract (CC)
  2. ${c.agent('Val')} validates and checks risks (VC, RC)
  3. ${c.agent('Sage')} generates optimized plan (GP)
  4. ${c.agent('Dev')} executes the contract (EX)
  5. ${c.agent('Iris')} audits the result (AU)

To start, run:
  grabby agent architect CC

After each step, the agent will suggest the next action.
`);
  }

  async function workflow() {
    const workflowName = argv[3];

    if (!workflowName) {
      logger.log('\n' + c.heading('Available Workflows'));
      logger.log('-'.repeat(50));
      runtime.listWorkflowMetadata().forEach((wf) => {
        logger.log(`  ${c.info(wf.name)}`);
        logger.log(`    ${c.dim(wf.description || 'No description')}`);
      });
      logger.log(`\nUsage: grabby ${workflowsDirLabel} <name>`);
      return;
    }

    const wf = runtime.getWorkflowDetails(workflowName);
    if (!wf) {
      logger.log(c.error(`Workflow not found: ${workflowName}`));
      return;
    }

    logger.log('\n' + c.heading('-'.repeat(50)));
    logger.log(c.heading(`Workflow: ${wf.name}`));
    logger.log(c.heading('-'.repeat(50)));
    logger.log(`\n${wf.description}`);
    logger.log(`\nAgent: ${wf.agent}`);
    logger.log('\nSteps:');
    wf.steps.forEach((step, index) => {
      logger.log(`  ${index + 1}. ${step.goal}`);
    });
    logger.log(`\nRun via agent: grabby agent ${wf.agent}`);
  }

  function resume() {
    const progressList = runtime.listProgress();

    if (progressList.length === 0) {
      logger.log(c.dim('\nNo saved progress found.'));
      logger.log('Start a workflow with: grabby agent <name> <command>');
      return;
    }

    logger.log('\n' + c.heading('Saved Progress'));
    logger.log('-'.repeat(50));

    progressList.forEach((progress, index) => {
      const ago = Math.round((Date.now() - new Date(progress.timestamp).getTime()) / 60000);
      logger.log(`  ${index + 1}. ${c.info(progress.workflow)}`);
      logger.log(`     Step: ${progress.step} | ${c.dim(ago + ' minutes ago')}`);
    });

    logger.log('\n' + c.dim('To resume, re-run the workflow command.'));
    logger.log(c.dim('To clear: delete .grabby-progress/ directory'));
  }

  function help() {
    logger.log(`
${c.heading('Grabby - CLI')}

${c.bold('Core Commands:')}
  grabby init                  Initialize in current project
  grabby create <name>         Create new contract
  grabby validate <file>       Validate contract
  grabby plan <file>           Generate plan (Phase 1)
  grabby backlog <file>        Generate Agile epic/task/subtask backlog
  grabby prompt <file>         Render an LLM instruction bundle
  grabby session <file>        Inspect or regenerate session artifacts
  grabby approve <file>        Approve for execution
  grabby execute <file>        Execute instructions (Phase 2)
  grabby audit <file>          Post-execution audit
  grabby list                  List all contracts

${c.bold('Agent Commands:')}
  grabby agent list            List available agents
  grabby agent <name>          Load agent and show menu
  grabby agent architect       ${c.dim('Archie - Contract creation')}
  grabby agent validator       ${c.dim('Val - Validation & risk analysis')}
  grabby agent strategist      ${c.dim('Sage - Plan generation')}
  grabby agent dev             ${c.dim('Dev - Contract execution')}
  grabby agent auditor         ${c.dim('Iris - Post-execution audit')}
  grabby agent quick           ${c.dim('Flash - Quick flow for small changes')}

${c.bold('Quick Commands:')}
  grabby task <request>       Persona-led task breakdown and scaffold
  grabby orchestrate <request> Full persona handoff in one CLI session
  grabby quick                 Create quick spec (fast track)
  grabby quick <file>          Implement quick spec
  grabby party                 Load full team (multi-agent)
  grabby workflow <name>       View/run workflow directly

${c.bold('Contract Levels:')}
  grabby contracts           View all contracts (system + project)
  grabby system init         Initialize global system contracts
  grabby system list         List system-level contracts
  grabby system add <file>   Promote contract to system level
  grabby system remove <n>   Remove from system level

${c.bold('Feature Management:')}
  grabby features            List all tracked features
  grabby feature add [name]  Add a new feature
  grabby feature describe    Show feature details
  grabby feature enhance     Propose enhancement
  grabby feature chat        Interactive feature discussion

${c.bold('Options:')}
  --output <mode>           Output mode: console, file, or both
  --task-name <value>       Override inferred task title for task/orchestrate
  --objective <value>       Non-interactive objective for task/orchestrate
  --scope <a,b,c>           Comma-separated scope items
  --non-goals <a,b>         Comma-separated non-goals
  --directories <a,b>       Comma-separated allowed directories
  --constraints <value>     Constraints for the task
  --dependencies <value>    Allowed dependencies or "none"
  --done-when <a,b>         Comma-separated done-when criteria
  --testing <value>         Testing approach text
  --yes                     Skip confirmation prompts for task/orchestrate
  --non-interactive         Use defaults instead of prompts where values are missing
  --session-format <fmt>    Write machine-readable session output: json or yaml
  --session-output <path>   Override machine-readable session artifact path
`);
  }

  function resolveContract(file) {
    return runtime.resolveContract(file);
  }

  return {
    agentList,
    agent,
    task,
    orchestrate,
    quick,
    party,
    workflow,
    resume,
    help,
    resolveContract,
  };
}

module.exports = { createShellHandlers };

