/**
 * Tests for lib/progress.cjs
 */

const {
  createSpinner,
  createProgressBar,
  createMultiBar,
  withSpinner,
  withProgress,
  createWorkflowTracker,
  presets,
  symbols,
  colors,
} = require('../lib/progress.cjs');

// Mock stream for testing
const createMockStream = () => ({
  isTTY: true,
  written: [],
  write(data) { this.written.push(data); },
  clearLine() {},
  cursorTo() {},
});

describe('progress.cjs', () => {
  describe('createSpinner', () => {
    it('creates a spinner with default options', () => {
      const spinner = createSpinner('Loading...');

      expect(spinner).toHaveProperty('start');
      expect(spinner).toHaveProperty('stop');
      expect(spinner).toHaveProperty('succeed');
      expect(spinner).toHaveProperty('fail');
      expect(spinner).toHaveProperty('warn');
      expect(spinner).toHaveProperty('info');
      expect(spinner).toHaveProperty('text');
      expect(spinner).toHaveProperty('isSpinning');
    });

    it('starts and stops without error', () => {
      const mockStream = createMockStream();
      const spinner = createSpinner('Test', { stream: mockStream });

      spinner.start();
      expect(spinner.isSpinning()).toBe(true);

      spinner.stop();
      expect(spinner.isSpinning()).toBe(false);
    });

    it('updates text', () => {
      const mockStream = createMockStream();
      const spinner = createSpinner('Initial', { stream: mockStream });

      spinner.start();
      spinner.text('Updated');
      expect(spinner._text).toBe('Updated');
      spinner.stop();
    });

    it('supports success state', () => {
      const mockStream = createMockStream();
      const spinner = createSpinner('Test', { stream: mockStream });

      spinner.start();
      spinner.succeed('Success');

      expect(spinner.isSpinning()).toBe(false);
      expect(mockStream.written.some(w => w.includes('Success'))).toBe(true);
    });

    it('supports fail state', () => {
      const mockStream = createMockStream();
      const spinner = createSpinner('Test', { stream: mockStream });

      spinner.start();
      spinner.fail('Failed');

      expect(spinner.isSpinning()).toBe(false);
      expect(mockStream.written.some(w => w.includes('Failed'))).toBe(true);
    });

    it('supports warn state', () => {
      const mockStream = createMockStream();
      const spinner = createSpinner('Test', { stream: mockStream });

      spinner.start();
      spinner.warn('Warning');

      expect(spinner.isSpinning()).toBe(false);
      expect(mockStream.written.some(w => w.includes('Warning'))).toBe(true);
    });

    it('supports info state', () => {
      const mockStream = createMockStream();
      const spinner = createSpinner('Test', { stream: mockStream });

      spinner.start();
      spinner.info('Info');

      expect(spinner.isSpinning()).toBe(false);
      expect(mockStream.written.some(w => w.includes('Info'))).toBe(true);
    });

    it('handles non-TTY streams', () => {
      const mockStream = { ...createMockStream(), isTTY: false };
      const spinner = createSpinner('Test', { stream: mockStream });

      spinner.start();
      // Non-TTY just writes text once
      expect(mockStream.written.some(w => w.includes('Test'))).toBe(true);
    });
  });

  describe('createProgressBar', () => {
    it('creates a progress bar with default options', () => {
      const bar = createProgressBar();

      expect(bar).toHaveProperty('start');
      expect(bar).toHaveProperty('update');
      expect(bar).toHaveProperty('increment');
      expect(bar).toHaveProperty('stop');
    });

    it('starts and updates progress', () => {
      const bar = createProgressBar({ clearOnComplete: true });

      bar.start(100, 0, { task: 'Testing' });
      bar.update(50, { task: 'Halfway' });
      bar.increment(25, { task: 'Almost' });
      bar.stop();

      // Should not throw
      expect(true).toBe(true);
    });

    it('accepts custom format', () => {
      const bar = createProgressBar({
        format: '{bar} | {percentage}%',
      });

      bar.start(10, 0);
      bar.update(5);
      bar.stop();

      expect(true).toBe(true);
    });
  });

  describe('createMultiBar', () => {
    it('creates a multi-bar container', () => {
      const multiBar = createMultiBar();

      expect(multiBar).toHaveProperty('create');
      expect(multiBar).toHaveProperty('update');
      expect(multiBar).toHaveProperty('increment');
      expect(multiBar).toHaveProperty('remove');
      expect(multiBar).toHaveProperty('stop');
    });

    it('manages multiple progress bars', () => {
      const multiBar = createMultiBar();

      const { id: id1 } = multiBar.create(100, 0, { task: 'Task 1' });
      const { id: id2 } = multiBar.create(50, 0, { task: 'Task 2' });

      multiBar.update(id1, 25, { task: 'Task 1 progress' });
      multiBar.increment(id2, 10, { task: 'Task 2 progress' });

      multiBar.remove(id1);
      multiBar.stop();

      expect(true).toBe(true);
    });
  });

  describe('withSpinner', () => {
    it('runs a task with spinner and succeeds', async () => {
      const mockStream = createMockStream();
      const result = await withSpinner('Test task', async () => {
        return 'success';
      }, { stream: mockStream });

      expect(result).toBe('success');
    });

    it('runs a task with spinner and fails', async () => {
      const mockStream = createMockStream();

      await expect(
        withSpinner('Failing task', async () => {
          throw new Error('Intentional failure');
        }, { stream: mockStream })
      ).rejects.toThrow('Intentional failure');
    });

    it('allows updating spinner text during task', async () => {
      const mockStream = createMockStream();
      const updates = [];

      await withSpinner('Initial', async (updateText) => {
        updateText('Step 1');
        updates.push('Step 1');
        updateText('Step 2');
        updates.push('Step 2');
        return true;
      }, { stream: mockStream });

      expect(updates).toEqual(['Step 1', 'Step 2']);
    });
  });

  describe('withProgress', () => {
    it('runs multiple tasks with progress bar', async () => {
      const tasks = [
        { name: 'Task 1', task: async () => 'result1' },
        { name: 'Task 2', task: async () => 'result2' },
        { name: 'Task 3', task: async () => 'result3' },
      ];

      const results = await withProgress(tasks);

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ name: 'Task 1', success: true, result: 'result1' });
      expect(results[1]).toEqual({ name: 'Task 2', success: true, result: 'result2' });
      expect(results[2]).toEqual({ name: 'Task 3', success: true, result: 'result3' });
    });

    it('continues on error by default', async () => {
      const tasks = [
        { name: 'Task 1', task: async () => 'result1' },
        { name: 'Task 2', task: async () => { throw new Error('fail'); } },
        { name: 'Task 3', task: async () => 'result3' },
      ];

      const results = await withProgress(tasks);

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error.message).toBe('fail');
      expect(results[2].success).toBe(true);
    });

    it('stops on error when configured', async () => {
      const tasks = [
        { name: 'Task 1', task: async () => 'result1' },
        { name: 'Task 2', task: async () => { throw new Error('stop'); } },
        { name: 'Task 3', task: async () => 'result3' },
      ];

      await expect(
        withProgress(tasks, { stopOnError: true })
      ).rejects.toThrow('stop');
    });
  });

  describe('createWorkflowTracker', () => {
    it('creates a workflow tracker', () => {
      const tracker = createWorkflowTracker(['Step 1', 'Step 2', 'Step 3'], { silent: true });

      expect(tracker).toHaveProperty('start');
      expect(tracker).toHaveProperty('next');
      expect(tracker).toHaveProperty('fail');
      expect(tracker).toHaveProperty('complete');
      expect(tracker).toHaveProperty('getStatus');
      expect(tracker).toHaveProperty('isComplete');
      expect(tracker).toHaveProperty('hasFailed');
    });

    it('tracks workflow progress', () => {
      const tracker = createWorkflowTracker(['A', 'B', 'C'], { silent: true });

      tracker.start();

      let status = tracker.getStatus();
      expect(status.current).toBe(0);
      expect(status.total).toBe(3);
      expect(status.percentage).toBe(0);

      tracker.next();
      status = tracker.getStatus();
      expect(status.current).toBe(1);
      expect(status.completed).toContain(0);

      tracker.next();
      tracker.complete();

      expect(tracker.isComplete()).toBe(true);
      expect(tracker.hasFailed()).toBe(false);
    });

    it('tracks failures', () => {
      const tracker = createWorkflowTracker(['A', 'B', 'C'], { silent: true });

      tracker.start();
      tracker.next();
      tracker.fail('Error occurred');

      expect(tracker.hasFailed()).toBe(true);
      const status = tracker.getStatus();
      expect(status.failed).toContain(1);
    });
  });

  describe('presets', () => {
    it('exports progress bar presets', () => {
      expect(presets).toHaveProperty('classic');
      expect(presets).toHaveProperty('modern');
      expect(presets).toHaveProperty('legacy');
      expect(presets).toHaveProperty('rect');
    });
  });

  describe('symbols', () => {
    it('exports status symbols', () => {
      expect(symbols).toHaveProperty('success');
      expect(symbols).toHaveProperty('error');
      expect(symbols).toHaveProperty('warning');
      expect(symbols).toHaveProperty('info');
    });
  });

  describe('colors', () => {
    it('exports ANSI color codes', () => {
      expect(colors).toHaveProperty('cyan');
      expect(colors).toHaveProperty('green');
      expect(colors).toHaveProperty('red');
      expect(colors).toHaveProperty('reset');
    });
  });
});
