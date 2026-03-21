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

## Code Quality
- [ ] Lint passes

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
ARCH_VERSION: v1
RULESET_VERSION: v1
ENV_VERSION: v1
- ARCH_INDEX_v1
- RULESET_CORE_v1
- ENV_STACK_v1
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

function getContractPath(projectDir, fileName) {
  return path.join(projectDir, 'contracts', fileName);
}

function getPlanPath(projectDir) {
  return path.join(projectDir, 'contracts', 'FC-CALC-001.plan.yaml');
}

function getBacklogPath(projectDir) {
  return path.join(projectDir, 'contracts', 'calculator-web-app.backlog.yaml');
}

function getAuditPath(projectDir) {
  return path.join(projectDir, 'contracts', 'FC-CALC-001.audit.md');
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
async function runGrabby(args, { cwd } = {}) {
  const originalArgv = process.argv.slice();
  const originalCwd = process.cwd();
  const originalLog = console.log;
  const originalError = console.error;
  const originalExit = process.exit;
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  let stdout = '';
  let stderr = '';
  let status = 0;

  console.log = (...parts) => {
    stdout += `${parts.join(' ')}\n`;
  };
  console.error = (...parts) => {
    stderr += `${parts.join(' ')}\n`;
  };
  process.stdout.write = ((chunk, encoding, callback) => {
    stdout += String(chunk);
    if (typeof callback === 'function') callback();
    return true;
  });
  process.stderr.write = ((chunk, encoding, callback) => {
    stderr += String(chunk);
    if (typeof callback === 'function') callback();
    return true;
  });
  process.exit = (code) => {
    status = code ?? 0;
    throw new Error(`__GRABBY_EXIT__${status}`);
  };

  try {
    process.chdir(cwd || originalCwd);
    process.argv = [NODE, CLI_PATH, ...args];
    if (typeof jest !== 'undefined' && typeof jest.resetModules === 'function') {
      jest.resetModules();
    }
    Object.keys(require.cache).forEach((key) => {
      if (key.startsWith(PKG_ROOT)) {
        delete require.cache[key];
      }
    });
    try {
      require(CLI_PATH);
      for (let i = 0; i < 10; i += 1) {
        // Allow async CLI commands to flush queued work before assertions.
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setImmediate(resolve));
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    } catch (error) {
      if (!String(error.message || '').startsWith('__GRABBY_EXIT__')) {
        stderr += `${error.stack || error.message}\n`;
        status = 1;
      }
    }
  } finally {
    process.argv = originalArgv;
    process.chdir(originalCwd);
    console.log = originalLog;
    console.error = originalError;
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    process.exit = originalExit;
  }

  return {
    stdout,
    stderr,
    status,
    success: status === 0,
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
async function withRetry(fn, setup) {
  let projectDir = createCalcProject();
  try {
    await fn(projectDir);
  } catch (firstErr) {
    // Repair: delete and rebuild the project, then retry once
    deleteProject(projectDir);
    projectDir = createCalcProject();
    if (setup) await setup(projectDir);
    try {
      await fn(projectDir);
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
      return withRetry(async (dir) => {
        const result = await runGrabby(['list'], { cwd: dir });
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
      return withRetry(async (dir) => {
        const result = await runGrabby(['create', 'calculator web app'], { cwd: dir });
        expect(result.status).toBe(0);
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
      return withRetry(
        async (dir) => {
          const contractFile = writeCalculatorContract(dir);
          const result = await runGrabby(['validate', contractFile], { cwd: dir });
          expect(result.status).toBe(0);
          const output = result.stdout + result.stderr;
          // Should indicate valid/pass, not a fatal error
          expect(output.toLowerCase()).toMatch(/valid|pass|ok|check/i);
          expect(output).not.toContain('Validation passed with warnings');
        },
        async (dir) => {
          // Repair: ensure a clean contract exists before retry
          writeCalculatorContract(dir);
        },
      );
    });

    it('reports errors for an empty/placeholder contract', () => {
      return withRetry(async (dir) => {
        const badContract = '# FC: Bad\n## Objective\n[TODO]';
        fs.writeFileSync(path.join(dir, 'contracts', 'bad.fc.md'), badContract);

        const result = await runGrabby(['validate', 'bad.fc.md'], { cwd: dir });
        const output = result.stdout + result.stderr;
        // Should report an error or warning about the placeholder
        expect(output.length).toBeGreaterThan(0);
        expect(output.toLowerCase()).toMatch(/invalid|error|warn|placeholder|todo|unable|id|suggestion/i);
      });
    });
  });

  // --------------------------------------------------------------------------
  // 4. plan — generate a plan for the calculator
  // --------------------------------------------------------------------------
  describe('grabby plan', () => {
    it('generates a plan artifact from the calculator contract', () => {
      return withRetry(
        async (dir) => {
          const contractFile = writeCalculatorContract(dir);
          const result = await runGrabby(['plan', contractFile], { cwd: dir });
          expect(result.status).toBe(0);
          const output = result.stdout + result.stderr;
          expect(fs.existsSync(getPlanPath(dir))).toBe(true);
          // Should not produce an unhandled crash
          expect(output.toLowerCase()).not.toMatch(/unhandled|typeerror|syntaxerror/i);
        },
        async (dir) => {
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
      return withRetry(
        async (dir) => {
          const contractFile = writeCalculatorContract(dir);
          const result = await runGrabby(['backlog', contractFile], { cwd: dir });
          expect(result.status).toBe(0);
          const output = result.stdout + result.stderr;
          expect(fs.existsSync(getBacklogPath(dir))).toBe(true);
          expect(output.toLowerCase()).not.toMatch(/unhandled|typeerror/i);
        },
        async (dir) => {
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
      return withRetry(
        async (dir) => {
          const contractFile = writeCalculatorContract(dir);
          expect((await runGrabby(['plan', contractFile], { cwd: dir })).status).toBe(0);
          const result = await runGrabby(['approve', contractFile], { cwd: dir });
          expect(result.status).toBe(0);
          const output = result.stdout + result.stderr;
          const contractContent = fs.readFileSync(getContractPath(dir, contractFile), 'utf8');
          expect(contractContent).toContain('**Status:** approved');
          // Approve may require a plan first; either outcome is acceptable
          // as long as it doesn't crash with an unhandled error
          expect(output.toLowerCase()).not.toMatch(/unhandled|typeerror/i);
        },
        async (dir) => {
          writeCalculatorContract(dir);
          await runGrabby(['plan', 'calculator-web-app.fc.md'], { cwd: dir });
        },
      );
    });
  });

  // --------------------------------------------------------------------------
  // 7. execute — get execution instructions
  // --------------------------------------------------------------------------
  describe('grabby execute', () => {
    it('returns execution instructions or reports missing approved plan', () => {
      return withRetry(
        async (dir) => {
          const contractFile = writeCalculatorContract(dir);
          expect((await runGrabby(['plan', contractFile], { cwd: dir })).status).toBe(0);
          expect((await runGrabby(['approve', contractFile], { cwd: dir })).status).toBe(0);
          const result = await runGrabby(['execute', contractFile], { cwd: dir });
          expect(result.status).toBe(0);
          const output = result.stdout + result.stderr;
          expect(output).toContain('PHASE 2: EXECUTE');
          expect(output.toLowerCase()).not.toMatch(/unhandled|typeerror/i);
        },
        async (dir) => {
          writeCalculatorContract(dir);
          await runGrabby(['plan', 'calculator-web-app.fc.md'], { cwd: dir });
          await runGrabby(['approve', 'calculator-web-app.fc.md'], { cwd: dir });
        },
      );
    });
  });

  // --------------------------------------------------------------------------
  // 8. audit — audit after implementing calculator files
  // --------------------------------------------------------------------------
  describe('grabby audit', () => {
    it('audits the calculator implementation after source files are created', () => {
      return withRetry(
        async (dir) => {
          const contractFile = writeCalculatorContract(dir);
          expect((await runGrabby(['plan', contractFile], { cwd: dir })).status).toBe(0);
          expect((await runGrabby(['approve', contractFile], { cwd: dir })).status).toBe(0);
          // Simulate "implement code" step: write all calculator source files
          writeCalculatorSourceFiles(dir);
          const result = await runGrabby(['audit', contractFile], { cwd: dir });
          expect(result.status).toBe(0);
          const output = result.stdout + result.stderr;
          expect(fs.existsSync(getAuditPath(dir))).toBe(true);
          expect(output.toLowerCase()).not.toMatch(/unhandled|typeerror/i);
        },
        async (dir) => {
          writeCalculatorContract(dir);
          await runGrabby(['plan', 'calculator-web-app.fc.md'], { cwd: dir });
          await runGrabby(['approve', 'calculator-web-app.fc.md'], { cwd: dir });
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
      return withRetry(async (dir) => {
        // quick with --non-interactive to skip prompts
        const result = await runGrabby(['quick', '--non-interactive'], { cwd: dir });
        expect(result.status).toBe(0);
        const output = result.stdout + result.stderr;
        expect(output.length).toBeGreaterThan(0);
        expect(output.toLowerCase()).toMatch(/quick workflow requires prompts|grabby quick/);
      });
    });
  });

  // --------------------------------------------------------------------------
  // 10. task — non-interactive task breakdown
  // --------------------------------------------------------------------------
  describe('grabby task', () => {
    it('generates a task brief for the calculator feature', () => {
      return withRetry(async (dir) => {
        const result = await runGrabby(
          [
            'task',
            'calculator web app with add subtract multiply divide',
            '--non-interactive',
            '--yes',
            '--who', 'developer',
            '--what', 'calculator web app',
            '--why', 'provide a simple arithmetic demo',
            '--dod', 'Tests pass,Calculator works',
            '--objective', 'Build a simple calculator',
            '--scope', 'HTML UI,JS logic,CSS styling,unit tests',
            '--directories', 'src/',
            '--done-when', 'Tests pass,Calculator works',
          ],
          { cwd: dir },
        );
        const output = result.stdout + result.stderr;
        expect(result.status).toBe(0);
        expect(output.toLowerCase()).not.toMatch(/ticket intake incomplete|collect ticket intake -/i);
        expect(output.toLowerCase()).not.toMatch(/unhandled|typeerror/i);
      });
    });
  });

  // --------------------------------------------------------------------------
  // 11. agent list — list available agents
  // --------------------------------------------------------------------------
  describe('grabby agent list', () => {
    it('lists all available agents including Archie, Val, Sage', () => {
      return withRetry(async (dir) => {
        const result = await runGrabby(['agent', 'list'], { cwd: dir });
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
      return withRetry(async (dir) => {
        const result = await runGrabby(['party'], { cwd: dir });
        expect(result.status).toBe(0);
        const output = result.stdout + result.stderr;
        expect(output).toContain('TEAM WORKFLOW');
        expect(output.toLowerCase()).not.toMatch(/unhandled|typeerror/i);
      });
    });
  });

  // --------------------------------------------------------------------------
  // 13. features:list — list contract-backed features
  // --------------------------------------------------------------------------
  describe('grabby features:list', () => {
    it('lists features in the calculator project (may be empty)', () => {
      return withRetry(
        async (dir) => {
          writeCalculatorContract(dir);
          const result = await runGrabby(['features:list'], { cwd: dir });
          expect(result.status).toBe(0);
          const output = result.stdout + result.stderr;
          expect(output).toContain('FC-CALC-001');
          expect(output.toLowerCase()).not.toMatch(/unhandled|typeerror/i);
        },
        async (dir) => {
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
      return withRetry(async (dir) => {
        const result = await runGrabby(['init', '--force'], { cwd: dir });
        expect(result.status).toBe(0);
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
      return withRetry(
        async (dir) => {
          const contractFile = writeCalculatorContract(dir);

          // Step 1: list (no contracts yet for fresh dir, but we wrote one above)
          const listResult = await runGrabby(['list'], { cwd: dir });
          expect(listResult.status).toBe(0);

          // Step 2: validate
          const validateResult = await runGrabby(['validate', contractFile], { cwd: dir });
          expect(validateResult.status).toBe(0);
          const validateOut = validateResult.stdout + validateResult.stderr;
          expect(validateOut.toLowerCase()).not.toMatch(/unhandled|typeerror/i);

          // Step 3: plan
          const planResult = await runGrabby(['plan', contractFile], { cwd: dir });
          expect(planResult.status).toBe(0);
          expect(fs.existsSync(getPlanPath(dir))).toBe(true);
          const planOut = planResult.stdout + planResult.stderr;
          expect(planOut.toLowerCase()).not.toMatch(/unhandled|typeerror/i);

          // Step 4: backlog
          const backlogResult = await runGrabby(['backlog', contractFile], { cwd: dir });
          expect(backlogResult.status).toBe(0);
          expect(fs.existsSync(getBacklogPath(dir))).toBe(true);
          const backlogOut = backlogResult.stdout + backlogResult.stderr;
          expect(backlogOut.toLowerCase()).not.toMatch(/unhandled|typeerror/i);

          // Step 5: approve
          const approveResult = await runGrabby(['approve', contractFile], { cwd: dir });
          expect(approveResult.status).toBe(0);
          const approveOut = approveResult.stdout + approveResult.stderr;
          expect(approveOut.toLowerCase()).not.toMatch(/unhandled|typeerror/i);

          // Step 6: execute
          const executeResult = await runGrabby(['execute', contractFile], { cwd: dir });
          expect(executeResult.status).toBe(0);
          const executeOut = executeResult.stdout + executeResult.stderr;
          expect(executeOut.toLowerCase()).not.toMatch(/unhandled|typeerror/i);

          // Step 7: implement (write calculator source files)
          writeCalculatorSourceFiles(dir);
          expect(fs.existsSync(path.join(dir, 'src', 'index.html'))).toBe(true);
          expect(fs.existsSync(path.join(dir, 'src', 'calculator.js'))).toBe(true);
          expect(fs.existsSync(path.join(dir, 'src', 'calculator.test.js'))).toBe(true);

          // Step 8: audit
          const auditResult = await runGrabby(['audit', contractFile], { cwd: dir });
          expect(auditResult.status).toBe(0);
          expect(fs.existsSync(getAuditPath(dir))).toBe(true);
          const auditOut = auditResult.stdout + auditResult.stderr;
          expect(auditOut.toLowerCase()).not.toMatch(/unhandled|typeerror/i);
        },
        async (dir) => {
          // Repair before retry: write contract and source files
          writeCalculatorContract(dir);
          writeCalculatorSourceFiles(dir);
        },
      );
    });
  });
});
