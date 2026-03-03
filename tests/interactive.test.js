/**
 * Grabby - Interactive Module Tests
 * Coverage target: 80%+
 */

const path = require('path');
const interactive = require('../lib/interactive.cjs');

const PKG_ROOT = path.join(__dirname, '..');

// ============================================================================
// MODULE EXPORTS
// ============================================================================

describe('Module Exports', () => {
  it('should export createInteractiveHandlers function', () => {
    expect(typeof interactive.createInteractiveHandlers).toBe('function');
  });
});

// ============================================================================
// INTEGRATION WITH WORKFLOW RUNTIME
// ============================================================================

describe('Integration with Workflow Runtime', () => {
  it('should compose interactive-workflows and interactive-shell', () => {
    // The interactive module is a composition layer that combines:
    // - createWorkflowRuntime from interactive-workflows.cjs
    // - createShellHandlers from interactive-shell.cjs

    // Verify the module structure
    const moduleKeys = Object.keys(interactive);
    expect(moduleKeys).toContain('createInteractiveHandlers');
  });

  it('should export only the factory function', () => {
    // The module should be minimal, only exposing the factory
    const exportCount = Object.keys(interactive).length;
    expect(exportCount).toBe(1);
  });

  it('should delegate runtime and shell creation with the provided deps', () => {
    jest.resetModules();

    const runtime = { id: 'runtime' };
    const shellHandlers = { id: 'shell' };
    const createWorkflowRuntime = jest.fn(() => runtime);
    const createShellHandlers = jest.fn(() => shellHandlers);

    jest.doMock('../lib/interactive-workflows.cjs', () => ({ createWorkflowRuntime }));
    jest.doMock('../lib/interactive-shell.cjs', () => ({ createShellHandlers }));

    let tested;
    jest.isolateModules(() => {
      tested = require('../lib/interactive.cjs');
    });

    const deps = {
      c: { info: (value) => value },
      argv: ['node', 'grabby'],
      logger: { log: () => {} },
      extra: 'kept-for-runtime',
    };

    const result = tested.createInteractiveHandlers(deps);

    expect(createWorkflowRuntime).toHaveBeenCalledWith(deps);
    expect(createShellHandlers).toHaveBeenCalledWith({
      c: deps.c,
      argv: deps.argv,
      logger: deps.logger,
      runtime,
      workflowsDirLabel: 'workflow',
    });
    expect(result).toBe(shellHandlers);

    jest.dontMock('../lib/interactive-workflows.cjs');
    jest.dontMock('../lib/interactive-shell.cjs');
  });
});

// ============================================================================
// MODULE STRUCTURE
// ============================================================================

describe('Module Structure', () => {
  it('should be a valid CommonJS module', () => {
    expect(interactive).toBeDefined();
    expect(typeof interactive).toBe('object');
  });

  it('should not have default export', () => {
    expect(interactive.default).toBeUndefined();
  });

  it('should have named export for createInteractiveHandlers', () => {
    expect(interactive.createInteractiveHandlers).toBeDefined();
  });
});
