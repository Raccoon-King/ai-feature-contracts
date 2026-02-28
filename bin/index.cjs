#!/usr/bin/env node

/**
 * AI Feature Contracts - Global CLI
 * Token-efficient feature contract system for AI-assisted development
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

// Paths
const PKG_ROOT = path.join(__dirname, '..');
const TEMPLATES_DIR = path.join(PKG_ROOT, 'templates');
const DOCS_DIR = path.join(PKG_ROOT, 'docs');
const CWD = process.cwd();
const CONTRACTS_DIR = path.join(CWD, 'contracts');

// Ensure contracts dir exists in current project
const ensureContractsDir = () => {
  if (!fs.existsSync(CONTRACTS_DIR)) {
    fs.mkdirSync(CONTRACTS_DIR, { recursive: true });
  }
};

// Utilities
const genId = () => `FC-${Date.now()}`;
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const timestamp = () => new Date().toISOString();

// ============================================================================
// VALIDATION
// ============================================================================

function validateContract(content) {
  const errors = [];
  const warnings = [];

  // Check required sections
  const required = ['Objective', 'Scope', 'Directories', 'Files', 'Done When'];
  required.forEach(s => {
    if (!content.includes(`## ${s}`)) errors.push(`Missing section: ${s}`);
  });

  // Check restricted directories in Files section
  const restricted = ['backend/', 'node_modules/', '.env'];
  const filesSection = content.match(/## Files[\s\S]*?(?=##|$)/)?.[0] || '';
  restricted.forEach(r => {
    if (filesSection.includes(r) && !filesSection.includes('Restricted')) {
      errors.push(`Restricted directory in files: ${r}`);
    }
  });

  // Check for banned dependencies in Allowed line
  const banned = ['moment', 'lodash', 'jquery'];
  const allowedLine = content.match(/- Allowed:.*$/m)?.[0] || '';
  banned.forEach(b => {
    if (allowedLine.toLowerCase().includes(b)) {
      errors.push(`Banned dependency: ${b}`);
    }
  });

  // Warnings
  if (!content.includes('## Testing')) {
    warnings.push('No testing section defined');
  }
  if (!content.includes('Context Refs')) {
    warnings.push('No context references defined');
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ============================================================================
// COMMANDS
// ============================================================================

function init() {
  console.log('Initializing AI Feature Contracts in current project...\n');

  ensureContractsDir();

  // Copy docs to project
  const projectDocs = path.join(CWD, 'docs');
  if (!fs.existsSync(projectDocs)) {
    fs.mkdirSync(projectDocs, { recursive: true });
  }

  // Copy reference docs
  const docFiles = ['ARCHITECTURE_INDEX.md', 'RULESET_CORE.md', 'ENV_STACK.md', 'EXECUTION_PROTOCOL.md'];
  docFiles.forEach(f => {
    const src = path.join(DOCS_DIR, f);
    const dest = path.join(projectDocs, f);
    if (fs.existsSync(src) && !fs.existsSync(dest)) {
      fs.copyFileSync(src, dest);
      console.log(`  ✓ Created docs/${f}`);
    }
  });

  // Create contracts README
  const readmePath = path.join(CONTRACTS_DIR, 'README.md');
  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(readmePath, `# Feature Contracts

This directory contains feature contracts for AI-assisted development.

## Commands

\`\`\`bash
afc create "feature-name"   # Create new contract
afc validate file.fc.md     # Validate contract
afc plan file.fc.md         # Generate plan (Phase 1)
afc approve file.fc.md      # Approve for execution
afc execute file.fc.md      # Execute (Phase 2)
afc audit file.fc.md        # Post-execution audit
afc list                    # List all contracts
\`\`\`

## Workflow

1. Create contract: \`afc create "my-feature"\`
2. Fill out the contract details
3. Validate: \`afc validate my-feature.fc.md\`
4. Generate plan: \`afc plan my-feature.fc.md\`
5. Approve: \`afc approve my-feature.fc.md\`
6. Execute with Cline/Claude: \`afc execute my-feature.fc.md\`
7. Audit: \`afc audit my-feature.fc.md\`
`);
    console.log('  ✓ Created contracts/README.md');
  }

  console.log('\n✓ Initialized! Run `afc create "feature-name"` to start.\n');
}

function create(name) {
  ensureContractsDir();

  const id = genId();
  const fileName = `${slug(name)}.fc.md`;
  const filePath = path.join(CONTRACTS_DIR, fileName);

  if (fs.existsSync(filePath)) {
    console.log(`✗ Contract already exists: ${fileName}`);
    process.exit(1);
  }

  const template = fs.readFileSync(path.join(TEMPLATES_DIR, 'contract.md'), 'utf8');
  const content = template
    .replace(/\[NAME\]/g, name)
    .replace(/\[ID\]/g, id)
    .replace(/\[DATE\]/g, new Date().toISOString().split('T')[0])
    .replace(/\[FEATURE\]/g, name.replace(/\s+/g, ''));

  fs.writeFileSync(filePath, content);

  console.log(`✓ Created: contracts/${fileName}`);
  console.log(`  ID: ${id}`);
  console.log(`\nNext: Edit the contract, then run:`);
  console.log(`  afc validate ${fileName}`);
}

function validate(file) {
  const filePath = resolveContract(file);
  const content = fs.readFileSync(filePath, 'utf8');
  const result = validateContract(content);

  console.log(`Validating: ${path.basename(filePath)}\n`);

  if (result.errors.length > 0) {
    console.log('✗ Errors:');
    result.errors.forEach(e => console.log(`  - ${e}`));
  }

  if (result.warnings.length > 0) {
    console.log('\n⚠ Warnings:');
    result.warnings.forEach(w => console.log(`  - ${w}`));
  }

  if (result.valid) {
    console.log('✓ Validation passed\n');
    console.log(`Next: afc plan ${path.basename(filePath)}`);
  } else {
    console.log('\n✗ Validation failed\n');
    process.exit(1);
  }
}

function plan(file) {
  const filePath = resolveContract(file);
  const content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);

  // Validate first
  const validation = validateContract(content);
  if (!validation.valid) {
    console.log('✗ Contract has validation errors. Run: afc validate ' + fileName);
    process.exit(1);
  }

  // Extract files
  const files = [];
  const filesMatch = content.match(/## Files[\s\S]*?\|[\s\S]*?(?=##|$)/);
  if (filesMatch) {
    const rows = filesMatch[0].split('\n').filter(r =>
      r.startsWith('|') && !r.includes('Action') && !r.includes('---')
    );
    rows.forEach(row => {
      const cols = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cols.length >= 3 && !cols[0].includes('-')) {
        files.push({
          action: cols[0],
          path: cols[1].replace(/`/g, ''),
          reason: cols[2]
        });
      }
    });
  }

  // Extract context refs
  const contextMatch = content.match(/## Context Refs[\s\S]*?(?=##|$)/);
  const contexts = [];
  if (contextMatch) {
    const lines = contextMatch[0].split('\n').filter(l => l.startsWith('-'));
    lines.forEach(l => contexts.push(l.replace('- ', '').trim()));
  }

  const plan = {
    contract: fileName,
    phase: 'plan',
    timestamp: timestamp(),
    context: contexts.length > 0 ? contexts : ['ARCH_INDEX_v1', 'RULESET_CORE_v1'],
    files,
    rules: ['§typescript', '§hooks', '§testing'],
    risks: ['State synchronization', 'Type coverage', 'Edge cases'],
    status: 'pending_approval'
  };

  const planFile = fileName.replace('.fc.md', '.plan.yaml');
  const planPath = path.join(CONTRACTS_DIR, planFile);
  fs.writeFileSync(planPath, yaml.stringify(plan));

  console.log('═'.repeat(50));
  console.log('PHASE 1: PLAN');
  console.log('═'.repeat(50));
  console.log(yaml.stringify(plan));
  console.log(`Saved: contracts/${planFile}`);
  console.log(`\nNext: afc approve ${fileName}`);
}

function approve(file) {
  const filePath = resolveContract(file);
  const fileName = path.basename(filePath);
  let content = fs.readFileSync(filePath, 'utf8');

  // Update status
  content = content.replace(/\*\*Status:\*\*\s*\w+/, '**Status:** approved');
  fs.writeFileSync(filePath, content);

  // Update plan
  const planFile = fileName.replace('.fc.md', '.plan.yaml');
  const planPath = path.join(CONTRACTS_DIR, planFile);
  if (fs.existsSync(planPath)) {
    const plan = yaml.parse(fs.readFileSync(planPath, 'utf8'));
    plan.status = 'approved';
    plan.approved_at = timestamp();
    fs.writeFileSync(planPath, yaml.stringify(plan));
  }

  console.log('✓ Contract approved');
  console.log(`\nNext: afc execute ${fileName}`);
}

function execute(file) {
  const filePath = resolveContract(file);
  const fileName = path.basename(filePath);
  const content = fs.readFileSync(filePath, 'utf8');

  if (!content.includes('**Status:** approved')) {
    console.log('✗ Contract not approved. Run: afc approve ' + fileName);
    process.exit(1);
  }

  // Load plan
  const planFile = fileName.replace('.fc.md', '.plan.yaml');
  const planPath = path.join(CONTRACTS_DIR, planFile);

  if (!fs.existsSync(planPath)) {
    console.log('✗ No plan found. Run: afc plan ' + fileName);
    process.exit(1);
  }

  const plan = yaml.parse(fs.readFileSync(planPath, 'utf8'));

  console.log('═'.repeat(50));
  console.log('PHASE 2: EXECUTE');
  console.log('═'.repeat(50));
  console.log('\nContext:');
  plan.context.forEach(c => console.log(`  @context ${c}`));
  console.log('\nFiles:');
  plan.files.forEach(f => console.log(`  ${f.action}: ${f.path}`));
  console.log('\nRules:');
  plan.rules.forEach(r => console.log(`  ${r}`));
  console.log('\n' + '─'.repeat(50));
  console.log('\nCopy the above to Cline/Claude Code.');
  console.log(`After completion: afc audit ${fileName}\n`);

  // Update plan status
  plan.status = 'executing';
  plan.executed_at = timestamp();
  fs.writeFileSync(planPath, yaml.stringify(plan));
}

function audit(file) {
  const filePath = resolveContract(file);
  const fileName = path.basename(filePath);

  console.log('═'.repeat(50));
  console.log('POST-EXECUTION AUDIT');
  console.log('═'.repeat(50));

  const planFile = fileName.replace('.fc.md', '.plan.yaml');
  const planPath = path.join(CONTRACTS_DIR, planFile);
  const plan = fs.existsSync(planPath)
    ? yaml.parse(fs.readFileSync(planPath, 'utf8'))
    : null;

  console.log('\nContract:', fileName);
  console.log('Status:', plan?.status || 'unknown');

  console.log('\nFiles specified:');
  if (plan?.files) {
    plan.files.forEach(f => {
      const exists = fs.existsSync(path.join(CWD, f.path));
      const icon = f.action === 'create'
        ? (exists ? '✓' : '✗')
        : '~';
      console.log(`  ${icon} ${f.action}: ${f.path}`);
    });
  }

  console.log('\nRunning checks...');

  // Try to run lint/build if package.json exists
  const pkgPath = path.join(CWD, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const { execSync } = require('child_process');

    try {
      execSync('npm run lint', { stdio: 'pipe', cwd: CWD });
      console.log('  ✓ Lint: passed');
    } catch {
      console.log('  ✗ Lint: failed');
    }

    try {
      execSync('npm run build', { stdio: 'pipe', cwd: CWD });
      console.log('  ✓ Build: passed');
    } catch {
      console.log('  ✗ Build: failed');
    }
  }

  console.log('\n' + '─'.repeat(50));
  console.log('Update contract status to "complete" when done.');
  console.log('Mark Done When checkboxes in the contract.\n');
}

function list() {
  ensureContractsDir();

  const files = fs.readdirSync(CONTRACTS_DIR).filter(f => f.endsWith('.fc.md'));

  if (files.length === 0) {
    console.log('No contracts found.');
    console.log('Create one: afc create "feature-name"\n');
    return;
  }

  console.log('Contracts:\n');
  files.forEach(f => {
    const content = fs.readFileSync(path.join(CONTRACTS_DIR, f), 'utf8');
    const status = content.match(/\*\*Status:\*\*\s*(\w+)/)?.[1] || '?';
    const id = content.match(/\*\*ID:\*\*\s*(FC-\d+)/)?.[1] || '?';
    const icons = {
      draft: '📝',
      approved: '✓ ',
      executing: '⚡',
      complete: '✓✓'
    };
    console.log(`  ${icons[status] || '? '} ${f}`);
    console.log(`     ID: ${id} | Status: ${status}`);
  });
  console.log('');
}

function help() {
  console.log(`
AI Feature Contracts - CLI

Commands:
  afc init                  Initialize in current project
  afc create <name>         Create new contract
  afc validate <file>       Validate contract
  afc plan <file>           Generate plan (Phase 1)
  afc approve <file>        Approve for execution
  afc execute <file>        Execute instructions (Phase 2)
  afc audit <file>          Post-execution audit
  afc list                  List all contracts
  afc help                  Show this help

Workflow:
  1. afc init                    # First time setup
  2. afc create "my-feature"     # Create contract
  3. Edit contracts/my-feature.fc.md
  4. afc validate my-feature.fc.md
  5. afc plan my-feature.fc.md
  6. afc approve my-feature.fc.md
  7. afc execute my-feature.fc.md
  8. [Implement with Cline/Claude]
  9. afc audit my-feature.fc.md

Aliases:
  ai-feature = afc
`);
}

// ============================================================================
// HELPERS
// ============================================================================

function resolveContract(file) {
  if (!file) {
    console.log('✗ No file specified');
    process.exit(1);
  }

  // Try exact path
  if (fs.existsSync(file)) return path.resolve(file);

  // Try in contracts/
  const inContracts = path.join(CONTRACTS_DIR, file);
  if (fs.existsSync(inContracts)) return inContracts;

  // Try with extension
  const withExt = file.endsWith('.fc.md') ? file : `${file}.fc.md`;
  const withExtPath = path.join(CONTRACTS_DIR, withExt);
  if (fs.existsSync(withExtPath)) return withExtPath;

  console.log(`✗ Contract not found: ${file}`);
  console.log(`  Looked in: ${CONTRACTS_DIR}`);
  process.exit(1);
}

// ============================================================================
// MAIN
// ============================================================================

const [cmd, ...args] = process.argv.slice(2);

const commands = {
  init,
  create: () => create(args.join(' ') || 'new-feature'),
  validate: () => validate(args[0]),
  plan: () => plan(args[0]),
  approve: () => approve(args[0]),
  execute: () => execute(args[0]),
  audit: () => audit(args[0]),
  list,
  help,
  '-h': help,
  '--help': help
};

(commands[cmd] || help)();
