const colors = require('../lib/colors.cjs');

describe('colors', () => {
  const originalEnv = process.env;
  const originalIsTTY = process.stdout.isTTY;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NO_COLOR;
    delete process.env.TERM;
    // Mock isTTY
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalIsTTY,
      writable: true,
      configurable: true,
    });
  });

  describe('isColorDisabled', () => {
    it('returns false when colors are enabled', () => {
      expect(colors.isColorDisabled()).toBe(false);
    });

    it('returns true when NO_COLOR is set', () => {
      process.env.NO_COLOR = '1';
      expect(colors.isColorDisabled()).toBe(true);
    });

    it('returns true when NO_COLOR is empty string', () => {
      process.env.NO_COLOR = '';
      expect(colors.isColorDisabled()).toBe(true);
    });

    it('returns true when TERM is dumb', () => {
      process.env.TERM = 'dumb';
      expect(colors.isColorDisabled()).toBe(true);
    });

    it('returns true when not a TTY', () => {
      Object.defineProperty(process.stdout, 'isTTY', { value: false });
      expect(colors.isColorDisabled()).toBe(true);
    });
  });

  describe('colorize', () => {
    it('wraps text in ANSI codes', () => {
      expect(colors.colorize('test', '31')).toBe('\x1b[31mtest\x1b[0m');
    });

    it('returns plain text when colors disabled', () => {
      process.env.NO_COLOR = '1';
      expect(colors.colorize('test', '31')).toBe('test');
    });
  });

  describe('semantic colors', () => {
    it('success is green', () => {
      expect(colors.success('ok')).toBe('\x1b[32mok\x1b[0m');
    });

    it('error is red', () => {
      expect(colors.error('fail')).toBe('\x1b[31mfail\x1b[0m');
    });

    it('warn is yellow', () => {
      expect(colors.warn('caution')).toBe('\x1b[33mcaution\x1b[0m');
    });

    it('info is cyan', () => {
      expect(colors.info('note')).toBe('\x1b[36mnote\x1b[0m');
    });

    it('dim is faint', () => {
      expect(colors.dim('quiet')).toBe('\x1b[2mquiet\x1b[0m');
    });
  });

  describe('formatting', () => {
    it('bold works', () => {
      expect(colors.bold('strong')).toBe('\x1b[1mstrong\x1b[0m');
    });

    it('underline works', () => {
      expect(colors.underline('link')).toBe('\x1b[4mlink\x1b[0m');
    });
  });

  describe('combined styles', () => {
    it('boldCyan combines bold and cyan', () => {
      expect(colors.boldCyan('header')).toBe('\x1b[1m\x1b[36mheader\x1b[0m');
    });

    it('boldRed combines bold and red', () => {
      expect(colors.boldRed('error')).toBe('\x1b[1m\x1b[31merror\x1b[0m');
    });
  });

  describe('raw colors', () => {
    it('all raw colors work', () => {
      expect(colors.red('r')).toContain('31m');
      expect(colors.green('g')).toContain('32m');
      expect(colors.yellow('y')).toContain('33m');
      expect(colors.blue('b')).toContain('34m');
      expect(colors.magenta('m')).toContain('35m');
      expect(colors.cyan('c')).toContain('36m');
      expect(colors.gray('g')).toContain('90m');
    });
  });

  describe('symbols', () => {
    it('check is green checkmark', () => {
      expect(colors.symbols.check()).toBe('\x1b[32m✓\x1b[0m');
    });

    it('cross is red x', () => {
      expect(colors.symbols.cross()).toBe('\x1b[31m✗\x1b[0m');
    });

    it('symbols work without colors', () => {
      process.env.NO_COLOR = '1';
      expect(colors.symbols.check()).toBe('✓');
      expect(colors.symbols.cross()).toBe('✗');
    });
  });

  describe('stripColors', () => {
    it('removes ANSI codes', () => {
      const colored = colors.boldRed('error');
      expect(colors.stripColors(colored)).toBe('error');
    });

    it('handles plain text', () => {
      expect(colors.stripColors('plain')).toBe('plain');
    });

    it('handles mixed content', () => {
      const text = `${colors.success('ok')} and ${colors.error('fail')}`;
      expect(colors.stripColors(text)).toBe('ok and fail');
    });
  });

  describe('getRawCodes', () => {
    it('returns codes when colors enabled', () => {
      const raw = colors.getRawCodes();
      expect(raw.red).toBe('\x1b[31m');
      expect(raw.reset).toBe('\x1b[0m');
    });

    it('returns empty strings when colors disabled', () => {
      process.env.NO_COLOR = '1';
      const raw = colors.getRawCodes();
      expect(raw.red).toBe('');
      expect(raw.reset).toBe('');
    });
  });

  describe('codes object', () => {
    it('has all expected codes', () => {
      expect(colors.codes.reset).toBeDefined();
      expect(colors.codes.bold).toBeDefined();
      expect(colors.codes.red).toBeDefined();
      expect(colors.codes.green).toBeDefined();
    });
  });
});
