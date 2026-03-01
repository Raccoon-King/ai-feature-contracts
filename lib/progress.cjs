/**
 * Progress tracking utilities for Grabby CLI
 * Uses cli-progress for progress bars and a custom spinner implementation
 */

const cliProgress = require('cli-progress');

// Inline spinner frames (no external dependency)
const spinnerFrames = {
  dots: { interval: 80, frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] },
  line: { interval: 130, frames: ['-', '\\', '|', '/'] },
  simple: { interval: 100, frames: ['.  ', '.. ', '...', '   '] },
};

// Spinner symbols for different states
const symbols = {
  success: process.platform === 'win32' ? '+' : '\u2714',
  error: process.platform === 'win32' ? 'x' : '\u2716',
  warning: process.platform === 'win32' ? '!' : '\u26A0',
  info: process.platform === 'win32' ? 'i' : '\u2139',
};

// Colors
const colors = {
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
};

/**
 * Create a spinner for indeterminate progress
 */
function createSpinner(text, options = {}) {
  const spinnerType = spinnerFrames[options.spinner || 'dots'] || spinnerFrames.dots;
  const color = colors[options.color || 'cyan'];

  let interval = null;
  let frameIndex = 0;
  let currentText = text;
  let spinning = false;
  let stream = options.stream || process.stderr;

  const clearLine = () => {
    if (stream.isTTY) {
      stream.clearLine && stream.clearLine(0);
      stream.cursorTo && stream.cursorTo(0);
    }
  };

  const render = () => {
    if (!spinning) return;
    clearLine();
    const frame = spinnerType.frames[frameIndex];
    stream.write(`${color}${frame}${colors.reset} ${currentText}`);
    frameIndex = (frameIndex + 1) % spinnerType.frames.length;
  };

  const stopSpinner = () => {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    spinning = false;
    clearLine();
  };

  const spinner = {
    start: (newText) => {
      if (newText) currentText = newText;
      spinning = true;
      frameIndex = 0;
      if (stream.isTTY) {
        render();
        interval = setInterval(render, spinnerType.interval);
      } else {
        stream.write(`  ${currentText}\n`);
      }
      return spinner;
    },
    stop: () => { stopSpinner(); return spinner; },
    succeed: (newText) => {
      stopSpinner();
      stream.write(`${colors.green}${symbols.success}${colors.reset} ${newText || currentText}\n`);
      return spinner;
    },
    fail: (newText) => {
      stopSpinner();
      stream.write(`${colors.red}${symbols.error}${colors.reset} ${newText || currentText}\n`);
      return spinner;
    },
    warn: (newText) => {
      stopSpinner();
      stream.write(`${colors.yellow}${symbols.warning}${colors.reset} ${newText || currentText}\n`);
      return spinner;
    },
    info: (newText) => {
      stopSpinner();
      stream.write(`${colors.blue}${symbols.info}${colors.reset} ${newText || currentText}\n`);
      return spinner;
    },
    text: (newText) => { currentText = newText; return spinner; },
    isSpinning: () => spinning,
    get _text() { return currentText; },
  };

  return spinner;
}

/**
 * Create a progress bar for determinate progress
 */
function createProgressBar(options = {}) {
  const format = options.format || '{bar} {percentage}% | {value}/{total} | {task}';
  const bar = new cliProgress.SingleBar({
    format,
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
    clearOnComplete: options.clearOnComplete !== false,
    stopOnComplete: true,
    ...options,
  }, options.preset || cliProgress.Presets.shades_classic);

  return {
    start: (total, startValue = 0, payload = {}) => { bar.start(total, startValue, payload); return bar; },
    update: (value, payload = {}) => { bar.update(value, payload); return bar; },
    increment: (delta = 1, payload = {}) => { bar.increment(delta, payload); return bar; },
    stop: () => { bar.stop(); return bar; },
    _bar: bar,
  };
}

/**
 * Create a multi-progress bar
 */
