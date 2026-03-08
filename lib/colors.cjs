/**
 * Terminal Color Utilities
 * Consolidated ANSI color codes with NO_COLOR support.
 * @module colors
 */

/**
 * Check if colors should be disabled.
 * Respects NO_COLOR environment variable (https://no-color.org/)
 * @returns {boolean} True if colors should be disabled
 */
function isColorDisabled() {
  return (
    process.env.NO_COLOR !== undefined ||
    process.env.TERM === 'dumb' ||
    !process.stdout.isTTY
  );
}

/**
 * Wrap text in ANSI escape codes if colors are enabled.
 * @param {string} text - Text to colorize
 * @param {string} code - ANSI code (e.g., '31' for red)
 * @returns {string} Colorized text or plain text if colors disabled
 */
function colorize(text, code) {
  if (isColorDisabled()) {
    return text;
  }
  return `\x1b[${code}m${text}\x1b[0m`;
}

/**
 * Wrap text in multiple ANSI escape codes.
 * @param {string} text - Text to colorize
 * @param {...string} codes - ANSI codes to apply
 * @returns {string} Colorized text
 */
function colorizeMulti(text, ...codes) {
  if (isColorDisabled()) {
    return text;
  }
  const prefix = codes.map(c => `\x1b[${c}m`).join('');
  return `${prefix}${text}\x1b[0m`;
}

// Semantic colors
const success = (text) => colorize(text, '32');  // Green
const error = (text) => colorize(text, '31');    // Red
const warn = (text) => colorize(text, '33');     // Yellow
const info = (text) => colorize(text, '36');     // Cyan
const dim = (text) => colorize(text, '2');       // Dim/faint
const muted = (text) => colorize(text, '90');    // Gray

// Formatting
const bold = (text) => colorize(text, '1');
const italic = (text) => colorize(text, '3');
const underline = (text) => colorize(text, '4');
const strikethrough = (text) => colorize(text, '9');

// Combined styles
const boldCyan = (text) => colorizeMulti(text, '1', '36');
const boldGreen = (text) => colorizeMulti(text, '1', '32');
const boldRed = (text) => colorizeMulti(text, '1', '31');
const boldYellow = (text) => colorizeMulti(text, '1', '33');
const boldMagenta = (text) => colorizeMulti(text, '1', '35');

// Raw colors (for compatibility)
const red = (text) => colorize(text, '31');
const green = (text) => colorize(text, '32');
const yellow = (text) => colorize(text, '33');
const blue = (text) => colorize(text, '34');
const magenta = (text) => colorize(text, '35');
const cyan = (text) => colorize(text, '36');
const white = (text) => colorize(text, '37');
const gray = (text) => colorize(text, '90');

// Symbols with colors
const symbols = {
  check: () => success('✓'),
  cross: () => error('✗'),
  warning: () => warn('⚠'),
  info: () => info('ℹ'),
  bullet: () => dim('•'),
  arrow: () => dim('→'),
  pointer: () => cyan('>'),
};

// Raw ANSI codes for manual use
const codes = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

/**
 * Strip ANSI escape codes from text.
 * @param {string} text - Text with potential ANSI codes
 * @returns {string} Text without ANSI codes
 */
function stripColors(text) {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Get raw codes object (colors disabled = empty strings).
 * Useful for template literals.
 * @returns {object} Codes object
 */
function getRawCodes() {
  if (isColorDisabled()) {
    return Object.fromEntries(Object.keys(codes).map(k => [k, '']));
  }
  return codes;
}

module.exports = {
  // Detection
  isColorDisabled,

  // Low-level
  colorize,
  colorizeMulti,
  stripColors,
  getRawCodes,
  codes,

  // Semantic
  success,
  error,
  warn,
  info,
  dim,
  muted,

  // Formatting
  bold,
  italic,
  underline,
  strikethrough,

  // Combined
  boldCyan,
  boldGreen,
  boldRed,
  boldYellow,
  boldMagenta,

  // Raw colors
  red,
  green,
  yellow,
  blue,
  magenta,
  cyan,
  white,
  gray,

  // Symbols
  symbols,
};
