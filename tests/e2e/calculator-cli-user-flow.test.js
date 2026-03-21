/**
 * Grabby - Calculator CLI user-flow test
 *
 * Simulates a user driving Grabby from the shell to build and audit
 * a simple calculator web app contract from end to end.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('yaml');
const { spawnSync } = require('child_process');
const { getCliSpawnSupport } = require('../helpers/cli-spawn-support');

const PKG_ROOT = path.join(__dirname, '..', '..');
const CLI_PATH = path.join(PKG_ROOT, 'bin', 'index.cjs');

const CALCULATOR_CONTRACT = `# FC: Calculator Web App
**ID:** FC-CALC-001 | **Status:** draft

## Objective
Build a simple browser-based calculator web app with add, subtract, multiply, and divide operations.

## Scope
- HTML structure for the calculator UI
- CSS styling for layout and buttons
- JavaScript logic for arithmetic operations
- Unit tests for the calculator logic

## Non-Goals
- No server-side code
- No external framework dependencies
- No scientific functions

## Directories
**Allowed:** \`src/\`
**Restricted:** \`node_modules/\`, \`.env*\`, \`dist/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | \`src/index.html\` | Main calculator UI |
| create | \`src/calculator.js\` | Core arithmetic logic |
| create | \`src/style.css\` | Calculator styling |
| create | \`src/calculator.test.js\` | Unit tests |

## Dependencies
- Allowed: none (vanilla JS only)
- Banned: moment, lodash, jquery, react

## Security Considerations
- [ ] Input validation implemented
- [ ] No use of eval

## Code Quality
- [ ] Lint passes

## Done When
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes
- [ ] Calculator performs all four operations correctly
- [ ] Divide-by-zero is handled safely

## Testing
- Unit: \`src/calculator.test.js\`

## Context Refs
ARCH_VERSION: v1
RULESET_VERSION: v1
ENV_VERSION: v1
- ARCH_INDEX_v1
- RULESET_CORE_v1
- ENV_STACK_v1
`;

const CALCULATOR_JS = `'use strict';

function add(a, b) { return a + b; }
function subtract(a, b) { return a - b; }
function multiply(a, b) { return a * b; }
function divide(a, b) {
  if (b === 0) {
    throw new Error('Division by zero');
  }
  return a / b;
}

let currentInput = '';
let previousInput = '';
let operator = null;

function updateDisplay() {
  if (typeof document === 'undefined') return;
  const display = document.getElementById('display');
  if (display) {
    display.value = currentInput || previousInput || '0';
  }
}

function appendDigit(digit) {
  if (!/^[0-9]$/.test(String(digit))) return;
  currentInput += digit;
  updateDisplay();
}

function appendDecimal() {
  if (!currentInput.includes('.')) {
    currentInput += currentInput ? '.' : '0.';
    updateDisplay();
  }
}

function setOperator(nextOperator) {
  if (!['+', '-', '*', '/'].includes(nextOperator) || currentInput === '') return;
  if (previousInput !== '') calculate();
  previousInput = currentInput;
  currentInput = '';
  operator = nextOperator;
}

function calculate() {
  if (!operator || previousInput === '' || currentInput === '') return;
  const a = Number(previousInput);
  const b = Number(currentInput);
  let result = 0;

  if (operator === '+') result = add(a, b);
  if (operator === '-') result = subtract(a, b);
  if (operator === '*') result = multiply(a, b);
  if (operator === '/') result = divide(a, b);

  currentInput = String(result);
  previousInput = '';
  operator = null;
  updateDisplay();
}

function clearDisplay() {
  currentInput = '';
  previousInput = '';
  operator = null;
  updateDisplay();
}

if (typeof module !== 'undefined') {
  module.exports = {
    add,
    subtract,
    multiply,
    divide,
  };
}
`;

const CALCULATOR_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Calculator</title>
    <link rel="stylesheet" href="style.css">
  </head>
  <body>
    <main class="calculator">
      <input id="display" type="text" readonly value="0">
      <div class="keys">
        <button onclick="appendDigit('7')">7</button>
        <button onclick="appendDigit('8')">8</button>
        <button onclick="appendDigit('9')">9</button>
        <button onclick="setOperator('/')">/</button>
        <button onclick="appendDigit('4')">4</button>
        <button onclick="appendDigit('5')">5</button>
        <button onclick="appendDigit('6')">6</button>
        <button onclick="setOperator('*')">*</button>
        <button onclick="appendDigit('1')">1</button>
        <button onclick="appendDigit('2')">2</button>
        <button onclick="appendDigit('3')">3</button>
        <button onclick="setOperator('-')">-</button>
        <button onclick="appendDigit('0')">0</button>
        <button onclick="appendDecimal()">.</button>
        <button onclick="calculate()">=</button>
        <button onclick="setOperator('+')">+</button>
        <button class="wide" onclick="clearDisplay()">C</button>
      </div>
    </main>
    <script src="calculator.js"></script>
  </body>
</html>
`;

const CALCULATOR_CSS = `* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #102542, #1b3b6f);
  font-family: "Trebuchet MS", sans-serif;
}
.calculator {
  width: 320px;
  padding: 20px;
  border-radius: 18px;
  background: #f7f4ea;
  box-shadow: 0 20px 45px rgba(0, 0, 0, 0.25);
}
#display {
  width: 100%;
  margin-bottom: 12px;
  padding: 14px;
  font-size: 2rem;
  text-align: right;
}
.keys {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}
button {
  min-height: 56px;
  border: 0;
  border-radius: 12px;
  font-size: 1.1rem;
  background: #d95d39;
  color: #fff;
}
.wide {
  grid-column: span 4;
}
`;

const CALCULATOR_TEST = `'use strict';

const { add, subtract, multiply, divide } = require('./calculator');

describe('calculator', () => {
  test('adds values', () => {
    expect(add(2, 3)).toBe(5);
  });

  test('subtracts values', () => {
    expect(subtract(7, 2)).toBe(5);
  });

  test('multiplies values', () => {
    expect(multiply(4, 3)).toBe(12);
  });

  test('divides values', () => {
    expect(divide(12, 3)).toBe(4);
  });

  test('throws on divide by zero', () => {
    expect(() => divide(5, 0)).toThrow('Division by zero');
  });
});
`;

const cliSpawnSupport = getCliSpawnSupport({
  cwd: PKG_ROOT,
  env: { FORCE_COLOR: '0', NO_COLOR: '1' },
});
const describeCli = cliSpawnSupport.available ? describe : describe.skip;

function stripAnsi(value) {
  return String(value || '').replace(/\x1B\[[0-9;]*m/g, '');
}

function runCli(cwd, args) {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    timeout: 30000,
  });

  return {
    status: result.status ?? 0,
    stdout: stripAnsi(result.stdout),
    stderr: stripAnsi(result.stderr),
  };
}

function writeCalculatorContract(projectDir) {
  const contractsDir = path.join(projectDir, 'contracts');
  fs.mkdirSync(contractsDir, { recursive: true });
  const filePath = path.join(contractsDir, 'calculator-web-app.fc.md');
  fs.writeFileSync(filePath, CALCULATOR_CONTRACT, 'utf8');
  return filePath;
}

function writeCalculatorSource(projectDir) {
  const srcDir = path.join(projectDir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(path.join(srcDir, 'calculator.js'), CALCULATOR_JS, 'utf8');
  fs.writeFileSync(path.join(srcDir, 'index.html'), CALCULATOR_HTML, 'utf8');
  fs.writeFileSync(path.join(srcDir, 'style.css'), CALCULATOR_CSS, 'utf8');
  fs.writeFileSync(path.join(srcDir, 'calculator.test.js'), CALCULATOR_TEST, 'utf8');
}

describeCli('Calculator CLI user flow', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-calculator-cli-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('builds and audits a calculator app through the CLI surface', () => {
    const init = runCli(tempDir, ['init', '--force']);
    expect(init.status).toBe(0);

    const help = runCli(tempDir, ['help']);
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('Grabby - CLI');

    const emptyList = runCli(tempDir, ['list']);
    expect(emptyList.status).toBe(0);

    const create = runCli(tempDir, ['create', 'calculator', 'web', 'app']);
    expect(create.status).toBe(0);
    expect(create.stdout).toContain('Created: contracts/calculator-web-app.fc.md');

    writeCalculatorContract(tempDir);

    const validate = runCli(tempDir, ['validate', 'calculator-web-app.fc.md']);
    expect(validate.status).toBe(0);
    expect(validate.stdout).toContain('Validation passed');
    expect(validate.stdout).not.toContain('Validation passed with warnings');

    const plan = runCli(tempDir, ['plan', 'calculator-web-app.fc.md']);
    expect(plan.status).toBe(0);
    expect(plan.stdout).toContain('PHASE 1: PLAN');
    expect(fs.existsSync(path.join(tempDir, 'contracts', 'FC-CALC-001.plan.yaml'))).toBe(true);

    const backlog = runCli(tempDir, ['backlog', 'calculator-web-app.fc.md']);
    expect(backlog.status).toBe(0);
    expect(backlog.stdout).toContain('AGILE BACKLOG');
    expect(fs.existsSync(path.join(tempDir, 'contracts', 'calculator-web-app.backlog.yaml'))).toBe(true);

    const prompt = runCli(tempDir, ['prompt', 'calculator-web-app.fc.md']);
    expect(prompt.status).toBe(0);
    expect(fs.existsSync(path.join(tempDir, 'contracts', 'calculator-web-app.prompt.md'))).toBe(true);

    const approve = runCli(tempDir, ['approve', 'calculator-web-app.fc.md']);
    expect(approve.status).toBe(0);
    expect(fs.readFileSync(path.join(tempDir, 'contracts', 'calculator-web-app.fc.md'), 'utf8'))
      .toContain('**Status:** approved');

    const execute = runCli(tempDir, ['execute', 'calculator-web-app.fc.md']);
    expect(execute.status).toBe(0);
    expect(execute.stdout).toContain('PHASE 2: EXECUTE');

    writeCalculatorSource(tempDir);

    const audit = runCli(tempDir, ['audit', 'calculator-web-app.fc.md']);
    expect(audit.status).toBe(0);
    expect(fs.existsSync(path.join(tempDir, 'contracts', 'FC-CALC-001.audit.md'))).toBe(true);

    const features = runCli(tempDir, ['features:list']);
    expect(features.status).toBe(0);
    expect(features.stdout).toContain('FC-CALC-001');

    const metrics = runCli(tempDir, ['metrics']);
    expect(metrics.status).toBe(0);
    expect(metrics.stdout).toContain('METRICS');

    const workspaceInfo = runCli(tempDir, ['workspace', 'info']);
    expect(workspaceInfo.status).toBe(0);
    expect(workspaceInfo.stdout.length).toBeGreaterThan(0);

    const systemHelp = runCli(tempDir, ['system']);
    expect(systemHelp.status).toBe(0);
    expect(systemHelp.stdout).toContain('System Contract Commands');

    const cicd = runCli(tempDir, ['cicd']);
    expect(cicd.status).toBe(0);
    expect(cicd.stdout.length).toBeGreaterThan(0);

    const plugins = runCli(tempDir, ['plugin', 'list']);
    expect(plugins.status).toBe(0);
    expect(plugins.stdout.length).toBeGreaterThan(0);

    const aiStatus = runCli(tempDir, ['ai', 'status']);
    expect(aiStatus.status).toBe(0);
    expect(aiStatus.stdout.length).toBeGreaterThan(0);

    const agentList = runCli(tempDir, ['agent', 'list']);
    expect(agentList.status).toBe(0);
    expect(agentList.stdout).toContain('Archie');
    expect(agentList.stdout).toContain('Val');
    expect(agentList.stdout).toContain('Sage');

    const party = runCli(tempDir, ['party']);
    expect(party.status).toBe(0);
    expect(party.stdout).toContain('TEAM WORKFLOW');

    const quick = runCli(tempDir, ['quick', 'calculator-web-app.fc.md']);
    expect(quick.status).toBe(0);
    expect(quick.stdout).toContain('QUICK');

    const task = runCli(tempDir, [
      'task',
      'calculator web app with add subtract multiply divide',
      '--ticket-id', 'CALC-CLI-001',
      '--who', 'frontend developers',
      '--what', 'Build a calculator web app',
      '--why', 'Exercise the CLI end to end',
      '--dod', 'tests pass,calculator works',
      '--task-name', 'calculator cli flow',
      '--objective', 'Build a simple calculator app via grabby CLI flow.',
      '--scope', 'HTML UI,JavaScript arithmetic logic,CSS styling,unit tests',
      '--directories', 'src/',
      '--done-when', 'tests pass,calculator works,divide by zero handled',
      '--testing', 'Unit: `src/calculator.test.js`',
      '--session-format', 'json',
      '--yes',
    ]);
    expect(task.status).toBe(0);
    expect(fs.existsSync(path.join(tempDir, 'contracts', 'CALC-CLI-001.fc.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'contracts', 'CALC-CLI-001.session.json'))).toBe(true);

    const sessionCheck = runCli(tempDir, ['session', 'CALC-CLI-001.fc.md', '--check']);
    expect(sessionCheck.status).toBe(0);
    expect(sessionCheck.stdout).toContain('OK contracts/CALC-CLI-001.session.json');

    const list = runCli(tempDir, ['list']);
    expect(list.status).toBe(0);
    expect(list.stdout).toContain('calculator-web-app.fc.md');
    expect(list.stdout).toContain('CALC-CLI-001.fc.md');

    const planData = yaml.parse(fs.readFileSync(path.join(tempDir, 'contracts', 'FC-CALC-001.plan.yaml'), 'utf8'));
    expect(planData.status).toBe('executing');
  });
});

describe('Calculator CLI spawn support', () => {
  it('documents whether child-process CLI execution is available in this environment', () => {
    if (cliSpawnSupport.available) {
      expect(cliSpawnSupport.reason).toBeNull();
      return;
    }

    expect(cliSpawnSupport.reason).toBeTruthy();
  });
});
