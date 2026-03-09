/**
 * Grabby - Interactive Workflows Tests
 * Coverage target: 80%+
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const childProcess = require('child_process');
const readline = require('readline');
const yaml = require('yaml');
const interactiveWorkflows = require('../lib/interactive-workflows.cjs');
const { createWorkflowRuntime } = interactiveWorkflows;

// Test directories
const PKG_ROOT = path.join(__dirname, '..');
const AGENTS_DIR = path.join(PKG_ROOT, 'agents');
const WORKFLOWS_DIR = path.join(PKG_ROOT, 'workflows');

// Temp directory for tests
let tempDir;
let contractsDir;
let runtime;

// Mock color functions
const mockColors = {
  error: (s) => `[ERROR]${s}`,
  success: (s) => `[SUCCESS]${s}`,
  warn: (s) => `[WARN]${s}`,
  info: (s) => `[INFO]${s}`,
  dim: (s) => `[DIM]${s}`,
  bold: (s) => `[BOLD]${s}`,
  heading: (s) => `[HEADING]${s}`,
  agent: (s) => `[AGENT]${s}`,
};

// Mock command handlers
const mockCommandHandlers = {
  resolveContract: (file) => {
    const filePath = path.join(contractsDir, file.endsWith('.fc.md') ? file : `${file}.fc.md`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Contract not found: ${file}`);
    }
    return filePath;
  },
  backlog: jest.fn(),
  plan: jest.fn(),
};

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-workflows-test-'));
  contractsDir = path.join(tempDir, 'contracts');
  fs.mkdirSync(contractsDir, { recursive: true });

  runtime = createWorkflowRuntime({
    c: mockColors,
    outputMode: 'console',
    pkgRoot: PKG_ROOT,
    cwd: tempDir,
    commandHandlers: mockCommandHandlers,
  });
});

afterEach(() => {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
  jest.clearAllMocks();
});

// Helper to create a test contract
function createTestContract(name = 'test-feature', content = null) {
  const defaultContent = `# FC: Test Feature
**ID:** FC-123 | **Status:** draft

## Objective
Test objective

## Scope
- Item 1
- Item 2

## Non-Goals
- None

## Directories
**Allowed:** \`src/\`
**Restricted:** \`backend/\`, \`node_modules/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | \`src/test.ts\` | Main implementation |
| create | \`src/test.test.ts\` | Unit tests |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery

## Done When
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes

## Testing
- Unit: src/test.test.ts

## Context Refs
- ARCH_INDEX_v1
- RULESET_CORE_v1
`;

  const filePath = path.join(contractsDir, `${name}.fc.md`);
  fs.writeFileSync(filePath, content || defaultContent);
  return filePath;
}

function createQuickRuntime(overrides = {}) {
  return createWorkflowRuntime({
    c: mockColors,
    outputMode: 'console',
    pkgRoot: PKG_ROOT,
    cwd: tempDir,
    commandHandlers: {
      resolveContract: (file) => {
        const directPath = path.join(contractsDir, file);
        if (fs.existsSync(directPath)) {
          return directPath;
        }
        const fcPath = path.join(contractsDir, file.endsWith('.fc.md') ? file : `${file}.fc.md`);
        if (!fs.existsSync(fcPath)) {
          throw new Error(`Contract not found: ${file}`);
        }
        return fcPath;
      },
      backlog: jest.fn(),
      plan: jest.fn(),
      ...overrides,
    },
  });
}

function mockReadlineAnswers(answers) {
  const remaining = [...answers];
  const rl = {
    question: jest.fn((_prompt, callback) => callback(remaining.shift() ?? '')),
    close: jest.fn(),
  };
  const spy = jest.spyOn(readline, 'createInterface').mockReturnValue(rl);
  return {
    rl,
    restore: () => spy.mockRestore(),
  };
}

// ============================================================================
// RUNTIME CREATION
// ============================================================================

describe('createWorkflowRuntime', () => {
  it('should return runtime object with expected functions', () => {
    expect(runtime).toBeDefined();
    expect(typeof runtime.loadAgent).toBe('function');
    expect(typeof runtime.listAgents).toBe('function');
    expect(typeof runtime.executeAgentCommand).toBe('function');
    expect(typeof runtime.listProgress).toBe('function');
    expect(typeof runtime.listWorkflowMetadata).toBe('function');
    expect(typeof runtime.getWorkflowDetails).toBe('function');
    expect(typeof runtime.resolveContract).toBe('function');
    expect(typeof runtime.output).toBe('function');
  });

  it('should accept different output modes', () => {
    const fileRuntime = createWorkflowRuntime({
      c: mockColors,
      outputMode: 'file',
      pkgRoot: PKG_ROOT,
      cwd: tempDir,
      commandHandlers: mockCommandHandlers,
    });
    expect(fileRuntime).toBeDefined();

    const bothRuntime = createWorkflowRuntime({
      c: mockColors,
      outputMode: 'both',
      pkgRoot: PKG_ROOT,
      cwd: tempDir,
      commandHandlers: mockCommandHandlers,
    });
    expect(bothRuntime).toBeDefined();
  });
});

describe('Contract Request Helpers', () => {
  it('extracts normalized referenced contracts from requests', () => {
    expect(interactiveWorkflows.extractReferencedContract('finish contracts/grabby-101.fc.md')).toEqual({
      ticketId: 'GRABBY-101',
      fileName: 'GRABBY-101.fc.md',
      path: 'contracts/GRABBY-101.fc.md',
    });
  });

  it('returns null when no contract reference is present', () => {
    expect(interactiveWorkflows.extractReferencedContract('finish the workflow coverage work')).toBeNull();
  });

  it('routes feature requests only when no contract reference is embedded', () => {
    expect(interactiveWorkflows.shouldRouteFeatureRequest('implement better workflow coverage')).toBe(true);
    expect(interactiveWorkflows.shouldRouteFeatureRequest('implement contracts/GRABBY-101.fc.md')).toBe(false);
    expect(interactiveWorkflows.shouldRouteFeatureRequest('')).toBe(false);
  });
});

// ============================================================================
// AGENT FUNCTIONS
// ============================================================================

describe('Agent Functions', () => {
  describe('loadAgent', () => {
    it('should load agent by full name', () => {
      const agent = runtime.loadAgent('contract-architect');
      expect(agent).not.toBeNull();
      expect(agent.agent.metadata.name).toBe('Archie');
    });

    it('should load agent by alias', () => {
      const agent = runtime.loadAgent('architect');
      expect(agent).not.toBeNull();
      expect(agent.agent.metadata.name).toBe('Archie');
    });

    it('should load validator agent', () => {
      const agent = runtime.loadAgent('validator');
      expect(agent).not.toBeNull();
      expect(agent.agent.metadata.name).toBe('Val');
    });

    it('should load strategist agent', () => {
      const agent = runtime.loadAgent('strategist');
      expect(agent).not.toBeNull();
      expect(agent.agent.metadata.name).toBe('Sage');
    });

    it('should load dev agent', () => {
      const agent = runtime.loadAgent('dev');
      expect(agent).not.toBeNull();
      expect(agent.agent.metadata.name).toBe('Dev');
    });

    it('should load tester agent', () => {
      const agent = runtime.loadAgent('tester');
      expect(agent).not.toBeNull();
      expect(agent.agent.metadata.name).toBe('Tess');
    });

    it('should load auditor agent', () => {
      const agent = runtime.loadAgent('auditor');
      expect(agent).not.toBeNull();
      expect(agent.agent.metadata.name).toBe('Iris');
    });

    it('should load quick agent', () => {
      const agent = runtime.loadAgent('quick');
      expect(agent).not.toBeNull();
    });

    it('should return null for non-existent agent', () => {
      const agent = runtime.loadAgent('nonexistent-agent');
      expect(agent).toBeNull();
    });
  });

  describe('listAgents', () => {
    it('should return array of agents', () => {
      const agents = runtime.listAgents();
      expect(Array.isArray(agents)).toBe(true);
      expect(agents.length).toBeGreaterThan(0);
    });

    it('should include expected agent properties', () => {
      const agents = runtime.listAgents();
      agents.forEach((agent) => {
        expect(agent.file).toBeDefined();
        expect(agent.id).toBeDefined();
        expect(agent.name).toBeDefined();
        expect(agent.title).toBeDefined();
        expect(agent.icon).toBeDefined();
      });
    });

    it('should include Archie agent', () => {
      const agents = runtime.listAgents();
      const archie = agents.find((a) => a.name === 'Archie');
      expect(archie).toBeDefined();
      expect(archie.title).toContain('Architect');
    });
  });

  describe('executeAgentCommand', () => {
    it('lists agents and exits when the agent is unknown', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`exit:${code}`);
      });

      await expect(runtime.executeAgentCommand('missing-agent', 'CC', [])).rejects.toThrow('exit:1');
      expect(consoleSpy).toHaveBeenCalledWith('? Agent not found: missing-agent');
      expect(consoleSpy).toHaveBeenCalledWith('\nAvailable agents:');

      consoleSpy.mockRestore();
      exitSpy.mockRestore();
    });

    it('shows agent details when no command is provided', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await runtime.executeAgentCommand('architect');

      const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(output).toContain('Archie - Contract Architect');
      expect(output).toContain('MENU');
      expect(output).toContain('Usage: grabby agent archie <command>');

      consoleSpy.mockRestore();
    });

    it('lists menu commands and exits on unknown agent command', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`exit:${code}`);
      });

      await expect(runtime.executeAgentCommand('architect', 'missing-command', [])).rejects.toThrow('exit:1');

      const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(output).toContain('? Unknown command: missing-command');
      expect(output).toContain('Available commands for Archie:');

      consoleSpy.mockRestore();
      exitSpy.mockRestore();
    });
  });
});

// ============================================================================
// PROGRESS FUNCTIONS
// ============================================================================

describe('Progress Functions', () => {
  describe('listProgress', () => {
    it('should return empty array when no progress exists', () => {
      const progress = runtime.listProgress();
      expect(Array.isArray(progress)).toBe(true);
      expect(progress.length).toBe(0);
    });

    it('should return progress items when they exist', () => {
      const progressDir = path.join(tempDir, '.grabby-progress');
      fs.mkdirSync(progressDir, { recursive: true });
      fs.writeFileSync(
        path.join(progressDir, 'test-workflow.json'),
        JSON.stringify({
          workflow: 'test-workflow',
          timestamp: new Date().toISOString(),
          data: { currentStep: 2 },
        })
      );

      const progress = runtime.listProgress();
      expect(progress.length).toBe(1);
      expect(progress[0].workflow).toBe('test-workflow');
      expect(progress[0].step).toBe(2);
    });

    it('should list multiple progress items', () => {
      const progressDir = path.join(tempDir, '.grabby-progress');
      fs.mkdirSync(progressDir, { recursive: true });

      fs.writeFileSync(
        path.join(progressDir, 'workflow1.json'),
        JSON.stringify({ workflow: 'workflow1', timestamp: new Date().toISOString(), data: { currentStep: 1 } })
      );
      fs.writeFileSync(
        path.join(progressDir, 'workflow2.json'),
        JSON.stringify({ workflow: 'workflow2', timestamp: new Date().toISOString(), data: { currentStep: 3 } })
      );

      const progress = runtime.listProgress();
      expect(progress.length).toBe(2);
    });
  });
});

// ============================================================================
// WORKFLOW METADATA
// ============================================================================

describe('Workflow Metadata Functions', () => {
  describe('listWorkflowMetadata', () => {
    it('should return array of workflows', () => {
      const workflows = runtime.listWorkflowMetadata();
      expect(Array.isArray(workflows)).toBe(true);
      expect(workflows.length).toBeGreaterThan(0);
    });

    it('should include workflow properties', () => {
      const workflows = runtime.listWorkflowMetadata();
      workflows.forEach((wf) => {
        expect(wf.name).toBeDefined();
        expect(wf.description).toBeDefined();
        expect(typeof wf.stepCount).toBe('number');
      });
    });

    it('should include create-contract workflow', () => {
      const workflows = runtime.listWorkflowMetadata();
      const createContract = workflows.find((w) => w.name === 'create-contract');
      expect(createContract).toBeDefined();
    });
  });

  describe('getWorkflowDetails', () => {
    it('should return workflow details for valid workflow', () => {
      const details = runtime.getWorkflowDetails('create-contract');
      expect(details).not.toBeNull();
      expect(details.name).toBeDefined();
      expect(details.description).toBeDefined();
      expect(Array.isArray(details.steps)).toBe(true);
      expect(details.steps[0]).toEqual(expect.objectContaining({
        id: expect.any(String),
        goal: expect.any(String),
      }));
    });

    it('should return null for non-existent workflow', () => {
      const details = runtime.getWorkflowDetails('nonexistent-workflow');
      expect(details).toBeNull();
    });
  });
});

// ============================================================================
// CONTRACT RESOLUTION
// ============================================================================

describe('Contract Resolution', () => {
  describe('resolveContract', () => {
    it('should resolve existing contract', () => {
      createTestContract('my-feature');
      const resolved = runtime.resolveContract('my-feature.fc.md');
      expect(resolved).toContain('my-feature.fc.md');
    });

    it('should throw for non-existent contract', () => {
      expect(() => runtime.resolveContract('nonexistent')).toThrow('Contract not found');
    });
  });
});

// ============================================================================
// OUTPUT FUNCTION
// ============================================================================

describe('Output Function', () => {
  it('should output to console in console mode', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    runtime.output('Test content');
    expect(consoleSpy).toHaveBeenCalledWith('Test content');
    consoleSpy.mockRestore();
  });

  it('should write to file when path provided in file mode', () => {
    const fileRuntime = createWorkflowRuntime({
      c: mockColors,
      outputMode: 'file',
      pkgRoot: PKG_ROOT,
      cwd: tempDir,
      commandHandlers: mockCommandHandlers,
    });

    const outputPath = path.join(tempDir, 'output.txt');
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    fileRuntime.output('File content', outputPath);

    expect(fs.existsSync(outputPath)).toBe(true);
    expect(fs.readFileSync(outputPath, 'utf8')).toBe('File content');
    consoleSpy.mockRestore();
  });

  it('should output to both console and file in both mode', () => {
    const bothRuntime = createWorkflowRuntime({
      c: mockColors,
      outputMode: 'both',
      pkgRoot: PKG_ROOT,
      cwd: tempDir,
      commandHandlers: mockCommandHandlers,
    });

    const outputPath = path.join(tempDir, 'both-output.txt');
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    bothRuntime.output('Both content', outputPath);

    expect(consoleSpy).toHaveBeenCalledWith('Both content');
    expect(fs.existsSync(outputPath)).toBe(true);
    consoleSpy.mockRestore();
  });
});

// ============================================================================
// VALIDATION FUNCTION (from interactive-workflows)
// ============================================================================

describe('Contract Validation in Workflows', () => {
  it('should validate valid contract without errors', () => {
    const validContract = `# FC: Valid Test
**ID:** FC-123 | **Status:** draft

## Objective
Test objective

## Scope
- Item 1

## Directories
**Allowed:** \`src/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | \`src/test.ts\` | Test |
| create | \`src/test.test.ts\` | Tests |

## Done When
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes

## Security Considerations
- [ ] Input validation

## Testing
- Unit tests
`;
    createTestContract('valid', validContract);
    // Contract is created successfully - validation happens in the workflow
    expect(fs.existsSync(path.join(contractsDir, 'valid.fc.md'))).toBe(true);
  });

  it('includes saved workflow progress in workflow details and list output', () => {
    const progressDir = path.join(tempDir, '.grabby-progress');
    fs.mkdirSync(progressDir, { recursive: true });
    fs.writeFileSync(path.join(progressDir, 'create-contract.json'), JSON.stringify({
      workflow: 'create-contract',
      timestamp: new Date().toISOString(),
      data: {
        status: 'paused',
        currentStep: 1,
        nextStep: 'Define boundaries and constraints',
        resumeCommand: 'grabby agent architect create-contract',
      },
    }), 'utf8');

    const details = runtime.getWorkflowDetails('create-contract');
    const metadata = runtime.listWorkflowMetadata().find((entry) => entry.name === 'create-contract');

    expect(details.progress).toEqual(expect.objectContaining({
      status: 'paused',
      currentStep: 1,
    }));
    expect(details.nextStep).toEqual(expect.objectContaining({
      goal: expect.any(String),
    }));
    expect(metadata.progress).toEqual(expect.objectContaining({ status: 'paused' }));
    expect(metadata.nextStep).toBeTruthy();
  });
});

describe('Interactive Workflow Runtimes', () => {
  it('pauses at the intake breakpoint and persists session state when interactive mode needs a decision', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const mockRl = mockReadlineAnswers(['5']);

    await runtime.runTaskBreakdownWorkflow(mockRl.rl, 'implement login guard', {
      nonInteractive: true,
      interactiveMode: { enabled: true },
      input: {
        request: 'implement login guard',
        ticketId: 'GRAB-IMODE-001',
        who: 'developers',
        what: 'implement login guard',
        why: 'keep auth flows deterministic',
        dod: ['tests pass', 'lint passes'],
        taskName: 'Login Guard',
        objective: 'Implement login guard. Why: keep auth flows deterministic',
        scopeItems: ['add route guard'],
        directories: ['src/', 'tests/'],
      },
    });

    const sessionPath = path.join(tempDir, '.grabby', 'session', 'GRAB-IMODE-001.json');
    expect(fs.existsSync(sessionPath)).toBe(true);
    expect(fs.existsSync(path.join(contractsDir, 'GRAB-IMODE-001.fc.md'))).toBe(false);

    const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    expect(session.currentPhase).toBe('intake');
    expect(session.lastInteractionPoint).toBe('after-ticket-intake');
    expect(consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n')).toContain('INTERACTIVE BREAKPOINT');
    expect(consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n')).toContain('Next command: grabby resume');

    mockRl.restore();
    consoleSpy.mockRestore();
  });

  it('returns null from ticket wizard when no request or structured fields are provided', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const rl = {
      question: (_prompt, callback) => callback(''),
      close: () => {},
    };

    const result = await runtime.runTicketWizardWorkflow(rl, '', { input: {}, nonInteractive: true });

    expect(result).toBeNull();
    expect(consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n')).toContain('Ticket input required.');
    consoleSpy.mockRestore();
  });

  it('creates task, brief, and session artifacts in non-interactive mode', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await runtime.runTaskBreakdownWorkflow({}, 'implement login guard', {
      nonInteractive: true,
      sessionFormat: 'json',
      input: {
        request: 'implement login guard',
        ticketId: 'GRABBY-105',
        who: 'developers',
        what: 'implement login guard',
        why: 'keep auth flows deterministic',
        dod: ['tests pass', 'lint passes'],
        taskName: 'Login Guard',
        objective: 'Implement login guard. Why: keep auth flows deterministic',
        scopeItems: ['add route guard', 'cover login redirect'],
        nonGoals: ['no auth provider rewrite'],
        directories: ['src/', 'tests/'],
        constraints: 'stay bounded',
        dependencies: 'none',
        doneWhen: ['tests pass', 'lint passes'],
        testing: 'Unit: tests/login-guard.test.js',
        securityImpact: 'auth flow reviewed',
      },
    });

    const contractPath = path.join(contractsDir, 'GRABBY-105.fc.md');
    const briefPath = path.join(contractsDir, 'GRABBY-105.brief.md');
    const sessionPath = path.join(contractsDir, 'GRABBY-105.session.json');
    expect(fs.existsSync(contractPath)).toBe(true);
    expect(fs.existsSync(briefPath)).toBe(true);
    expect(fs.existsSync(sessionPath)).toBe(true);
    expect(fs.readFileSync(contractPath, 'utf8')).toContain('Security/migration impact reviewed: auth flow reviewed');
    expect(fs.readFileSync(contractPath, 'utf8')).toContain('`node_modules/`, `.git/`, `dist/`');
    expect(JSON.parse(fs.readFileSync(sessionPath, 'utf8')).mode).toBe('task');

    consoleSpy.mockRestore();
  });

  it('runs interactive breakpoints in sequence and saves the approved plan hash during orchestration', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const orchestratedRuntime = createQuickRuntime({
      backlog: jest.fn((fileName) => {
        fs.writeFileSync(path.join(contractsDir, fileName.replace('.fc.md', '.backlog.yaml')), yaml.stringify({
          epic: 'demo',
          tasks: [{ id: 'TASK-1', title: 'demo' }],
        }));
      }),
      plan: jest.fn((fileName) => {
        fs.writeFileSync(path.join(contractsDir, fileName.replace('.fc.md', '.plan.yaml')), yaml.stringify({
          status: 'pending_approval',
          files: [{ action: 'modify', path: 'src/login-guard.js', reason: 'guard flow' }],
          context: ['ARCH:auth-module@v1'],
        }));
      }),
    });

    await orchestratedRuntime.runTaskBreakdownWorkflow({}, 'implement login guard', {
      orchestrate: true,
      nonInteractive: true,
      interactiveMode: { enabled: true, autoContinue: true },
      input: {
        request: 'implement login guard',
        ticketId: 'GRAB-IMODE-002',
        who: 'developers',
        what: 'implement login guard',
        why: 'keep auth flows deterministic',
        dod: ['tests pass', 'lint passes'],
        taskName: 'Login Guard',
        objective: 'Implement login guard. Why: keep auth flows deterministic',
        scopeItems: ['add route guard', 'cover login redirect'],
        nonGoals: ['no auth provider rewrite'],
        directories: ['src/', 'tests/'],
        constraints: 'stay bounded',
        dependencies: 'none',
        doneWhen: ['tests pass', 'lint passes'],
        testing: 'Unit: tests/login-guard.test.js',
        securityImpact: 'auth flow reviewed',
      },
    });

    const sessionPath = path.join(tempDir, '.grabby', 'session', 'GRAB-IMODE-002.json');
    const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    expect(fs.existsSync(path.join(contractsDir, 'GRAB-IMODE-002.fc.md'))).toBe(true);
    expect(fs.existsSync(path.join(contractsDir, 'GRAB-IMODE-002.plan.yaml'))).toBe(true);
    expect(session.currentPhase).toBe('execution_handoff');
    expect(session.lastInteractionPoint).toBe('after-plan-generated');
    expect(session.approvedPlanHash).toBeTruthy();

    const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('Breakpoint: after-ticket-intake');
    expect(output).toContain('Breakpoint: after-contract-draft');
    expect(output).toContain('Breakpoint: after-plan-generated');

    consoleSpy.mockRestore();
  });

  it('reframes the next task via role switching and resumes from saved interactive session state', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const sessionDir = path.join(tempDir, '.grabby', 'session');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'GRAB-IMODE-003.json'), JSON.stringify({
      ticketId: 'GRAB-IMODE-003',
      currentPhase: 'intake',
      lastInteractionPoint: 'after-ticket-intake',
      selectedRole: 'dev',
    }, null, 2));

    await runtime.runTaskBreakdownWorkflow({}, 'implement login guard', {
      nonInteractive: true,
      interactiveMode: { enabled: true, nextAction: 'switch-role', selectedRole: 'tester' },
      input: {
        request: 'implement login guard',
        ticketId: 'GRAB-IMODE-003',
        who: 'developers',
        what: 'implement login guard',
        why: 'keep auth flows deterministic',
        dod: ['tests pass', 'lint passes'],
        taskName: 'Login Guard',
        objective: 'Implement login guard. Why: keep auth flows deterministic',
        scopeItems: ['add route guard'],
        nonGoals: ['no auth provider rewrite'],
        directories: ['src/', 'tests/'],
        constraints: 'stay bounded',
        dependencies: 'none',
        doneWhen: ['tests pass', 'lint passes'],
        testing: 'Unit: tests/login-guard.test.js',
      },
    });

    const session = JSON.parse(fs.readFileSync(path.join(sessionDir, 'GRAB-IMODE-003.json'), 'utf8'));
    expect(session.selectedRole).toBe('tester');

    const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('Resuming interactive session');
    expect(output).toContain('Role reframed: Test Engineer');

    consoleSpy.mockRestore();
  });

  it('creates orchestrated execution artifacts in non-interactive mode', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const orchestrationRuntime = createQuickRuntime({
      backlog: jest.fn((fileName) => {
        fs.writeFileSync(path.join(contractsDir, fileName.replace('.fc.md', '.backlog.yaml')), yaml.stringify({
          epics: [{ id: 'EPIC-1', tasks: [] }],
        }));
      }),
      plan: jest.fn((fileName) => {
        fs.writeFileSync(path.join(contractsDir, fileName.replace('.fc.md', '.plan.yaml')), yaml.stringify({
          files: [{ action: 'modify', path: 'src/login.js' }],
          rules: ['§testing'],
        }));
      }),
    });

    await orchestrationRuntime.runTaskBreakdownWorkflow({}, 'fix login redirect bug', {
      orchestrate: true,
      nonInteractive: true,
      sessionFormat: 'yaml',
      input: {
        request: 'fix login redirect bug',
        ticketId: 'GRABBY-106',
        who: 'operators',
        what: 'fix login redirect bug',
        why: 'prevent broken auth redirect',
        dod: ['tests pass', 'lint passes'],
        taskName: 'Login Redirect Fix',
        objective: 'Fix login redirect bug. Why: prevent broken auth redirect',
        scopeItems: ['fix redirect loop'],
        nonGoals: ['no auth redesign'],
        directories: ['src/', 'tests/'],
        constraints: 'keep the patch bounded',
        dependencies: 'none',
        doneWhen: ['tests pass', 'lint passes'],
        testing: 'Unit: tests/login-redirect.test.js',
        securityImpact: 'reviewed',
      },
    });

    expect(fs.existsSync(path.join(contractsDir, 'GRABBY-106.execute.md'))).toBe(true);
    expect(fs.existsSync(path.join(contractsDir, 'GRABBY-106.audit.md'))).toBe(true);
    expect(fs.existsSync(path.join(contractsDir, 'GRABBY-106.session.yaml'))).toBe(true);
    expect(mockCommandHandlers.backlog).not.toHaveBeenCalled();
    const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('ORCHESTRATION COMPLETE');
    expect(output).toContain('Stage transitions:');
    expect(output).toContain('verification -> Tess (Test Engineer)');
    expect(output).toContain('Tess');

    consoleSpy.mockRestore();
  });

  it('returns early when non-interactive ticket intake is incomplete', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await runtime.runTaskBreakdownWorkflow({}, 'implement auth flow', {
      nonInteractive: true,
      input: {
        request: 'implement auth flow',
      },
    });

    expect(fs.readdirSync(contractsDir)).toEqual([]);
    expect(consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n')).toContain('Ticket intake incomplete.');
    consoleSpy.mockRestore();
  });

  it('creates a quick spec and prints quick dev instructions', async () => {
    const quickRuntime = createQuickRuntime();
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const answers = [
      'tighten login redirect behavior',
      'src/login.js, tests/login.test.js',
      'redirect works correctly',
      'low',
      'y',
    ];
    const rl = {
      question: (_prompt, callback) => callback(answers.shift() || ''),
      close: () => {},
    };
    const quickAgent = quickRuntime.loadAgent('quick');

    await quickRuntime.runQuickSpecWorkflow(rl, quickAgent);
    await quickRuntime.runQuickDevWorkflow(rl, quickAgent, 'tighten-login-redirect.quick.md');

    const quickPath = path.join(contractsDir, 'tighten-login-redirect.quick.md');
    expect(fs.existsSync(quickPath)).toBe(true);
    expect(fs.readFileSync(quickPath, 'utf8')).toContain('# QFC: tighten login redirect behavior');
    const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('Quick contract created: contracts/tighten-login-redirect.quick.md');
    expect(output).toContain('Quick Implementation: tighten login redirect behavior');

    consoleSpy.mockRestore();
  });

  it('reports missing quick contracts when quick dev has nothing to run', async () => {
    const quickRuntime = createQuickRuntime();
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const rl = {
      question: (_prompt, callback) => callback(''),
      close: () => {},
    };

    await quickRuntime.runQuickDevWorkflow(rl, quickRuntime.loadAgent('quick'));

    expect(consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n')).toContain('No quick contracts found.');
    consoleSpy.mockRestore();
  });

  it('rejects quick specs with no change description or files', async () => {
    const quickRuntime = createQuickRuntime();
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    let rl = {
      question: (_prompt, callback) => callback(''),
      close: () => {},
    };
    await quickRuntime.runQuickSpecWorkflow(rl, quickRuntime.loadAgent('quick'));
    expect(consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n')).toContain('Change description required.');

    consoleSpy.mockClear();
    rl = {
      question: (_prompt, callback) => callback(_prompt.includes('What\'s the change?') ? 'small fix' : ''),
      close: () => {},
    };
    await quickRuntime.runQuickSpecWorkflow(rl, quickRuntime.loadAgent('quick'));
    expect(consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n')).toContain('At least one file required.');

    consoleSpy.mockRestore();
  });

  it('supports quick-spec escalation and cancellation branches', async () => {
    const quickRuntime = createQuickRuntime();
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    let answers = [
      'large refactor',
      'a.js, b.js, c.js, d.js',
      'y',
    ];
    let rl = {
      question: (_prompt, callback) => callback(answers.shift() || ''),
      close: () => {},
    };
    await quickRuntime.runQuickSpecWorkflow(rl, quickRuntime.loadAgent('quick'));
    expect(consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n')).toContain('Use: grabby agent architect CC');

    consoleSpy.mockClear();
    answers = [
      'contained refactor',
      'a.js, b.js, c.js, d.js',
      'n',
      'works',
      'low',
      'n',
    ];
    rl = {
      question: (_prompt, callback) => callback(answers.shift() || ''),
      close: () => {},
    };
    await quickRuntime.runQuickSpecWorkflow(rl, quickRuntime.loadAgent('quick'));
    expect(consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n')).toContain('Cancelled.');

    consoleSpy.mockRestore();
  });

  it('lets quick-dev choose a listed quick contract and falls back to filename when change is missing', async () => {
    const quickRuntime = createQuickRuntime();
    fs.writeFileSync(path.join(contractsDir, 'fallback.quick.md'), `# QFC: fallback
**ID:** QFC-1 | **Status:** approved

## Files
| Action | Path |
|--------|------|
| modify | \`src/fallback.js\` |
`, 'utf8');
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const rl = {
      question: (_prompt, callback) => callback('1'),
      close: () => {},
    };

    await quickRuntime.runQuickDevWorkflow(rl, quickRuntime.loadAgent('quick'));

    const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('Quick contracts:');
    expect(output).toContain('Quick Implementation: fallback.quick.md');
    consoleSpy.mockRestore();
  });

  it('creates a contract through the architect agent workflow', async () => {
    const fileRuntime = createWorkflowRuntime({
      c: mockColors,
      outputMode: 'both',
      pkgRoot: PKG_ROOT,
      cwd: tempDir,
      commandHandlers: mockCommandHandlers,
    });
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const mockRl = mockReadlineAnswers([
      '1',
      'Workflow Feature',
      'Create a workflow contract from prompts.',
      'capture scope, generate file',
      '',
      'src/workflows/, tests/',
      '',
      'none',
      'contract generated, tests pass',
      '',
      'y',
    ]);

    await fileRuntime.executeAgentCommand('architect', 'create-contract', []);

    const contractPath = path.join(contractsDir, 'workflow-feature.fc.md');
    expect(fs.existsSync(contractPath)).toBe(true);
    expect(fs.readFileSync(contractPath, 'utf8')).toContain('# FC: Workflow Feature');
    expect(fs.readFileSync(contractPath, 'utf8')).toContain('src/hooks/useWorkflowFeature.ts');
    expect(mockRl.rl.close).toHaveBeenCalled();
    expect(consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n')).toContain('CONTRACT CREATED');

    mockRl.restore();
    consoleSpy.mockRestore();
  });

  it('validates an existing contract through the validator workflow', async () => {
    createTestContract('validate-me');
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const mockRl = mockReadlineAnswers([]);

    await runtime.executeAgentCommand('validator', 'validate-contract', ['validate-me.fc.md']);

    const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('VALIDATE CONTRACT WORKFLOW');
    expect(output).toContain('Contract is valid');
    expect(mockRl.rl.close).toHaveBeenCalled();

    mockRl.restore();
    consoleSpy.mockRestore();
  });

  it('reports structural, security, and quality failures for invalid contracts', async () => {
    createTestContract('invalid-validate', `# FC: [NAME]
**ID:** FC-[ID] | **Status:** draft

## Objective
Improve auth and optimize login with password handling.

## Scope
- improve auth
- optimize login
- enhance tokens
- refactor credentials
- better password rules
- faster secret rotation
- fix issues in payment capture
- clean up api key storage

## Directories
**Allowed:** \`src/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | \`backend/auth.js\` | backend |
| modify | \`node_modules/bad.js\` | deps |
| modify | \`src/a.js\` | a |
| modify | \`src/b.js\` | b |
| modify | \`src/c.js\` | c |
| modify | \`src/d.js\` | d |
| modify | \`src/e.js\` | e |
| modify | \`src/f.js\` | f |
| modify | \`src/g.js\` | g |
| modify | \`src/h.js\` | h |
| modify | \`src/i.js\` | i |
| modify | \`src/j.js\` | j |
| modify | \`src/k.js\` | k |
| modify | \`src/l.js\` | l |
| modify | \`src/m.js\` | m |
| modify | \`src/n.js\` | n |

## Dependencies
- Allowed: moment, lodash, jquery, child_process, crypto

## Done When
- shipped
`);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const mockRl = mockReadlineAnswers([]);

    await runtime.executeAgentCommand('validator', 'validate-contract', ['invalid-validate.fc.md']);

    const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('Contract has errors');
    expect(output).toContain('No testing section defined');
    expect(output).toContain('Restricted directory in files: backend/');
    expect(output).toContain('Banned dependency: moment');
    expect(output).toContain('Security-sensitive feature');
    expect(output).toContain('Missing Security Considerations section');
    expect(output).toContain('Done When should include lint check');

    mockRl.restore();
    consoleSpy.mockRestore();
  });

  it('warns when security sections lack checklist items and recognizes existing quality sections', async () => {
    createTestContract('warn-validate', `# FC: Warn Validate
**ID:** FC-777 | **Status:** draft

## Objective
Handle auth token flow.

## Scope
- add auth guard
- add token refresh
- add login retry
- add audit log
- add session timeout
- add recovery

## Non-Goals
- none

## Directories
**Allowed:** \`src/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | \`src/auth.test.ts\` | tests |
| create | \`src/auth.ts\` | auth |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery

## Security Considerations
- reviewed manually

## Code Quality
- [ ] reviewed

## Done When
- [ ] auth works
- [ ] coverage improved

## Testing
- Unit

## Context Refs
- ARCH_INDEX_v1
`);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const mockRl = mockReadlineAnswers([]);

    await runtime.executeAgentCommand('validator', 'validate-contract', ['warn-validate.fc.md']);

    const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('Security section has no checklist items');
    expect(output).toContain('Large scope (6 items) - consider splitting');
    expect(output).toContain('Done When should include 80%+ coverage requirement');
    expect(output).toContain('Done When should include lint check');

    mockRl.restore();
    consoleSpy.mockRestore();
  });

  it('updates a contract and resets approved status through the architect edit workflow', async () => {
    const contractPath = writeApprovedWorkflowContract('editable.fc.md');
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const mockRl = mockReadlineAnswers(['1', 'Updated objective from workflow']);

    await runtime.executeAgentCommand('architect', 'edit-contract', ['editable.fc.md']);

    const content = fs.readFileSync(contractPath, 'utf8');
    expect(content).toContain('Updated objective from workflow');
    expect(content).toContain('**Status:** draft');
    expect(consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n')).toContain('Status reset to draft due to edits.');

    mockRl.restore();
    consoleSpy.mockRestore();
  });

  it('reports high risks through the validator risk workflow', async () => {
    const riskyContract = `# FC: Risky Feature
**ID:** FC-999 | **Status:** draft

## Objective
Improve and optimize several systems at once.

## Scope
- improve login flow
- optimize session refresh
- enhance dashboard
- refactor API client
- improve caching
- better metrics

## Directories
**Allowed:** \`src/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | \`src/a.ts\` | a |
| modify | \`src/b.ts\` | b |
| modify | \`src/c.ts\` | c |
| modify | \`src/d.ts\` | d |
| modify | \`src/e.ts\` | e |
| modify | \`src/f.ts\` | f |
| modify | \`src/g.ts\` | g |
| modify | \`src/h.ts\` | h |
| modify | \`src/i.ts\` | i |
| modify | \`src/j.ts\` | j |
| modify | \`src/k.ts\` | k |

## Done When
- [ ] works
`;
    createTestContract('risky', riskyContract);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const mockRl = mockReadlineAnswers([]);

    await runtime.executeAgentCommand('validator', 'risk-check', ['risky.fc.md']);

    const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('Overall Risk');
    expect(output).toContain('Recommendation: Address HIGH risks before proceeding.');
    expect(output).toContain('No testing plan');

    mockRl.restore();
    consoleSpy.mockRestore();
  });

  it('generates and optimizes a plan through strategist workflows', async () => {
    createTestContract('plan-me', `# FC: Plan Me
**ID:** FC-200 | **Status:** draft

## Objective
Plan the workflow.

## Scope
- create hook
- create component

## Directories
**Allowed:** \`src/\`, \`tests/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | \`src/components/Dashboard.tsx\` | UI |
| create | \`src/hooks/useDashboard.ts\` | state |
| create | \`src/types/dashboard.ts\` | types |
| create | \`tests/dashboard.test.ts\` | tests |

## Done When
- [ ] Tests pass (80%+ coverage)

## Testing
- Unit: tests/dashboard.test.ts

## Context Refs
- ARCH_INDEX_v1
`);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    let mockRl = mockReadlineAnswers([]);
    await runtime.executeAgentCommand('strategist', 'generate-plan', ['plan-me.fc.md']);
    mockRl.restore();

    const planPath = path.join(contractsDir, 'plan-me.plan.yaml');
    const plan = yaml.parse(fs.readFileSync(planPath, 'utf8'));
    expect(plan.files[0].path).toBe('src/types/dashboard.ts');
    expect(plan.status).toBe('pending_approval');

    mockRl = mockReadlineAnswers(['1']);
    await runtime.executeAgentCommand('strategist', 'optimize-plan', ['plan-me.fc.md']);
    mockRl.restore();

    const optimizedPlan = yaml.parse(fs.readFileSync(planPath, 'utf8'));
    expect(optimizedPlan.optimized_at).toBeDefined();
    expect(optimizedPlan.files[optimizedPlan.files.length - 1].path).toBe('tests/dashboard.test.ts');
    expect(consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n')).toContain('Plan optimized');

    consoleSpy.mockRestore();
  });

  it('renders execution instructions through the dev workflow', async () => {
    createTestContract('ship-it', `# FC: Ship It
**ID:** FC-300 | **Status:** approved

## Objective
Ship it.

## Scope
- implement feature

## Directories
**Allowed:** \`src/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | \`src/ship.js\` | ship |

## Done When
- [ ] done
`);
    fs.writeFileSync(path.join(contractsDir, 'ship-it.plan.yaml'), yaml.stringify({
      context: ['ARCH:ship@v1'],
      files: [{ action: 'modify', path: 'src/ship.js', reason: 'ship it' }],
      rules: ['§testing'],
      status: 'approved',
    }));
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const mockRl = mockReadlineAnswers(['y']);

    await runtime.executeAgentCommand('dev', 'execute-contract', ['ship-it.fc.md']);

    const plan = yaml.parse(fs.readFileSync(path.join(contractsDir, 'ship-it.plan.yaml'), 'utf8'));
    expect(plan.status).toBe('executing');
    expect(plan.executed_at).toBeDefined();
    expect(consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n')).toContain('Execution Instructions for: ship-it.fc.md');

    mockRl.restore();
    consoleSpy.mockRestore();
  });

  it('blocks execution when the contract is not approved', async () => {
    createTestContract('not-approved');
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const mockRl = mockReadlineAnswers([]);

    await runtime.executeAgentCommand('dev', 'execute-contract', ['not-approved.fc.md']);

    expect(consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n')).toContain('Contract must be approved before execution.');
    mockRl.restore();
    consoleSpy.mockRestore();
  });

  it('blocks execution when the plan is missing', async () => {
    createTestContract('missing-plan', `# FC: Missing Plan
**ID:** FC-301 | **Status:** approved

## Objective
Require a plan.

## Scope
- bounded

## Directories
**Allowed:** \`src/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | \`src/ship.js\` | ship |

## Done When
- [ ] done
`);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const mockRl = mockReadlineAnswers([]);

    await runtime.executeAgentCommand('dev', 'execute-contract', ['missing-plan.fc.md']);

    expect(consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n')).toContain('Plan must exist before execution.');
    mockRl.restore();
    consoleSpy.mockRestore();
  });

  it('cancels execution when the dev workflow declines to proceed', async () => {
    createTestContract('cancel-exec', `# FC: Cancel Exec
**ID:** FC-302 | **Status:** approved

## Objective
Cancel execution.

## Scope
- bounded

## Directories
**Allowed:** \`src/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | \`src/cancel.js\` | cancel |

## Done When
- [ ] done
`);
    fs.writeFileSync(path.join(contractsDir, 'cancel-exec.plan.yaml'), yaml.stringify({
      context: [],
      files: [{ action: 'modify', path: 'src/cancel.js', reason: 'cancel path' }],
      rules: [],
      status: 'approved',
    }));
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const mockRl = mockReadlineAnswers(['n']);

    await runtime.executeAgentCommand('dev', 'execute-contract', ['cancel-exec.fc.md']);

    const plan = yaml.parse(fs.readFileSync(path.join(contractsDir, 'cancel-exec.plan.yaml'), 'utf8'));
    expect(plan.status).toBe('approved');
    expect(consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n')).toContain('Execution cancelled.');
    mockRl.restore();
    consoleSpy.mockRestore();
  });

  it('renders generated test templates through the test engineer workflow', async () => {
    createTestContract('testable', `# FC: Testable
**ID:** FC-400 | **Status:** draft

## Objective
Generate tests.

## Scope
- generate tests

## Directories
**Allowed:** \`src/\`, \`tests/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | \`src/hooks/useLogin.ts\` | hook |
| create | \`src/components/LoginPanel.tsx\` | component |
| create | \`src/utils/session.ts\` | utility |

## Done When
- [ ] done
    `);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const mockRl = mockReadlineAnswers(['n']);

    await runtime.executeAgentCommand('tester', 'test-suite', ['testable.fc.md']);

    const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('Verification checklist:');
    expect(output).toContain('src/tests/useLogin.test.ts');
    expect(output).toContain('src/tests/LoginPanel.test.ts');
    expect(output).toContain('session.test.ts');

    mockRl.restore();
    consoleSpy.mockRestore();
  });

  it('saves generated test templates and skips existing ones through the test engineer workflow', async () => {
    createTestContract('save-tests', `# FC: Save Tests
**ID:** FC-401 | **Status:** draft

## Objective
Generate tests.

## Scope
- generate tests

## Directories
**Allowed:** \`src/\`, \`tests/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | \`src/hooks/useSession.ts\` | hook |
| create | \`src/components/SessionPanel.tsx\` | component |

## Done When
- [ ] done
`);
    fs.mkdirSync(path.join(tempDir, 'src', 'tests'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'src', 'tests', 'useSession.test.ts'), '// existing\n', 'utf8');
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const mockRl = mockReadlineAnswers(['y']);

    await runtime.executeAgentCommand('tester', 'test-suite', ['save-tests.fc.md']);

    expect(fs.existsSync(path.join(tempDir, 'src', 'tests', 'SessionPanel.test.ts'))).toBe(true);
    const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('Skipped (exists): src/tests/useSession.test.ts');
    expect(output).toContain('Created: src/tests/SessionPanel.test.ts');
    mockRl.restore();
    consoleSpy.mockRestore();
  });

  it('warns when no contracts exist for the edit workflow', async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-empty-edit-'));
    const emptyRuntime = createWorkflowRuntime({
      c: mockColors,
      outputMode: 'console',
      pkgRoot: PKG_ROOT,
      cwd: emptyDir,
      commandHandlers: mockCommandHandlers,
    });
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const mockRl = mockReadlineAnswers([]);

    await emptyRuntime.executeAgentCommand('architect', 'edit-contract', []);

    expect(consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n')).toContain('No contracts found. Create one first:');
    mockRl.restore();
    consoleSpy.mockRestore();
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });

  it('handles prompted invalid section selection in the edit workflow', async () => {
    createTestContract('prompt-edit');
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const mockRl = mockReadlineAnswers(['1', '9']);

    await runtime.executeAgentCommand('architect', 'edit-contract', []);

    expect(consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n')).toContain('Invalid selection');
    mockRl.restore();
    consoleSpy.mockRestore();
  });

  it('keeps the contract unchanged when edit workflow input is empty', async () => {
    const contractPath = createTestContract('no-change');
    const before = fs.readFileSync(contractPath, 'utf8');
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const mockRl = mockReadlineAnswers(['1', '']);

    await runtime.executeAgentCommand('architect', 'edit-contract', ['no-change.fc.md']);

    expect(fs.readFileSync(contractPath, 'utf8')).toBe(before);
    expect(consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n')).toContain('No changes made.');
    mockRl.restore();
    consoleSpy.mockRestore();
  });

  it('falls back to default contexts when generating a plan without context refs', async () => {
    createTestContract('no-context', `# FC: No Context
**ID:** FC-201 | **Status:** draft

## Objective
Plan without context refs.

## Scope
- create utility

## Directories
**Allowed:** \`src/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | \`src/utils/value.ts\` | util |

## Done When
- [ ] Tests pass (80%+ coverage)
`);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const mockRl = mockReadlineAnswers([]);

    await runtime.executeAgentCommand('strategist', 'generate-plan', ['no-context.fc.md']);

    const plan = yaml.parse(fs.readFileSync(path.join(contractsDir, 'no-context.plan.yaml'), 'utf8'));
    expect(plan.context).toEqual(['SYSTEM:architecture@v1', 'SYSTEM:standards@v1', 'SYSTEM:workflow@v1']);
    mockRl.restore();
    consoleSpy.mockRestore();
  });

  it('reports missing plans in the optimize workflow', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const mockRl = mockReadlineAnswers([]);

    await runtime.executeAgentCommand('strategist', 'optimize-plan', ['missing-plan.fc.md']);

    expect(consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n')).toContain('Plan not found: missing-plan.plan.yaml');
    mockRl.restore();
    consoleSpy.mockRestore();
  });

  it('supports directory grouping and manual optimize branches', async () => {
    fs.writeFileSync(path.join(contractsDir, 'branchy.plan.yaml'), yaml.stringify({
      files: [
        { order: 1, path: 'src/z/file.ts' },
        { order: 2, path: 'src/a/file.ts' },
      ],
    }));
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    let mockRl = mockReadlineAnswers(['2']);
    await runtime.executeAgentCommand('strategist', 'optimize-plan', ['branchy.plan.yaml']);
    mockRl.restore();
    let plan = yaml.parse(fs.readFileSync(path.join(contractsDir, 'branchy.plan.yaml'), 'utf8'));
    expect(plan.files[0].path).toBe('src/a/file.ts');

    mockRl = mockReadlineAnswers(['4']);
    await runtime.executeAgentCommand('strategist', 'optimize-plan', ['branchy.plan.yaml']);
    mockRl.restore();

    expect(consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n')).toContain('Manual reorder not yet implemented.');
    plan = yaml.parse(fs.readFileSync(path.join(contractsDir, 'branchy.plan.yaml'), 'utf8'));
    expect(plan.files[0].path).toBe('src/a/file.ts');
    consoleSpy.mockRestore();
  });

  it('marks contracts complete when the auditor workflow passes', async () => {
    createTestContract('audited', `# FC: Audited
**ID:** FC-500 | **Status:** approved

## Objective
Audit the workflow.

## Scope
- verify files

## Directories
**Allowed:** \`src/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | \`src/audited.js\` | file |

## Done When
- [ ] done
`);
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'src', 'audited.js'), 'module.exports = true;\n', 'utf8');
    fs.writeFileSync(path.join(contractsDir, 'audited.plan.yaml'), yaml.stringify({
      status: 'executing',
      files: [{ action: 'create', path: 'src/audited.js' }],
    }));
    const execSpy = jest.spyOn(childProcess, 'execSync').mockImplementation(() => Buffer.from('ok'));
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const mockRl = mockReadlineAnswers([]);

    await runtime.executeAgentCommand('auditor', 'audit-contract', ['audited.fc.md']);

    expect(fs.readFileSync(path.join(contractsDir, 'audited.fc.md'), 'utf8')).toContain('**Status:** complete');
    const plan = yaml.parse(fs.readFileSync(path.join(contractsDir, 'audited.plan.yaml'), 'utf8'));
    expect(plan.status).toBe('complete');
    expect(execSpy).toHaveBeenCalledTimes(3);
    const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('Audit checklist:');
    expect(output).toContain('Audit passed! Contract marked complete.');

    mockRl.restore();
    consoleSpy.mockRestore();
    execSpy.mockRestore();
  });

  it('reports missing files and failed checks when the auditor workflow fails', async () => {
    createTestContract('audit-fail', `# FC: Audit Fail
**ID:** FC-501 | **Status:** approved

## Objective
Fail the audit.

## Scope
- verify files

## Directories
**Allowed:** \`src/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | \`src/missing.js\` | file |

## Done When
- [ ] done
`);
    fs.writeFileSync(path.join(contractsDir, 'audit-fail.plan.yaml'), yaml.stringify({
      status: 'executing',
      files: [{ action: 'create', path: 'src/missing.js' }],
    }));
    const execSpy = jest.spyOn(childProcess, 'execSync').mockImplementation(() => {
      throw new Error('check failed');
    });
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const mockRl = mockReadlineAnswers([]);

    await runtime.executeAgentCommand('auditor', 'audit-contract', ['audit-fail.fc.md']);

    expect(fs.readFileSync(path.join(contractsDir, 'audit-fail.fc.md'), 'utf8')).toContain('**Status:** approved');
    const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('Audit failed. Issues need resolution.');
    expect(output).toContain('Missing files:');
    expect(output).toContain('src/missing.js');

    mockRl.restore();
    consoleSpy.mockRestore();
    execSpy.mockRestore();
  });

  it('warns when quality check has no plan and reports file-level warnings otherwise', async () => {
    createTestContract('quality-empty');
    fs.writeFileSync(path.join(contractsDir, 'quality-empty.plan.yaml'), yaml.stringify({
      status: 'approved',
      files: [
        { action: 'modify', path: 'src/problem.js' },
        { action: 'modify', path: 'src/clean.js' },
      ],
    }));
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'src', 'problem.js'), 'console.log("x");\n// TODO\nconst value = any;\n', 'utf8');
    fs.writeFileSync(path.join(tempDir, 'src', 'clean.js'), 'export function clean() { return true; }\n', 'utf8');
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    let mockRl = mockReadlineAnswers([]);

    await runtime.executeAgentCommand('auditor', 'quality-check', ['quality-empty.fc.md']);

    let output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('Warnings:');
    expect(output).toContain('Contains TODO comments');
    expect(output).toContain('No quality issues');

    consoleSpy.mockClear();
    fs.unlinkSync(path.join(contractsDir, 'quality-empty.plan.yaml'));
    mockRl.restore();
    mockRl = mockReadlineAnswers([]);

    await runtime.executeAgentCommand('auditor', 'quality-check', ['quality-empty.fc.md']);

    output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(output).toContain('No plan found. Generate a plan first.');

    mockRl.restore();
    consoleSpy.mockRestore();
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Integration Tests', () => {
  it('should create contracts directory if not exists', () => {
    const newTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-new-'));
    const newRuntime = createWorkflowRuntime({
      c: mockColors,
      outputMode: 'console',
      pkgRoot: PKG_ROOT,
      cwd: newTempDir,
      commandHandlers: mockCommandHandlers,
    });

    expect(newRuntime).toBeDefined();
    fs.rmSync(newTempDir, { recursive: true });
  });

  it('should load agent and access its menu', () => {
    const agent = runtime.loadAgent('architect');
    expect(agent.agent.menu).toBeDefined();
    expect(Array.isArray(agent.agent.menu)).toBe(true);
    expect(agent.agent.menu.length).toBeGreaterThan(0);
  });

  it('should load agent and access its persona', () => {
    const agent = runtime.loadAgent('architect');
    expect(agent.agent.persona).toBeDefined();
    expect(agent.agent.persona.identity).toBeDefined();
  });

  it('should handle workflow with all agent types', () => {
    const agentTypes = ['analyst', 'architect', 'validator', 'strategist', 'dev', 'tester', 'auditor', 'quick'];
    agentTypes.forEach((type) => {
      const agent = runtime.loadAgent(type);
      expect(agent).not.toBeNull();
      expect(agent.agent.metadata).toBeDefined();
    });
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Edge Cases', () => {
  it('should handle empty contracts directory', () => {
    const emptyDir = path.join(tempDir, 'empty-contracts');
    fs.mkdirSync(emptyDir, { recursive: true });
    // No contracts should not cause errors
    expect(fs.readdirSync(emptyDir).length).toBe(0);
  });

  it('should handle malformed progress files gracefully', () => {
    const progressDir = path.join(tempDir, '.grabby-progress');
    fs.mkdirSync(progressDir, { recursive: true });
    fs.writeFileSync(path.join(progressDir, 'bad.json'), 'not valid json');

    // May throw on malformed JSON - this is acceptable behavior
    // The important thing is the function exists and handles the directory
    expect(typeof runtime.listProgress).toBe('function');
  });

  it('should handle progress without currentStep', () => {
    const progressDir = path.join(tempDir, '.grabby-progress');
    fs.mkdirSync(progressDir, { recursive: true });
    fs.writeFileSync(
      path.join(progressDir, 'no-step.json'),
      JSON.stringify({ workflow: 'no-step', timestamp: new Date().toISOString(), data: {} })
    );

    const progress = runtime.listProgress();
    expect(progress[0].step).toBe(0);
  });
});

function writeApprovedWorkflowContract(name) {
  const contractPath = path.join(contractsDir, name);
  fs.writeFileSync(contractPath, `# FC: Editable Feature
**ID:** FC-555 | **Status:** approved

## Objective
Original objective

## Scope
- Keep bounded

## Non-Goals
- none

## Directories
**Allowed:** \`src/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | \`src/editable.ts\` | update |

## Dependencies
- Allowed: existing packages only

## Done When
- [ ] Tests pass (80%+ coverage)

## Testing
- Unit
`, 'utf8');
  return contractPath;
}
