/**
 * Tests for Contract Levels System
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const contractLevels = require('../lib/contract-levels.cjs');

// Test directories
const TEST_DIR = path.join(__dirname, '.test-levels');
const TEST_GLOBAL = path.join(TEST_DIR, '.grabby-test');

// Save original home dir
const originalHome = os.homedir;

// Setup and teardown
function setup() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true });
  }
  fs.mkdirSync(TEST_DIR, { recursive: true });
  fs.mkdirSync(path.join(TEST_DIR, 'contracts'), { recursive: true });
}

function teardown() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true });
  }
}

// Test runner
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    setup();
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    failed++;
  } finally {
    teardown();
  }
}

function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`${message} Expected ${expected}, got ${actual}`);
  }
}

function assertTrue(value, message = '') {
  if (!value) {
    throw new Error(message || 'Expected true');
  }
}

function assertIncludes(arr, item, message = '') {
  if (!arr.includes(item)) {
    throw new Error(`${message} Expected array to include ${item}`);
  }
}

// Helper to create a test contract
function createContract(dir, name, content) {
  const filePath = path.join(dir, 'contracts', name);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

// Tests
console.log('\nContract Levels Tests\n');

test('getContractLevel extracts explicit system level', () => {
  const content = `# Contract
**Status:** approved
**Level:** system

## Objective
Test.
`;
  const level = contractLevels.getContractLevel(content);
  assertEqual(level, 'system', 'Level');
});

test('getContractLevel extracts explicit project level', () => {
  const content = `# Contract
**Status:** approved
**Level:** project

## Objective
Test.
`;
  const level = contractLevels.getContractLevel(content);
  assertEqual(level, 'project', 'Level');
});

test('getContractLevel returns null for no explicit level', () => {
  const content = `# Contract
**Status:** approved

## Objective
Test.
`;
  const level = contractLevels.getContractLevel(content);
  assertEqual(level, null, 'Level should be null');
});

test('detectLikelySystemContract identifies system contracts', () => {
  const content = `# Contract
This applies to all projects and defines coding standards
for our company-wide security policy.
`;
  const result = contractLevels.detectLikelySystemContract(content);
  assertEqual(result.likely, 'system', 'Likely system');
  assertTrue(result.systemScore > result.projectScore, 'Higher system score');
});

test('detectLikelySystemContract identifies project contracts', () => {
  const content = `# Contract
This feature is specific to this project.
Create components in src/components/ and pages/.
`;
  const result = contractLevels.detectLikelySystemContract(content);
  assertEqual(result.likely, 'project', 'Likely project');
  assertTrue(result.projectScore > result.systemScore, 'Higher project score');
});

test('detectLikelySystemContract returns null for ambiguous', () => {
  const content = `# Contract
Add a feature.
`;
  const result = contractLevels.detectLikelySystemContract(content);
  assertTrue(result.confidence === 'none' || result.confidence === 'low', 'Low or no confidence');
});

test('listProjectContracts lists contracts in project', () => {
  createContract(TEST_DIR, 'test.fc.md', `# Feature Contract: Test

**ID:** FC-001
**Status:** approved

## Objective
Test.
`);

  const contracts = contractLevels.listProjectContracts(TEST_DIR);
  assertEqual(contracts.length, 1, 'Contract count');
  assertEqual(contracts[0].id, 'FC-001', 'Contract ID');
  assertEqual(contracts[0].level, 'project', 'Level');
});

test('listProjectContracts returns empty for no contracts', () => {
  const contracts = contractLevels.listProjectContracts(TEST_DIR);
  assertEqual(contracts.length, 0, 'Empty');
});

test('listAllContracts combines system and project', () => {
  createContract(TEST_DIR, 'project.fc.md', `# Feature Contract: Project

**ID:** FC-001
**Status:** approved

## Objective
Test.
`);

  const result = contractLevels.listAllContracts(TEST_DIR);
  assertTrue(Array.isArray(result.system), 'System array');
  assertTrue(Array.isArray(result.project), 'Project array');
  assertEqual(result.project.length, 1, 'Project count');
  assertEqual(result.all.length, result.system.length + 1, 'All count');
});

test('shouldAskLevel returns false for explicit level', () => {
  const content = `# Contract
**Level:** system

## Objective
Test.
`;
  const result = contractLevels.shouldAskLevel(content);
  assertEqual(result.ask, false, 'Should not ask');
  assertEqual(result.level, 'system', 'Level');
});

test('shouldAskLevel returns false for high confidence detection', () => {
  const content = `# Contract
This applies to all projects company-wide.
Security standards and coding conventions.
Best practices for every project.
`;
  const result = contractLevels.shouldAskLevel(content);
  assertEqual(result.ask, false, 'Should not ask');
  assertEqual(result.level, 'system', 'Detected level');
  assertTrue(result.detected === true, 'Was detected');
});

test('shouldAskLevel returns true for ambiguous content', () => {
  const content = `# Contract
Add something.
`;
  const result = contractLevels.shouldAskLevel(content);
  assertEqual(result.ask, true, 'Should ask');
});

test('getMergedContext combines security rules', () => {
  // Create project contract with security section
  createContract(TEST_DIR, 'sec.fc.md', `# Feature Contract: Security

**ID:** FC-001
**Status:** approved

## Objective
Security.

## Security Considerations

- [x] Validate input
- [ ] Escape output

## Directories

**Restricted:** \`secrets/, keys/\`
`);

  const context = contractLevels.getMergedContext(TEST_DIR);
  assertTrue(context.security.length >= 2, 'Has security rules');
  assertIncludes(context.directories.restricted, 'secrets/', 'Has restricted');
  assertIncludes(context.directories.restricted, 'keys/', 'Has restricted 2');
});

test('getMergedContext deduplicates directories', () => {
  createContract(TEST_DIR, 'a.fc.md', `# Feature Contract: A

**ID:** FC-001
**Status:** approved

## Directories

**Restricted:** \`node_modules/, .env\`
`);

  createContract(TEST_DIR, 'b.fc.md', `# Feature Contract: B

**ID:** FC-002
**Status:** approved

## Directories

**Restricted:** \`node_modules/, .env\`
`);

  const context = contractLevels.getMergedContext(TEST_DIR);
  // Count occurrences
  const nodeModCount = context.directories.restricted.filter(d => d === 'node_modules/').length;
  assertEqual(nodeModCount, 1, 'No duplicates');
});

test('formatContractsList groups by level', () => {
  const contracts = {
    system: [
      { id: 'SYS-001', title: 'System Contract', status: 'approved' }
    ],
    project: [
      { id: 'FC-001', title: 'Project Contract', status: 'draft' }
    ],
    all: []
  };

  const output = contractLevels.formatContractsList(contracts, { groupByLevel: true });
  assertTrue(output.includes('System Contracts'), 'Has system header');
  assertTrue(output.includes('Project Contracts'), 'Has project header');
  assertTrue(output.includes('SYS-001'), 'Has system contract');
  assertTrue(output.includes('FC-001'), 'Has project contract');
});

test('formatContractsList shows empty message', () => {
  const contracts = { system: [], project: [], all: [] };
  const output = contractLevels.formatContractsList(contracts);
  assertEqual(output, 'No contracts found.', 'Empty message');
});

// Results
console.log(`\n─────────────────────────────────`);
console.log(`Tests: ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────\n`);

process.exit(failed > 0 ? 1 : 0);
