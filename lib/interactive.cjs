const { createWorkflowRuntime } = require('./interactive-workflows.cjs');
const { createShellHandlers } = require('./interactive-shell.cjs');

function createInteractiveHandlers(deps) {
  const runtime = createWorkflowRuntime(deps);

  return createShellHandlers({
    c: deps.c,
    argv: deps.argv,
    logger: deps.logger,
    runtime,
    workflowsDirLabel: 'workflow',
  });
}

module.exports = { createInteractiveHandlers };
