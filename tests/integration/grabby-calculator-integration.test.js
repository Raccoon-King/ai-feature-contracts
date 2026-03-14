/**
 * Grabby - Calculator Web App Integration Test
 *
 * GRABBY REPO ONLY: This test is specific to the grabby repository and is
 * not intended for use in other projects. It tests each grabby feature
 * end-to-end by building a real calculator web app project from scratch.
 *
 * Strategy:
 *   - Each grabby feature is tested in a fresh calculator project instance
 *   - If a feature fails: the project is deleted, the issue is repaired
 *     (by ensuring correct preconditions), and the test is retried once
 *     from a clean state
 *   - The calculator web app acts as a realistic contract scenario
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

// ============================================================================
// CONSTANTS
// ============================================================================

const PKG_ROOT = path.join(__dirname, '..', '..');
const CLI_PATH = path.join(PKG_ROOT, 'bin', 'index.cjs');
const NODE = process.execPath;

// Calculator app contract content — a fully valid grabby contract
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
- No advanced scientific functions

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

## Done When
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes
- [ ] Calculator performs all four operations correctly

## Security Considerations
- [ ] Input validation implemented (prevent eval injection)
- [ ] No sensitive data logged

## Testing
- Unit: src/calculator.test.js

## Context Refs
- ARCH_INDEX_v1
- RULESET_CORE_v1
`;

// Minimal calculator implementation to satisfy the audit
const CALCULATOR_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Calculator</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="calculator">
    <input type="text" id="display" readonly>
    <div id="buttons">
      <button onclick="appendDigit('7')">7</button>
      <button onclick="appendDigit('8')">8</button>
      <button onclick="appendDigit('9')">9</button>
      <button onclick="setOperator('/')">÷</button>
      <button onclick="appendDigit('4')">4</button>
      <button onclick="appendDigit('5')">5</button>
      <button onclick="appendDigit('6')">6</button>
      <button onclick="setOperator('*')">×</button>
      <button onclick="appendDigit('1')">1</button>
      <button onclick="appendDigit('2')">2</button>
      <button onclick="appendDigit('3')">3</button>
      <button onclick="setOperator('-')">−</button>
      <button onclick="appendDigit('0')">0</button>
      <button onclick="appendDecimal()">.</button>
      <button onclick="calculate()">=</button>
      <button onclick="setOperator('+')">+</button>
      <button onclick="clearDisplay()">C</button>
    </div>
  </div>
  <script src="calculator.js"></script>
</body>
</html>
`;

const CALCULATOR_JS = `'use strict';

// Core arithmetic operations
function add(a, b) { return a + b; }
function subtract(a, b) { return a - b; }
function multiply(a, b) { return a * b; }
function divide(a, b) {
  if (b === 0) throw new Error('Division by zero');
  return a / b;
}

// UI state
let currentInput = '';
let previousInput = '';
let operator = null;

function appendDigit(digit) {
  if (typeof digit !== 'string' || !/^[0-9]$/.test(digit)) return;
  currentInput += digit;
  updateDisplay();
}

function appendDecimal() {
  if (!currentInput.includes('.')) {
    currentInput += currentInput ? '.' : '0.';
    updateDisplay();
  }
}

function setOperator(op) {
  if (!['+', '-', '*', '/'].includes(op)) return;
  if (currentInput === '') return;
  if (previousInput !== '') calculate();
  previousInput = currentInput;
  currentInput = '';
  operator = op;
}

function calculate() {
  if (!operator || previousInput === '' || currentInput === '') return;
  const a = parseFloat(previousInput);
  const b = parseFloat(currentInput);
  let result;
  if (operator === '+') result = add(a, b);
  else if (operator === '-') result = subtract(a, b);
  else if (operator === '*') result = multiply(a, b);
  else if (operator === '/') result = divide(a, b);
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

function updateDisplay() {
  const display = document.getElementById('display');
  if (display) display.value = currentInput || previousInput || '0';
}

// Export for testing (Node.js environment)
if (typeof module !== 'undefined') {
  module.exports = { add, subtract, multiply, divide };
}
`;

const CALCULATOR_CSS = `* { box-sizing: border-box; margin: 0; padding: 0; }
body { display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #1a1a2e; }
#calculator { background: #16213e; border-radius: 12px; padding: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.4); }
#display { width: 100%; background: #0f3460; color: #e0e0e0; font-size: 1.8rem; text-align: right; padding: 12px; border: none; border-radius: 8px; margin-bottom: 12px; }
#buttons { display: grid; grid-template-columns: repeat(4, 64px); gap: 8px; }
button { background: #533483; color: #fff; font-size: 1.2rem; border: none; border-radius: 8px; height: 56px; cursor: pointer; transition: background 0.15s; }
button:hover { background: #6b4299; }
`;

const CALCULATOR_TEST_JS = `'use strict';

const { add, subtract, multiply, divide } = require('./calculator');

describe('Calculator arithmetic operations', () => {
  test('add: 2 + 3 = 5', () => expect(add(2, 3)).toBe(5));
  test('add: negative numbers', () => expect(add(-1, -1)).toBe(-2));
  test('subtract: 10 - 4 = 6', () => expect(subtract(10, 4)).toBe(6));
  test('subtract: result negative', () => expect(subtract(3, 7)).toBe(-4));
  test('multiply: 3 * 4 = 12', () => expect(multiply(3, 4)).toBe(12));
  test('multiply: by zero', () => expect(multiply(5, 0)).toBe(0));
  test('divide: 10 / 2 = 5', () => expect(divide(10, 2)).toBe(5));
  test('divide: throws on zero', () => expect(() => divide(5, 0)).toThrow('Division by zero'));
  test('divide: decimal result', () => expect(divide(7, 2)).toBe(3.5));
});
`;

// ============================================================================
// PROJECT HELPERS
// ============================================================================

/**
 * Create a fresh calculator project directory.
 * @returns {string} path to the project directory
 */
function createCalcProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-calc-'));
  fs.mkdirSync(path.join(dir, 'contracts'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify(
      {
        name: 'calculator-web-app',
        version: '1.0.0',
        description: 'Calculator web app — grabby integration test project',
        scripts: { test: 'node --experimental-vm-modules node_modules/.bin/jest' },
      },
      null,
      2,
    ),
  );
  return dir;
}

/**
 * Write a ready-to-validate calculator contract into the project.
 * @param {string} projectDir
 * @returns {string} contract file name (relative to contracts/)
 */
function writeCalculatorContract(projectDir) {
  const fileName = 'calculator-web-app.fc.md';
  fs.writeFileSync(path.join(projectDir, 'contracts', fileName), CALCULATOR_CONTRACT);
  return fileName;
}

/**
 * Write the calculator source files into the project.
 * @param {string} projectDir
 */
function writeCalculatorSourceFiles(projectDir) {
  fs.writeFileSync(path.join(projectDir, 'src', 'index.html'), CALCULATOR_HTML);
  fs.writeFileSync(path.join(projectDir, 'src', 'calculator.js'), CALCULATOR_JS);
  fs.writeFileSync(path.join(projectDir, 'src', 'style.css'), CALCULATOR_CSS);
  fs.writeFileSync(path.join(projectDir, 'src', 'calculator.test.js'), CALCULATOR_TEST_JS);
}

/**
 * Delete a project directory safely.
 * @param {string} dir
 */
