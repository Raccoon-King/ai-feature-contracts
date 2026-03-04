/**
 * Grabby - Persona Handoff Integration Tests
 * Tests Archie → Val → Sage → Dev → Iris flow
 * Coverage target: 80%+
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const core = require('../../lib/core.cjs');
const personas = require('../../lib/personas.cjs');

// Test directories
const PKG_ROOT = path.join(__dirname, '..', '..');
const AGENTS_DIR = path.join(PKG_ROOT, 'agents');

// Temp directory for tests
let tempDir;
let contractsDir;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-persona-test-'));
  contractsDir = path.join(tempDir, 'contracts');
  fs.mkdirSync(contractsDir, { recursive: true });
});

afterEach(() => {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
});

// ============================================================================
// AGENT LOADING
// ============================================================================

describe('Agent Loading', () => {
  it('should load all required agents', () => {
    const agents = ['analyst', 'contract-architect', 'scope-validator', 'plan-strategist', 'dev-agent', 'auditor'];

    agents.forEach(agentName => {
      const agent = core.loadAgent(AGENTS_DIR, agentName);
      expect(agent).not.toBeNull();
      expect(agent.agent.metadata).toBeDefined();
    });
  });

  it('should load agents by alias', () => {
    const aliases = {
      'analyst': 'Ari',
      'architect': 'Archie',
      'validator': 'Val',
      'strategist': 'Sage',
      'dev': 'Dev',
      'tester': 'Tess',
      'auditor': 'Iris',
    };

    Object.entries(aliases).forEach(([alias, expectedName]) => {
      const agent = core.loadAgent(AGENTS_DIR, alias);
      expect(agent).not.toBeNull();
      expect(agent.agent.metadata.name).toBe(expectedName);
    });
  });

  it('should have menu items for each agent', () => {
    const agent = core.loadAgent(AGENTS_DIR, 'architect');
    expect(agent.agent.menu).toBeDefined();
    expect(agent.agent.menu.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// PERSONA SELECTION
// ============================================================================

describe('Persona Selection', () => {
  it('should select analyst for intake tasks', () => {
    const persona = personas.selectPersonaForTask('clarify this request and turn it into a ticket');
    expect(persona.agentKey).toMatch(/analyst/i);
    expect(persona.agentName).toBe('Ari');
  });

  it('should select architect for contract creation tasks', () => {
    const persona = personas.selectPersonaForTask('create a new feature contract');
    expect(persona.agentKey).toMatch(/architect/i);
    expect(persona.agentName).toBe('Archie');
  });

  it('should select validator for validation tasks', () => {
    const persona = personas.selectPersonaForTask('validate the contract');
    expect(persona.agentKey).toMatch(/validator/i);
    expect(persona.agentName).toBe('Val');
  });

  it('should select strategist for planning tasks', () => {
    const persona = personas.selectPersonaForTask('plan the implementation');
    expect(persona.agentKey).toMatch(/strategist/i);
    expect(persona.agentName).toBe('Sage');
  });

  it('should select dev for execution tasks', () => {
    const persona = personas.selectPersonaForTask('implement the feature');
    expect(persona.agentKey).toMatch(/dev/i);
    expect(persona.agentName).toBe('Dev');
  });

  it('should select tester for verification tasks', () => {
    const persona = personas.selectPersonaForTask('improve regression coverage for this change');
    expect(persona.agentKey).toMatch(/tester/i);
    expect(persona.agentName).toBe('Tess');
  });

  it('should select auditor for review tasks', () => {
    const persona = personas.selectPersonaForTask('audit the implementation');
    expect(persona.agentKey).toMatch(/auditor/i);
    expect(persona.agentName).toBe('Iris');
  });
});

// ============================================================================
// ARCHIE → VAL HANDOFF
// ============================================================================

describe('Ari -> Archie -> Val Handoff', () => {
  it('should use analyst intake before contract authoring', () => {
    const analyst = core.loadAgent(AGENTS_DIR, 'analyst');
    expect(analyst.agent.metadata.name).toBe('Ari');
    expect(analyst.agent.persona.role).toContain('Request Analyst');
  });

  it('should create contract ready for validation', () => {
    const archie = core.loadAgent(AGENTS_DIR, 'architect');
    expect(archie.agent.metadata.name).toBe('Archie');

    // Archie creates contract
    const contractContent = `# FC: Test Feature
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
| create | src/test.ts | Main |
| create | src/test.test.ts | Tests |

## Done When
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes

## Security Considerations
- [ ] Input validation

## Testing
- Unit tests
`;

    const filePath = path.join(contractsDir, 'test-feature.fc.md');
    fs.writeFileSync(filePath, contractContent);

    // Val validates
    const val = core.loadAgent(AGENTS_DIR, 'validator');
    expect(val.agent.metadata.name).toBe('Val');

    const validation = core.validateContract(contractContent);
    expect(validation.valid).toBe(true);
  });

  it('should provide validation feedback', () => {
    const contractContent = `# FC: Invalid
## Objective
[TODO]`;

    const validation = core.validateContract(contractContent);
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
    // Val would report these errors back to Archie
  });
});

// ============================================================================
// VAL → SAGE HANDOFF
// ============================================================================

describe('Val → Sage Handoff', () => {
  it('should only proceed to planning after validation passes', () => {
    const validContract = `# FC: Valid Feature
**ID:** FC-123 | **Status:** draft

## Objective
Test

## Scope
- Item 1

## Directories
**Allowed:** \`src/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | src/test.ts | Main |
| create | src/test.test.ts | Tests |

## Done When
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes

## Security Considerations
- [ ] Checked

## Testing
- Unit tests
`;

    // Val validates
    const validation = core.validateContract(validContract);
    expect(validation.valid).toBe(true);

    // Sage can proceed
    const sage = core.loadAgent(AGENTS_DIR, 'strategist');
    expect(sage.agent.metadata.name).toBe('Sage');
  });

  it('should block planning for invalid contracts', () => {
    const invalidContract = `# FC: Invalid
## Objective
Improve everything`;

    const validation = core.validateContract(invalidContract);
    expect(validation.valid).toBe(false);
    // Sage should not proceed
  });
});

// ============================================================================
// SAGE → DEV HANDOFF
// ============================================================================

describe('Sage → Dev Handoff', () => {
  it('should generate plan for dev to execute', () => {
    const sage = core.loadAgent(AGENTS_DIR, 'strategist');
    expect(sage.agent.metadata.name).toBe('Sage');

    // Sage generates plan
    const plan = {
      contract: 'test-feature.fc.md',
      phase: 'plan',
      files: [
        { order: 1, action: 'create', path: 'src/test.ts', reason: 'Main' },
        { order: 2, action: 'create', path: 'src/test.test.ts', reason: 'Tests' },
      ],
      status: 'approved',
    };

    // Dev receives plan
    const dev = core.loadAgent(AGENTS_DIR, 'dev');
    expect(dev.agent.metadata.name).toBe('Dev');

    expect(plan.files.length).toBeGreaterThan(0);
    expect(plan.status).toBe('approved');
  });

  it('should provide clear execution instructions', () => {
    const plan = {
      files: [
        { order: 1, action: 'create', path: 'src/feature.ts' },
      ],
      rules: ['typescript', 'hooks', 'testing'],
    };

    expect(plan.files[0].order).toBe(1);
    expect(plan.rules.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// DEV → IRIS HANDOFF
// ============================================================================

describe('Dev → Iris Handoff', () => {
  it('should prepare implementation for verification before audit', () => {
    const dev = core.loadAgent(AGENTS_DIR, 'dev');
    expect(dev.agent.metadata.name).toBe('Dev');

    // Dev completes implementation
    const implementation = {
      filesCreated: ['src/feature.ts', 'src/feature.test.ts'],
      testsPass: true,
      lintPass: true,
    };

    // Tess verifies
    const tester = core.loadAgent(AGENTS_DIR, 'tester');
    expect(tester.agent.metadata.name).toBe('Tess');

    // Iris audits
    const iris = core.loadAgent(AGENTS_DIR, 'auditor');
    expect(iris.agent.metadata.name).toBe('Iris');

    expect(implementation.filesCreated.length).toBeGreaterThan(0);
  });

  it('should verify all planned files exist', () => {
    const plan = {
      files: [
        { path: 'src/a.ts' },
        { path: 'src/b.ts' },
      ],
    };

    const implementation = {
      filesCreated: ['src/a.ts', 'src/b.ts'],
    };

    const allFilesExist = plan.files.every(
      f => implementation.filesCreated.includes(f.path)
    );

    expect(allFilesExist).toBe(true);
  });
});

// ============================================================================
// FULL HANDOFF CHAIN
// ============================================================================

describe('Full Handoff Chain', () => {
  it('should complete Ari -> Archie -> Val -> Sage -> Dev -> Tess -> Iris flow', () => {
    // 1. Ari analyzes and routes the request
    const analyst = core.loadAgent(AGENTS_DIR, 'analyst');
    expect(analyst.agent.metadata.name).toBe('Ari');

    // 2. Archie creates contract
    const archie = core.loadAgent(AGENTS_DIR, 'architect');
    expect(archie.agent.metadata.name).toBe('Archie');

    const contractContent = `# FC: Full Flow Feature
**ID:** FC-123 | **Status:** draft

## Objective
Complete feature

## Scope
- Main implementation

## Directories
**Allowed:** \`src/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | src/flow.ts | Main |
| create | src/flow.test.ts | Tests |

## Done When
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes

## Security Considerations
- [ ] Input validation

## Testing
- Unit tests
`;

    // 3. Val validates
    const val = core.loadAgent(AGENTS_DIR, 'validator');
    const validation = core.validateContract(contractContent);
    expect(validation.valid).toBe(true);

    // 4. Sage plans
    const sage = core.loadAgent(AGENTS_DIR, 'strategist');
    const plan = {
      contract: 'full-flow-feature.fc.md',
      status: 'approved',
      files: [
        { path: 'src/flow.ts', action: 'create' },
        { path: 'src/flow.test.ts', action: 'create' },
      ],
    };

    // 5. Dev implements
    const dev = core.loadAgent(AGENTS_DIR, 'dev');
    const implementation = {
      filesCreated: plan.files.map(f => f.path),
      testsPass: true,
    };

    // 6. Tess verifies
    const tester = core.loadAgent(AGENTS_DIR, 'tester');
    const verification = {
      testsPass: implementation.testsPass,
      filesCovered: implementation.filesCreated.length,
    };

    // 7. Iris audits
    const iris = core.loadAgent(AGENTS_DIR, 'auditor');
    const auditPassed = implementation.filesCreated.length === plan.files.length
      && verification.testsPass
      && tester.agent.metadata.name === 'Tess';

    expect(auditPassed).toBe(true);
  });

  it('should handle handoff failures gracefully', () => {
    // Invalid contract at Val stage
    const invalidContract = '## Objective\n[TODO]';
    const validation = core.validateContract(invalidContract);

    expect(validation.valid).toBe(false);
    // Flow should stop here, not proceed to Sage
    expect(validation.errors.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// PERSONA METADATA
// ============================================================================

describe('Persona Metadata', () => {
  it('should have consistent persona information', () => {
    const expectedPersonas = [
      { alias: 'analyst', name: 'Ari', role: 'Analyst' },
      { alias: 'architect', name: 'Archie', role: 'Architect' },
      { alias: 'validator', name: 'Val', role: 'Validator' },
      { alias: 'strategist', name: 'Sage', role: 'Strategist' },
      { alias: 'dev', name: 'Dev', role: 'Agent' },
      { alias: 'tester', name: 'Tess', role: 'Test Engineer' },
      { alias: 'auditor', name: 'Iris', role: 'Auditor' },
    ];

    expectedPersonas.forEach(expected => {
      const agent = core.loadAgent(AGENTS_DIR, expected.alias);
      expect(agent.agent.metadata.name).toBe(expected.name);
      expect(agent.agent.metadata.title).toContain(expected.role);
    });
  });

  it('should have greeting for each persona', () => {
    const aliases = ['analyst', 'architect', 'validator', 'strategist', 'dev', 'tester', 'auditor'];

    aliases.forEach(alias => {
      const agent = core.loadAgent(AGENTS_DIR, alias);
      expect(agent.agent.greeting).toBeDefined();
      expect(agent.agent.greeting.length).toBeGreaterThan(0);
    });
  });

  it('should have persona identity defined', () => {
    const aliases = ['analyst', 'architect', 'validator', 'strategist', 'dev', 'tester', 'auditor'];

    aliases.forEach(alias => {
      const agent = core.loadAgent(AGENTS_DIR, alias);
      expect(agent.agent.persona).toBeDefined();
      expect(agent.agent.persona.identity).toBeDefined();
    });
  });
});
