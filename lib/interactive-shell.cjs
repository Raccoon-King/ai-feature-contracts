const fs = require('fs');
const path = require('path');
const { loadConfig } = require('./config.cjs');
const { getBmadFeatureFlags, getSuggestedNextActions } = require('./commands.cjs');

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
        ticketId: options['ticket-id'],
        who: options.who,
        what: options.what,
        why: options.why,
        dod: options.dod ? parseList(options.dod) : undefined,
        taskName: options['task-name'],
        objective: options.objective,
        scopeItems: options.scope ? parseList(options.scope) : undefined,
        nonGoals: options['non-goals'] ? parseList(options['non-goals']) : undefined,
        directories: options.directories ? parseList(options.directories) : undefined,
        constraints: options.constraints,
        dependencies: options.dependencies,
        doneWhen: options['done-when'] ? parseList(options['done-when']) : undefined,
        testing: options.testing,
        selectedRole: options.role,
      },
      nonInteractive: Boolean(options.yes || options['non-interactive']),
      sessionFormat: options['session-format'],
      sessionOutput: options['session-output'],
      interactiveMode: {
        enabled: Boolean(options.interactive),
        nextAction: options.next,
        autoContinue: Boolean(options.yes),
        selectedRole: options.role,
      },
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
    const parsed = parseCommandInput(3);
    const name = argv.slice(3).find((token) => !String(token).startsWith('--'));
    const rl = runtime.createPromptInterface();

    try {
      const agentData = runtime.loadAgent('quick');
      if (!agentData) {
        logger.log(c.error('Quick Flow agent not found'));
        return;
      }

      if (!name && parsed.nonInteractive) {
        logger.log('Quick workflow requires prompts to create a spec.');
        logger.log('Use: grabby quick');
        logger.log('Or:  grabby quick <contract.quick.md>');
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
        interactiveMode: parsed.interactiveMode,
      });
    } finally {
      rl.close();
    }
  }

  async function ticket() {
    const parsed = parseCommandInput(3);
    const rl = runtime.createPromptInterface();

    try {
      await runtime.runTicketWizardWorkflow(rl, parsed.request, {
        input: parsed.input,
        nonInteractive: parsed.nonInteractive,
        interactiveMode: parsed.interactiveMode,
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
        interactiveMode: parsed.interactiveMode,
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

  1. ${c.agent('Ari')} analyzes the request and structures intake (AN)
  2. ${c.agent('Archie')} creates the contract (CC)
  3. ${c.agent('Val')} validates and checks risks (VC, RC)
  4. ${c.agent('Sage')} generates optimized plan (GP)
  5. ${c.agent('Dev')} executes the contract (EX)
  6. ${c.agent('Tess')} verifies regression coverage and test readiness (TS)
  7. ${c.agent('Iris')} audits the result (AU)

To start, run:
  grabby agent analyst AN

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
    if (wf.progress?.status) {
      logger.log(`Status: ${wf.progress.status}`);
    }
    if (wf.nextStep?.goal) {
      logger.log(`Next Step: ${wf.nextStep.goal}`);
    } else if (wf.nextStep) {
      logger.log(`Next Step: ${wf.nextStep}`);
    }
    logger.log('\nSteps:');
    wf.steps.forEach((step, index) => {
      logger.log(`  ${index + 1}. ${step.goal}`);
    });
    if (workflowName === 'sprint-status') {
      const cwd = process.cwd();
      const contractsDir = path.join(cwd, 'contracts');
      const stats = { total: 0, draft: 0, approved: 0, executing: 0, complete: 0 };
      if (fs.existsSync(contractsDir)) {
        fs.readdirSync(contractsDir)
          .filter((file) => file.endsWith('.fc.md'))
          .forEach((file) => {
            stats.total += 1;
            const content = fs.readFileSync(path.join(contractsDir, file), 'utf8');
            const status = (content.match(/\*\*Status:\*\*\s*([a-z_]+)/i)?.[1] || 'draft').toLowerCase();
            if (status === 'approved') stats.approved += 1;
            else if (status === 'executing') stats.executing += 1;
            else if (status === 'complete' || status === 'completed') stats.complete += 1;
            else stats.draft += 1;
          });
      }
      const readiness = stats.draft > 0
        ? 'CONCERNS'
        : (stats.total > 0 && (stats.approved > 0 || stats.executing > 0 || stats.complete > 0) ? 'PASS' : 'FAIL');
      logger.log('\nStatus Summary:');
      logger.log(`  Contracts: ${stats.total} (draft=${stats.draft}, approved=${stats.approved}, executing=${stats.executing}, complete=${stats.complete})`);
      logger.log(`Readiness: ${readiness}`);
      if (readiness === 'FAIL') logger.log('  Next: grabby task "<request>"');
      if (readiness === 'CONCERNS') logger.log('  Next: grabby validate <file> && grabby plan <file>');
      if (readiness === 'PASS') logger.log('  Next: grabby execute <file> && grabby audit <file>');
    }
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
      logger.log(`     Step: ${progress.step} | Status: ${progress.status || 'in_progress'} | ${c.dim(ago + ' minutes ago')}`);
      if (progress.nextStep) {
        logger.log(`     Next: ${progress.nextStep}`);
      }
      if (progress.resumeCommand) {
        logger.log(`     Resume: ${progress.resumeCommand}`);
      }
    });

    logger.log('\n' + c.dim('To resume, re-run the workflow command.'));
    logger.log(c.dim('To clear: delete .grabby-progress/ directory'));
  }

  function help() {
    const cwd = process.cwd();
    const config = loadConfig(cwd) || {};
    const llmFirstOnlyMode = Boolean(
      config?.workflow?.externalLlmOnly === true
      || config?.workflow?.llmFirstOnly === true
    );
    const featureFlags = getBmadFeatureFlags(config);
    const contractsDir = path.join(cwd, 'contracts');
    const stats = { total: 0, draft: 0, approved: 0, executing: 0, complete: 0 };
    if (fs.existsSync(contractsDir)) {
      fs.readdirSync(contractsDir)
        .filter((file) => file.endsWith('.fc.md'))
        .forEach((file) => {
          stats.total += 1;
          const content = fs.readFileSync(path.join(contractsDir, file), 'utf8');
          const status = (content.match(/\*\*Status:\*\*\s*([a-z_]+)/i)?.[1] || 'draft').toLowerCase();
          if (status === 'approved') stats.approved += 1;
          else if (status === 'executing') stats.executing += 1;
          else if (status === 'complete' || status === 'completed') stats.complete += 1;
          else stats.draft += 1;
        });
    }
    const suggested = getSuggestedNextActions({ contractStats: stats, featureFlags });

    if (llmFirstOnlyMode) {
      logger.log(`
${c.heading('Grabby - CLI (LLM-First Mode)')}

${c.bold('Suggested Now:')}
${suggested.map((item) => `  ${item.command}  ${c.dim(`- ${item.reason}`)}`).join('\n') || `  ${c.dim('No suggestions available')}`}

${c.bold('Primary Workflow Commands:')}
  grabby                       Open the interactive menu (TTY only)
  grabby init                  Initialize in current project
  grabby init-hooks            Install repo hooks
  grabby task <request>        Persona-led task breakdown and scaffold
  grabby ticket <request>      Generate Who/What/Why/DoD ticket draft
  grabby orchestrate <request> Full persona handoff in one CLI session
  grabby create <name>         Create new contract
  grabby validate <file>       Validate contract
  grabby plan <file>           Generate plan (Phase 1)
  grabby backlog <file>        Generate Agile epic/task/subtask backlog
  grabby prompt <file>         Render an LLM instruction bundle
  grabby install:prompt        Generate post-init setup prompt for any AI assistant
  grabby session <file>        Inspect or regenerate session artifacts
  grabby approve <file>        Approve for execution
  grabby execute <file>        Execute instructions (Phase 2)
  grabby run <file>            Alias for execute
  grabby guard <file>          Validate execution scope from plan
  grabby audit <file>          Post-execution audit
  grabby list                  List all contracts

${c.bold('Git + Workflow Safety:')}
  grabby git:status            Show branch, dirty state, upstream, and divergence
  grabby git:sync              Fetch origin and report divergence safely
  grabby git:start <file>      Create a contract-linked branch
  grabby git:update            Run a guarded branch update flow
  grabby git:preflight [file]  Verify git readiness before risky work
  grabby context:lint          Validate context references
  grabby policy:check          Apply governance policy checks

${c.bold('Agent Commands:')}
  grabby agent list            List available agents
  grabby agent <name>          Load agent and show menu
  grabby agent:lint            Validate built-in agent definitions
  grabby quick                 Quick flow for small bounded changes
  grabby workflow <name>       View workflow details
  grabby resume                Resume saved workflow progress
  grabby party                 Show full team handoff map

${c.bold('Feature Lifecycle:')}
  grabby features:list         List contract-backed features
  grabby features:status <id>  Show contract/plan/audit status for one feature
  grabby features:refresh      Regenerate .grabby/features.index.json
  grabby feature describe <id> Alias for features:status <id>
  grabby feature close <id>    Archive a completed feature
  grabby feature gc [action]   Manage hanging active contracts

${c.bold('Policy:')}
  This repo runs in LLM-first mode. Non-workflow commands are hidden and disabled by policy.
`);
      return;
    }

    logger.log(`
${c.heading('Grabby - CLI')}

${c.bold('Suggested Now:')}
${suggested.map((item) => `  ${item.command}  ${c.dim(`- ${item.reason}`)}`).join('\n') || `  ${c.dim('No suggestions available')}`}

${c.bold('Core Commands:')}
  grabby                      Open the GrabbyAI home menu (TTY only)
  grabby init                  Initialize in current project
  grabby init --interactive    Initialize and persist interactive mode defaults
  grabby update                Check/apply Grabby CLI updates
  grabby update --check        Check installed vs latest Grabby version
  grabby update --yes          Install latest Grabby globally
  grabby create <name>         Create new contract
  grabby validate <file>       Validate contract
  grabby plan <file>           Generate plan (Phase 1)
  grabby backlog <file>        Generate Agile epic/task/subtask backlog
  grabby prompt <file>         Render an LLM instruction bundle
  grabby install:prompt        Generate post-init setup prompt for any AI assistant
  grabby session <file>        Inspect or regenerate session artifacts
  grabby approve <file>        Approve for execution
  grabby execute <file>        Execute instructions (Phase 2)
  grabby run <file>            Alias for execute
  grabby guard <file>          Validate execution scope from plan
  grabby audit <file>          Post-execution audit
  grabby git:status            Show branch, dirty state, upstream, and divergence
  grabby git:sync              Fetch origin and report divergence safely
  grabby git:start <file>      Create a contract-linked branch
  grabby git:update            Run a guarded branch update flow
  grabby git:preflight [file]  Verify git readiness before risky work
  grabby list                  List all contracts

${c.bold('Agent Commands:')}
  grabby agent list            List available agents
  grabby agent <name>          Load agent and show menu
  grabby agent:lint            Validate built-in agent definitions
  grabby agent analyst         ${c.dim('Ari - Request analysis and ticket intake')}
  grabby agent architect       ${c.dim('Archie - Contract creation')}
  grabby agent validator       ${c.dim('Val - Validation & risk analysis')}
  grabby agent strategist      ${c.dim('Sage - Plan generation')}
  grabby agent dev             ${c.dim('Dev - Contract execution')}
  grabby agent tester          ${c.dim('Tess - Verification and regression coverage')}
  grabby agent auditor         ${c.dim('Iris - Post-execution audit')}
  grabby agent quick           ${c.dim('Flash - Quick flow for small changes')}

${c.bold('Quick Commands:')}
  grabby task <request>       Persona-led task breakdown and scaffold
  grabby ticket <request>     Generate a Who/What/Why/DoD ticket draft
  grabby orchestrate <request> Full persona handoff in one CLI session
  grabby tui                  Open the menu-based GrabbyAI home screen
  grabby quick                 Create quick spec (fast track)
  grabby quick <file>          Implement quick spec
  grabby party                 Load full team (multi-agent)
  grabby workflow <name>       View/run workflow directly

${c.bold('Also Available:')}
  grabby features:list       List contract-backed features
  grabby features:status     Show contract/plan/audit status for one feature
  grabby features:refresh    Regenerate the feature index cache

${c.bold('Contract Levels:')}
  grabby contracts           View all contracts (system + project)
  grabby contracts:clean-local Remove local-only Grabby artifacts under .grabby/
  grabby system init         Initialize global system contracts
  grabby system list         List system-level contracts
  grabby system add <file>   Promote contract to system level
  grabby system remove <n>   Remove from system level

${c.bold('Feature Management:')}
  grabby feature describe    Alias for contract-backed feature status/details

${c.bold('Options:')}
  --output <mode>           Output mode: console, file, or both
  --ticket-id <value>      Explicit ticket ID for intake/output
  --who <value>            Ticket Who field
  --what <value>           Ticket What field
  --why <value>            Ticket Why field
  --dod <a,b,c>            Ticket Definition of Done bullets
  --task-name <value>       Override inferred task title for task/orchestrate
  --objective <value>       Non-interactive objective for task/orchestrate
  --scope <a,b,c>           Comma-separated scope items
  --non-goals <a,b>         Comma-separated non-goals
  --directories <a,b>       Comma-separated allowed directories
  --constraints <value>     Constraints for the task
  --dependencies <value>    Allowed dependencies or "none"
  --done-when <a,b>         Comma-separated done-when criteria
  --testing <value>         Testing approach text
  --interactive             Enable interactive decision breakpoints for this session
  --tier <1|2|3>            Tier for install prompt detail level (install:prompt)
  --check                   Check-only mode for supported commands (e.g., update)
  --next <action>           Script a breakpoint decision: continue, revise-contract, revise-plan, switch-role, pause, abort
  --role <name>             Role override for switch-role prompts (dev, analyst, tester)
  --yes                     Skip confirmation prompts for task/orchestrate
  --non-interactive         Use defaults instead of prompts where values are missing
  --session-format <fmt>    Write machine-readable session output: json or yaml
  --session-output <path>   Override machine-readable session artifact path

${c.bold('Menu Highlights:')}
  Contract Workflow drives create, validate, plan, approve, execute, audit, and archive from the menu.
  Settings menu toggles interactive mode, menu-on-start, startup art, and ruleset wizard support.
  Ruleset Wizards guide importing existing standards or creating local repo rulesets.

${c.bold('Acknowledgements:')}
  Grabby credits BMAD Method (BMad Code) for workflow influence and selected optional patterns.
  Source: https://github.com/bmad-code-org/BMAD-METHOD
`);
  }

  function resolveContract(file) {
    return runtime.resolveContract(file);
  }

  return {
    agentList,
    agent,
    task,
    ticket,
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

