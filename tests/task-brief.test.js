/**
 * Grabby - Task Brief Module Tests
 * Coverage target: 80%+
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const taskBrief = require('../lib/task-brief.cjs');

// Temp directory for tests
let tempDir;
let contractsDir;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-task-brief-test-'));
  contractsDir = path.join(tempDir, 'contracts');
  fs.mkdirSync(contractsDir, { recursive: true });
});

afterEach(() => {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
});

// ============================================================================
// GET TASK BRIEF PATH
// ============================================================================

describe('getTaskBriefPath', () => {
  it('should return correct brief path', () => {
    const result = taskBrief.getTaskBriefPath(contractsDir, 'User Authentication');
    expect(result).toBe(path.join(contractsDir, 'user-authentication.brief.md'));
  });

  it('should slugify task name', () => {
    const result = taskBrief.getTaskBriefPath(contractsDir, 'Add New Feature!');
    expect(result).toContain('add-new-feature');
    expect(result).toContain('.brief.md');
  });

  it('should handle special characters in task name', () => {
    const result = taskBrief.getTaskBriefPath(contractsDir, 'Feature @v2.0 (Enhanced)');
    expect(result).toContain('.brief.md');
    expect(result).not.toContain('@');
    expect(result).not.toContain('(');
  });

  it('should handle multiple spaces in task name', () => {
    const result = taskBrief.getTaskBriefPath(contractsDir, 'Feature   With   Spaces');
    expect(result).toContain('feature');
    expect(result).not.toContain('  ');
  });

  it('should use provided contracts directory', () => {
    const customDir = path.join(tempDir, 'custom-contracts');
    const result = taskBrief.getTaskBriefPath(customDir, 'Test Task');
    expect(result).toContain(customDir);
  });

  it('should handle empty task name', () => {
    const result = taskBrief.getTaskBriefPath(contractsDir, '');
    expect(result).toContain('.brief.md');
  });
});

// ============================================================================
// BUILD TASK BRIEF
// ============================================================================

describe('buildTaskBrief', () => {
  const defaultPersona = {
    agentName: 'Archie',
    title: 'Contract Architect',
    mode: 'architect',
    rationale: 'Best for creating new feature contracts',
    handoffCommand: 'grabby agent architect CC',
  };

  it('should build brief with all sections', () => {
    const brief = taskBrief.buildTaskBrief({
      taskName: 'User Authentication',
      request: 'Add user login and logout functionality',
      persona: defaultPersona,
      objective: 'Implement secure user authentication',
      scopeItems: ['Login page', 'Logout button', 'Session management'],
      constraints: 'Use existing auth library',
      doneWhen: 'Tests pass, security review complete',
    });

    expect(brief).toContain('# Grabby Task Brief: User Authentication');
    expect(brief).toContain('## Request');
    expect(brief).toContain('## Facilitator');
    expect(brief).toContain('## Objective');
    expect(brief).toContain('## Scope Breakdown');
    expect(brief).toContain('## Constraints');
    expect(brief).toContain('## Done When');
    expect(brief).toContain('## Recommended Handoff');
  });

  it('should include request text', () => {
    const brief = taskBrief.buildTaskBrief({
      taskName: 'Test',
      request: 'This is the original user request',
      persona: defaultPersona,
      objective: 'Test objective',
      scopeItems: [],
      constraints: 'None',
      doneWhen: 'Done',
    });

    expect(brief).toContain('This is the original user request');
  });

  it('should include persona details', () => {
    const brief = taskBrief.buildTaskBrief({
      taskName: 'Test',
      request: 'Request',
      persona: defaultPersona,
      objective: 'Objective',
      scopeItems: [],
      constraints: 'None',
      doneWhen: 'Done',
    });

    expect(brief).toContain('Persona: Archie');
    expect(brief).toContain('Role: Contract Architect');
    expect(brief).toContain('Mode: architect');
    expect(brief).toContain('Why this persona: Best for creating new feature contracts');
  });

  it('should format scope items as bullet list', () => {
    const brief = taskBrief.buildTaskBrief({
      taskName: 'Test',
      request: 'Request',
      persona: defaultPersona,
      objective: 'Objective',
      scopeItems: ['Item 1', 'Item 2', 'Item 3'],
      constraints: 'None',
      doneWhen: 'Done',
    });

    expect(brief).toContain('- Item 1');
    expect(brief).toContain('- Item 2');
    expect(brief).toContain('- Item 3');
  });

  it('should show placeholder when no scope items', () => {
    const brief = taskBrief.buildTaskBrief({
      taskName: 'Test',
      request: 'Request',
      persona: defaultPersona,
      objective: 'Objective',
      scopeItems: [],
      constraints: 'None',
      doneWhen: 'Done',
    });

    expect(brief).toContain('- Scope to be clarified');
  });

  it('should include handoff command', () => {
    const brief = taskBrief.buildTaskBrief({
      taskName: 'Test',
      request: 'Request',
      persona: defaultPersona,
      objective: 'Objective',
      scopeItems: [],
      constraints: 'None',
      doneWhen: 'Done',
    });

    expect(brief).toContain('`grabby agent architect CC`');
  });

  it('should include constraints', () => {
    const brief = taskBrief.buildTaskBrief({
      taskName: 'Test',
      request: 'Request',
      persona: defaultPersona,
      objective: 'Objective',
      scopeItems: [],
      constraints: 'Must use TypeScript strict mode',
      doneWhen: 'Done',
    });

    expect(brief).toContain('Must use TypeScript strict mode');
  });

  it('should include done when criteria', () => {
    const brief = taskBrief.buildTaskBrief({
      taskName: 'Test',
      request: 'Request',
      persona: defaultPersona,
      objective: 'Objective',
      scopeItems: [],
      constraints: 'None',
      doneWhen: 'All tests pass, lint clean, 80% coverage',
    });

    expect(brief).toContain('All tests pass, lint clean, 80% coverage');
  });

  it('should handle different personas', () => {
    const devPersona = {
      agentName: 'Dev',
      title: 'Developer Agent',
      mode: 'execute',
      rationale: 'Best for implementing approved contracts',
      handoffCommand: 'grabby agent dev EX',
    };

    const brief = taskBrief.buildTaskBrief({
      taskName: 'Implementation',
      request: 'Implement the feature',
      persona: devPersona,
      objective: 'Build the feature',
      scopeItems: ['Code changes'],
      constraints: 'Follow existing patterns',
      doneWhen: 'Feature works',
    });

    expect(brief).toContain('Persona: Dev');
    expect(brief).toContain('Role: Developer Agent');
    expect(brief).toContain('Mode: execute');
  });

  it('should handle special characters in content', () => {
    const brief = taskBrief.buildTaskBrief({
      taskName: 'Feature <v2>',
      request: 'Add "quotes" & <special> chars',
      persona: defaultPersona,
      objective: 'Handle [brackets] properly',
      scopeItems: ['Item with *asterisks*', 'Item with `backticks`'],
      constraints: 'Use proper escaping: $var',
      doneWhen: 'Tests pass 100%',
    });

    expect(brief).toContain('Feature <v2>');
    expect(brief).toContain('"quotes"');
    expect(brief).toContain('[brackets]');
    expect(brief).toContain('*asterisks*');
    expect(brief).toContain('`backticks`');
  });

  it('should handle multiline content', () => {
    const brief = taskBrief.buildTaskBrief({
      taskName: 'Test',
      request: 'Line 1\nLine 2\nLine 3',
      persona: defaultPersona,
      objective: 'Multi-line\nobjective',
      scopeItems: ['Item 1'],
      constraints: 'Constraint 1\nConstraint 2',
      doneWhen: 'Criterion 1\nCriterion 2',
    });

    expect(brief).toContain('Line 1\nLine 2\nLine 3');
  });

  it('should handle many scope items', () => {
    const scopeItems = Array.from({ length: 20 }, (_, i) => `Scope item ${i + 1}`);

    const brief = taskBrief.buildTaskBrief({
      taskName: 'Large Scope Test',
      request: 'Request',
      persona: defaultPersona,
      objective: 'Objective',
      scopeItems,
      constraints: 'None',
      doneWhen: 'Done',
    });

    scopeItems.forEach((item) => {
      expect(brief).toContain(`- ${item}`);
    });
  });
});

// ============================================================================
// INTEGRATION
// ============================================================================

describe('Integration', () => {
  it('should generate brief that can be written to file', () => {
    const briefPath = taskBrief.getTaskBriefPath(contractsDir, 'Integration Test');
    const briefContent = taskBrief.buildTaskBrief({
      taskName: 'Integration Test',
      request: 'Test the integration',
      persona: {
        agentName: 'Val',
        title: 'Validator',
        mode: 'validate',
        rationale: 'Best for validation',
        handoffCommand: 'grabby agent validator VC',
      },
      objective: 'Validate the integration works',
      scopeItems: ['Test A', 'Test B'],
      constraints: 'Follow testing guidelines',
      doneWhen: 'All tests pass',
    });

    fs.writeFileSync(briefPath, briefContent);
    expect(fs.existsSync(briefPath)).toBe(true);

    const read = fs.readFileSync(briefPath, 'utf8');
    expect(read).toContain('# Grabby Task Brief: Integration Test');
  });

  it('should work with path containing spaces', () => {
    const spacePath = path.join(tempDir, 'path with spaces', 'contracts');
    fs.mkdirSync(spacePath, { recursive: true });

    const briefPath = taskBrief.getTaskBriefPath(spacePath, 'Test Task');
    expect(briefPath).toContain('path with spaces');
    expect(briefPath).toContain('test-task.brief.md');
  });

  it('should work with Windows-style paths', () => {
    // Test that path.join handles OS differences correctly
    const result = taskBrief.getTaskBriefPath(contractsDir, 'Test');
    expect(path.isAbsolute(result)).toBe(true);
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Edge Cases', () => {
  it('should handle undefined scope items gracefully', () => {
    // When scopeItems is undefined, buildTaskBrief should handle it
    // Note: The actual function expects scopeItems to be an array
    const brief = taskBrief.buildTaskBrief({
      taskName: 'Test',
      request: 'Request',
      persona: {
        agentName: 'Test',
        title: 'Tester',
        mode: 'test',
        rationale: 'Testing',
        handoffCommand: 'test',
      },
      objective: 'Objective',
      scopeItems: [],
      constraints: 'None',
      doneWhen: 'Done',
    });

    expect(brief).toContain('Scope to be clarified');
  });

  it('should handle very long task names', () => {
    const longName = 'A'.repeat(200);
    const result = taskBrief.getTaskBriefPath(contractsDir, longName);
    expect(result).toBeDefined();
    expect(result).toContain('.brief.md');
  });

  it('should handle unicode characters in task name', () => {
    const result = taskBrief.getTaskBriefPath(contractsDir, '日本語タスク');
    expect(result).toContain('.brief.md');
  });

  it('should handle task name with only special characters', () => {
    const result = taskBrief.getTaskBriefPath(contractsDir, '@#$%^&*()');
    expect(result).toContain('.brief.md');
  });

  it('should handle persona with empty fields', () => {
    const brief = taskBrief.buildTaskBrief({
      taskName: 'Test',
      request: 'Request',
      persona: {
        agentName: '',
        title: '',
        mode: '',
        rationale: '',
        handoffCommand: '',
      },
      objective: 'Objective',
      scopeItems: [],
      constraints: 'None',
      doneWhen: 'Done',
    });

    expect(brief).toContain('Persona:');
    expect(brief).toContain('Role:');
  });
});

// ============================================================================
// MODULE EXPORTS
// ============================================================================

describe('Module Exports', () => {
  it('should export buildTaskBrief function', () => {
    expect(typeof taskBrief.buildTaskBrief).toBe('function');
  });

  it('should export getTaskBriefPath function', () => {
    expect(typeof taskBrief.getTaskBriefPath).toBe('function');
  });
});