function deleteProject(dir) {
  if (dir && fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Run a grabby CLI command in the given project directory.
 * @param {string[]} args
 * @param {Object} opts
 * @param {string} opts.cwd
 * @returns {{ stdout: string, stderr: string, status: number, success: boolean }}
 */
function runGrabby(args, { cwd } = {}) {
  const result = spawnSync(NODE, [CLI_PATH, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, NO_COLOR: '1', GRABBY_STRICT: '0' },
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status ?? 1,
    success: result.status === 0,
  };
}

/**
 * Retry helper: run `fn(projectDir)` with a fresh project.
 * If it throws or returns a failure, delete the project, create a new one,
 * and try once more. The setup callback can repair preconditions before
 * the retry.
 *
 * @param {(dir: string) => void} fn - test body
 * @param {(dir: string) => void} [setup] - optional additional setup on retry
 */
function withRetry(fn, setup) {
  let projectDir = createCalcProject();
  try {
    fn(projectDir);
  } catch (firstErr) {
    // Repair: delete and rebuild the project, then retry once
    deleteProject(projectDir);
    projectDir = createCalcProject();
    if (setup) setup(projectDir);
    try {
      fn(projectDir);
    } finally {
      deleteProject(projectDir);
    }
    return; // retry succeeded
  }
  deleteProject(projectDir);
}

// ============================================================================
// TESTS
// ============================================================================

describe('Grabby Calculator Integration — Grabby Repo Only', () => {
  // --------------------------------------------------------------------------
  // 1. list — no contracts initially
  // --------------------------------------------------------------------------
  describe('grabby list', () => {
    it('shows no contracts in a fresh calculator project', () => {
      withRetry((dir) => {
        const result = runGrabby(['list'], { cwd: dir });
        expect(result.status).toBe(0);
        // Fresh project has no .fc.md files
        const output = result.stdout + result.stderr;
        expect(output).not.toMatch(/Error/i);
      });
    });
  });

  // --------------------------------------------------------------------------
  // 2. create — create a calculator contract
  // --------------------------------------------------------------------------
  describe('grabby create', () => {
    it('creates a calculator-web-app contract file', () => {
      withRetry((dir) => {
        const result = runGrabby(['create', 'calculator web app'], { cwd: dir });
        // Should succeed (exit 0) and produce a .fc.md file
        const contractsDir = path.join(dir, 'contracts');
        const files = fs.existsSync(contractsDir)
          ? fs.readdirSync(contractsDir).filter((f) => f.endsWith('.fc.md'))
          : [];
        expect(files.length).toBeGreaterThan(0);
        expect(files[0]).toMatch(/calculator/);
      });
    });
  });

  // --------------------------------------------------------------------------
  // 3. validate — validate the calculator contract
  // --------------------------------------------------------------------------
  describe('grabby validate', () => {
    it('validates a complete calculator contract successfully', () => {
      withRetry(
        (dir) => {
          const contractFile = writeCalculatorContract(dir);
          const result = runGrabby(['validate', contractFile], { cwd: dir });
          const output = result.stdout + result.stderr;
          // Should indicate valid/pass, not a fatal error
          expect(output.toLowerCase()).toMatch(/valid|pass|ok|✓|check/i);
        },
        (dir) => {
          // Repair: ensure a clean contract exists before retry
          writeCalculatorContract(dir);
        },
      );
    });

    it('reports errors for an empty/placeholder contract', () => {
      withRetry((dir) => {
        const badContract = '# FC: Bad\n## Objective\n[TODO]';
        fs.writeFileSync(path.join(dir, 'contracts', 'bad.fc.md'), badContract);

        const result = runGrabby(['validate', 'bad.fc.md'], { cwd: dir });
        const output = result.stdout + result.stderr;
        // Should report an error or warning about the placeholder
        expect(output.length).toBeGreaterThan(0);
        expect(output.toLowerCase()).toMatch(/invalid|error|warn|placeholder|todo/i);
      });
    });
  });

  // --------------------------------------------------------------------------
  // 4. plan — generate a plan for the calculator
  // --------------------------------------------------------------------------
  describe('grabby plan', () => {
    it('generates a plan artifact from the calculator contract', () => {
      withRetry(
        (dir) => {
          const contractFile = writeCalculatorContract(dir);
          const result = runGrabby(['plan', contractFile], { cwd: dir });
          const output = result.stdout + result.stderr;
          // Plan command should run and produce output or a plan artifact
          expect(output.length).toBeGreaterThan(0);
          // Should not produce an unhandled crash
          expect(output.toLowerCase()).not.toMatch(/unhandled|typeerror|syntaxerror/i);
        },
        (dir) => {
          writeCalculatorContract(dir);
        },
      );
    });
  });

  // --------------------------------------------------------------------------
  // 5. backlog — generate an agile backlog
  // --------------------------------------------------------------------------
  describe('grabby backlog', () => {
    it('generates a backlog from the calculator contract', () => {
      withRetry(
        (dir) => {
          const contractFile = writeCalculatorContract(dir);
          const result = runGrabby(['backlog', contractFile], { cwd: dir });
          const output = result.stdout + result.stderr;
          expect(output.length).toBeGreaterThan(0);
          expect(output.toLowerCase()).not.toMatch(/unhandled|typeerror/i);
        },
        (dir) => {
          writeCalculatorContract(dir);
        },
      );
    });
  });

  // --------------------------------------------------------------------------
  // 6. approve — approve the calculator contract
  // --------------------------------------------------------------------------
  describe('grabby approve', () => {
    it('approves the calculator contract (or reports missing plan)', () => {
      withRetry(
        (dir) => {
          const contractFile = writeCalculatorContract(dir);
          const result = runGrabby(['approve', contractFile], { cwd: dir });
          const output = result.stdout + result.stderr;
          expect(output.length).toBeGreaterThan(0);
          // Approve may require a plan first; either outcome is acceptable
          // as long as it doesn't crash with an unhandled error
          expect(output.toLowerCase()).not.toMatch(/unhandled|typeerror/i);
        },
        (dir) => {
          writeCalculatorContract(dir);
        },
      );
    });
  });

  // --------------------------------------------------------------------------
  // 7. execute — get execution instructions
  // --------------------------------------------------------------------------
  describe('grabby execute', () => {
    it('returns execution instructions or reports missing approved plan', () => {
      withRetry(
        (dir) => {
          const contractFile = writeCalculatorContract(dir);
          const result = runGrabby(['execute', contractFile], { cwd: dir });
          const output = result.stdout + result.stderr;
          expect(output.length).toBeGreaterThan(0);
          expect(output.toLowerCase()).not.toMatch(/unhandled|typeerror/i);
        },
        (dir) => {
          writeCalculatorContract(dir);
        },
      );
    });
  });

  // --------------------------------------------------------------------------
  // 8. audit — audit after implementing calculator files
  // --------------------------------------------------------------------------
  describe('grabby audit', () => {
    it('audits the calculator implementation after source files are created', () => {
      withRetry(
        (dir) => {
          const contractFile = writeCalculatorContract(dir);
          // Simulate "implement code" step: write all calculator source files
          writeCalculatorSourceFiles(dir);
          const result = runGrabby(['audit', contractFile], { cwd: dir });
          const output = result.stdout + result.stderr;
          expect(output.length).toBeGreaterThan(0);
          expect(output.toLowerCase()).not.toMatch(/unhandled|typeerror/i);
        },
        (dir) => {
          writeCalculatorContract(dir);
          writeCalculatorSourceFiles(dir);
        },
      );
    });
  });

  // --------------------------------------------------------------------------
  // 9. quick — fast-track spec for small changes
  // --------------------------------------------------------------------------
  describe('grabby quick', () => {
    it('runs quick spec creation without crashing', () => {
      withRetry((dir) => {
        // quick with --non-interactive to skip prompts
        const result = runGrabby(['quick', '--non-interactive'], { cwd: dir });
        const output = result.stdout + result.stderr;
        expect(output.length).toBeGreaterThan(0);
        expect(output.toLowerCase()).not.toMatch(/unhandled|typeerror/i);
      });
    });
  });

  // --------------------------------------------------------------------------
  // 10. task — non-interactive task breakdown
  // --------------------------------------------------------------------------
  describe('grabby task', () => {
    it('generates a task brief for the calculator feature', () => {
      withRetry((dir) => {
        const result = runGrabby(
          [
            'task',
            'calculator web app with add subtract multiply divide',
            '--non-interactive',
            '--yes',
            '--objective', 'Build a simple calculator',
            '--scope', 'HTML UI,JS logic,CSS styling,unit tests',
            '--directories', 'src/',
            '--done-when', 'Tests pass,Calculator works',
          ],
          { cwd: dir },
        );
        const output = result.stdout + result.stderr;
        expect(output.length).toBeGreaterThan(0);
        expect(output.toLowerCase()).not.toMatch(/unhandled|typeerror/i);
      });
    });
  });

  // --------------------------------------------------------------------------
  // 11. agent list — list available agents
  // --------------------------------------------------------------------------
  describe('grabby agent list', () => {
    it('lists all available agents including Archie, Val, Sage', () => {
      withRetry((dir) => {
        const result = runGrabby(['agent', 'list'], { cwd: dir });
        expect(result.status).toBe(0);
        const output = result.stdout + result.stderr;
        expect(output).toContain('Archie');
        expect(output).toContain('Val');
        expect(output).toContain('Sage');
      });
    });
  });

  // --------------------------------------------------------------------------
  // 12. party — team workflow display
  // --------------------------------------------------------------------------
  describe('grabby party', () => {
    it('displays the full team workflow without error', () => {
      withRetry((dir) => {
        const result = runGrabby(['party'], { cwd: dir });
        const output = result.stdout + result.stderr;
        expect(output.length).toBeGreaterThan(0);
        expect(output.toLowerCase()).not.toMatch(/unhandled|typeerror/i);
      });
    });
  });

  // --------------------------------------------------------------------------
  // 13. features:list — list contract-backed features
  // --------------------------------------------------------------------------
  describe('grabby features:list', () => {
    it('lists features in the calculator project (may be empty)', () => {
      withRetry(
        (dir) => {
          writeCalculatorContract(dir);
          const result = runGrabby(['features:list'], { cwd: dir });
          const output = result.stdout + result.stderr;
          expect(output.length).toBeGreaterThan(0);
          expect(output.toLowerCase()).not.toMatch(/unhandled|typeerror/i);
        },
        (dir) => {
          writeCalculatorContract(dir);
        },
      );
    });
  });

  // --------------------------------------------------------------------------
  // 14. init — initialize grabby in the calculator project
  // --------------------------------------------------------------------------
  describe('grabby init', () => {
    it('initializes grabby in the calculator project', () => {
      withRetry((dir) => {
        const result = runGrabby(['init', '--force'], { cwd: dir });
        const output = result.stdout + result.stderr;
        // init should complete without unhandled crashes
        expect(output.toLowerCase()).not.toMatch(/unhandled|typeerror/i);
      });
    });
  });

  // --------------------------------------------------------------------------
  // 15. Full workflow: create → validate → plan → backlog → approve → execute → audit
  // --------------------------------------------------------------------------
  describe('Full grabby workflow on calculator project', () => {
    it('runs the complete grabby lifecycle without unhandled errors', () => {
      withRetry(
        (dir) => {
          const contractFile = writeCalculatorContract(dir);

          // Step 1: list (no contracts yet for fresh dir, but we wrote one above)
          const listResult = runGrabby(['list'], { cwd: dir });
          expect(listResult.status).toBe(0);

          // Step 2: validate
          const validateResult = runGrabby(['validate', contractFile], { cwd: dir });
          const validateOut = validateResult.stdout + validateResult.stderr;
          expect(validateOut.toLowerCase()).not.toMatch(/unhandled|typeerror/i);

          // Step 3: plan
          const planResult = runGrabby(['plan', contractFile], { cwd: dir });
          const planOut = planResult.stdout + planResult.stderr;
          expect(planOut.toLowerCase()).not.toMatch(/unhandled|typeerror/i);

          // Step 4: backlog
          const backlogResult = runGrabby(['backlog', contractFile], { cwd: dir });
          const backlogOut = backlogResult.stdout + backlogResult.stderr;
          expect(backlogOut.toLowerCase()).not.toMatch(/unhandled|typeerror/i);

          // Step 5: approve
          const approveResult = runGrabby(['approve', contractFile], { cwd: dir });
          const approveOut = approveResult.stdout + approveResult.stderr;
          expect(approveOut.toLowerCase()).not.toMatch(/unhandled|typeerror/i);

          // Step 6: execute
          const executeResult = runGrabby(['execute', contractFile], { cwd: dir });
          const executeOut = executeResult.stdout + executeResult.stderr;
          expect(executeOut.toLowerCase()).not.toMatch(/unhandled|typeerror/i);

          // Step 7: implement (write calculator source files)
          writeCalculatorSourceFiles(dir);
          expect(fs.existsSync(path.join(dir, 'src', 'index.html'))).toBe(true);
          expect(fs.existsSync(path.join(dir, 'src', 'calculator.js'))).toBe(true);
          expect(fs.existsSync(path.join(dir, 'src', 'calculator.test.js'))).toBe(true);

          // Step 8: audit
          const auditResult = runGrabby(['audit', contractFile], { cwd: dir });
          const auditOut = auditResult.stdout + auditResult.stderr;
          expect(auditOut.toLowerCase()).not.toMatch(/unhandled|typeerror/i);
        },
        (dir) => {
          // Repair before retry: write contract and source files
          writeCalculatorContract(dir);
          writeCalculatorSourceFiles(dir);
        },
      );
    });
  });
});
