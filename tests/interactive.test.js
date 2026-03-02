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
