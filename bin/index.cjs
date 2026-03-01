#!/usr/bin/env node

/**
 * Grabby - Global CLI
 * Token-efficient feature contract system for AI-assisted development
 * Extended with BMAD-style agents and workflows
 */

const fs = require('fs');
const path = require('path');
const { createProjectContext, createCommandHandlers } = require('../lib/commands.cjs');
const { createInteractiveHandlers } = require('../lib/interactive.cjs');

// ============================================================================
// TERMINAL COLORS (no dependencies)
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',

  // Foreground
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

const c = {
  error: (s) => `${colors.red}${s}${colors.reset}`,
  success: (s) => `${colors.green}${s}${colors.reset}`,
  warn: (s) => `${colors.yellow}${s}${colors.reset}`,
  info: (s) => `${colors.cyan}${s}${colors.reset}`,
  dim: (s) => `${colors.dim}${s}${colors.reset}`,
  bold: (s) => `${colors.bold}${s}${colors.reset}`,
  heading: (s) => `${colors.bold}${colors.cyan}${s}${colors.reset}`,
  agent: (s) => `${colors.bold}${colors.magenta}${s}${colors.reset}`,
};

// Paths
const PKG_ROOT = path.join(__dirname, '..');
const TEMPLATES_DIR = path.join(PKG_ROOT, 'templates');
const DOCS_DIR = path.join(PKG_ROOT, 'docs');
const AGENTS_DIR = path.join(PKG_ROOT, 'agents');
const WORKFLOWS_DIR = path.join(PKG_ROOT, 'workflows');
const CWD = process.cwd();
const CONTRACTS_DIR = path.join(CWD, 'contracts');
const PROGRESS_DIR = path.join(CWD, '.grabby-progress');

// Output mode from --output flag
const OUTPUT_MODE = (() => {
  const idx = process.argv.indexOf('--output');
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1]; // 'console', 'file', or 'both'
  }
  return 'both'; // default
})();

const projectContext = createProjectContext({ cwd: CWD, pkgRoot: PKG_ROOT });
const commandHandlers = createCommandHandlers({
  context: projectContext,
  outputMode: OUTPUT_MODE,
  formatter: c,
});

const interactiveHandlers = createInteractiveHandlers({
  c,
  outputMode: OUTPUT_MODE,
  pkgRoot: PKG_ROOT,
  cwd: CWD,
  commandHandlers,
});

// ============================================================================
// COMMANDS
// ============================================================================

function init() {
  commandHandlers.init();
}

function create(name) {
  commandHandlers.create(name);
}

function validate(file) {
  commandHandlers.validate(file);
}

function plan(file) {
  commandHandlers.plan(file);
}

function approve(file) {
  commandHandlers.approve(file);
}

function execute(file) {
  commandHandlers.execute(file);
}

function audit(file) {
  commandHandlers.audit(file);
}

function list() {
  commandHandlers.list();
}

function backlog(file) {
  commandHandlers.backlog(file);
}

function promptBundle(file) {
  commandHandlers.promptBundle(file);
}

function session(file) {
  const regenerate = args.includes('--regenerate');
  const check = args.includes('--check');
  const checkAll = args.includes('--check-all');
  const formatIndex = args.indexOf('--format');
  const outputIndex = args.indexOf('--output-path');
  commandHandlers.session(file, {
    regenerate,
    check,
    checkAll,
    format: formatIndex !== -1 && args[formatIndex + 1] ? args[formatIndex + 1] : 'json',
    outputPath: outputIndex !== -1 && args[outputIndex + 1] ? args[outputIndex + 1] : null,
  });
}

function agentList() {
  return interactiveHandlers.agentList();
}

async function agent() {
  return interactiveHandlers.agent();
}

async function quick() {
  return interactiveHandlers.quick();
}

async function task() {
  return interactiveHandlers.task();
}

async function orchestrate() {
  return interactiveHandlers.orchestrate();
}

async function party() {
  return interactiveHandlers.party();
}

async function workflow() {
  return interactiveHandlers.workflow();
}

function resume() {
  return interactiveHandlers.resume();
}

function help() {
  return interactiveHandlers.help();
}

function resolveContract(file) {
  return interactiveHandlers.resolveContract(file);
}

const [cmd, ...args] = process.argv.slice(2);

const commands = {
  init,
  create: () => create(args.join(' ').replace(/--output.*$/, '').trim() || 'new-feature'),
  validate: () => validate(args[0]),
  plan: () => plan(args[0]),
  approve: () => approve(args[0]),
  execute: () => execute(args[0]),
  audit: () => audit(args[0]),
  list,
  backlog: () => backlog(args[0]),
  prompt: () => promptBundle(args[0]),
  session: () => session(args[0]),
  agent,
  task,
  orchestrate,
  quick,
  party,
  workflow,
  resume,
  help,
  '-h': help,
  '--help': help
};

// Handle async commands
const command = commands[cmd] || help;
const result = command();
if (result instanceof Promise) {
  result.catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