function createMultiBar(options = {}) {
  const multiBar = new cliProgress.MultiBar({
    format: options.format || '{bar} {percentage}% | {task}',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
    ...options,
  }, options.preset || cliProgress.Presets.shades_classic);

  const bars = new Map();
  return {
    create: (total, startValue = 0, payload = {}) => {
      const bar = multiBar.create(total, startValue, payload);
      const id = Symbol('bar');
      bars.set(id, bar);
      return { id, bar };
    },
    update: (id, value, payload = {}) => { const bar = bars.get(id); if (bar) bar.update(value, payload); },
    increment: (id, delta = 1, payload = {}) => { const bar = bars.get(id); if (bar) bar.increment(delta, payload); },
    remove: (id) => { const bar = bars.get(id); if (bar) { multiBar.remove(bar); bars.delete(id); } },
    stop: () => { multiBar.stop(); bars.clear(); },
    _multiBar: multiBar,
  };
}

/**
 * Run a task with spinner feedback
 */
async function withSpinner(text, task, options = {}) {
  const spinner = createSpinner(text, options);
  spinner.start();
  try {
    const result = await task((newText) => spinner.text(newText));
    spinner.succeed(options.successText || text);
    return result;
  } catch (error) {
    spinner.fail(options.failText || `${text} - failed`);
    throw error;
  }
}

/**
 * Run multiple tasks with progress tracking
 */
async function withProgress(tasks, options = {}) {
  const bar = createProgressBar({ format: options.format || '{bar} {percentage}% | {value}/{total} | {task}', ...options });
  bar.start(tasks.length, 0, { task: 'Starting...' });
  const results = [];

  for (let i = 0; i < tasks.length; i++) {
    const { name, task } = tasks[i];
    bar.update(i, { task: name });
    try {
      const result = await task();
      results.push({ name, success: true, result });
    } catch (error) {
      results.push({ name, success: false, error });
      if (options.stopOnError) { bar.stop(); throw error; }
    }
  }
  bar.update(tasks.length, { task: 'Complete' });
  bar.stop();
  return results;
}

/**
 * Create a workflow progress tracker
 */
function createWorkflowTracker(steps, options = {}) {
  let currentStep = 0;
  let spinner = null;
  const completed = new Set();
  const failed = new Set();

  const printStatus = () => {
    if (options.silent) return;
    console.log('\n' + '='.repeat(50));
    console.log('WORKFLOW PROGRESS');
    console.log('='.repeat(50));
    steps.forEach((step, i) => {
      let icon = ' ', col = colors.dim;
      if (completed.has(i)) { icon = '+'; col = colors.green; }
      else if (failed.has(i)) { icon = 'x'; col = colors.red; }
      else if (i === currentStep) { icon = '>'; col = colors.cyan; }
      console.log(`${col}[${icon}] ${i + 1}. ${step}${colors.reset}`);
    });
    console.log('='.repeat(50) + '\n');
  };

  return {
    start: () => { printStatus(); spinner = createSpinner(steps[0], { color: 'cyan' }); spinner.start(); },
    next: (customText) => {
      if (spinner) spinner.succeed(customText || steps[currentStep]);
      completed.add(currentStep);
      currentStep++;
      if (currentStep < steps.length) { spinner = createSpinner(steps[currentStep], { color: 'cyan' }); spinner.start(); }
    },
    fail: (error) => { if (spinner) spinner.fail(`${steps[currentStep]} - ${error || 'failed'}`); failed.add(currentStep); },
    complete: () => { if (spinner && spinner.isSpinning()) spinner.succeed(steps[currentStep]); completed.add(currentStep); printStatus(); },
    getStatus: () => ({ current: currentStep, total: steps.length, completed: Array.from(completed), failed: Array.from(failed), percentage: Math.round((completed.size / steps.length) * 100) }),
    isComplete: () => completed.size === steps.length,
    hasFailed: () => failed.size > 0,
  };
}

const presets = {
  classic: cliProgress.Presets.shades_classic,
  modern: cliProgress.Presets.shades_grey,
  legacy: cliProgress.Presets.legacy,
  rect: cliProgress.Presets.rect,
};

module.exports = { createSpinner, createProgressBar, createMultiBar, withSpinner, withProgress, createWorkflowTracker, presets, symbols, colors, spinnerFrames };
