#!/usr/bin/env node

/**
 * AI Feature Contracts - Global CLI
 * Token-efficient feature contract system for AI-assisted development
 * Extended with BMAD-style agents and workflows
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const readline = require('readline');

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
const PROGRESS_DIR = path.join(CWD, '.afc-progress');

// Output mode from --output flag
const OUTPUT_MODE = (() => {
  const idx = process.argv.indexOf('--output');
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1]; // 'console', 'file', or 'both'
  }
  return 'both'; // default
})();

// Ensure contracts dir exists in current project
const ensureContractsDir = () => {
  if (!fs.existsSync(CONTRACTS_DIR)) {
    fs.mkdirSync(CONTRACTS_DIR, { recursive: true });
  }
};

// Utilities
const genId = () => `FC-${Date.now()}`;
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const timestamp = () => new Date().toISOString();

// ============================================================================
// PROGRESS PERSISTENCE
// ============================================================================

function ensureProgressDir() {
  if (!fs.existsSync(PROGRESS_DIR)) {
    fs.mkdirSync(PROGRESS_DIR, { recursive: true });
  }
}

function saveProgress(workflowName, data) {
  ensureProgressDir();
  const progressFile = path.join(PROGRESS_DIR, `${workflowName}.json`);
  const progress = {
    workflow: workflowName,
    timestamp: timestamp(),
    data
  };
  fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
  return progressFile;
}

function loadProgress(workflowName) {
  const progressFile = path.join(PROGRESS_DIR, `${workflowName}.json`);
  if (!fs.existsSync(progressFile)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(progressFile, 'utf8'));
  } catch {
    return null;
  }
}

function clearProgress(workflowName) {
  const progressFile = path.join(PROGRESS_DIR, `${workflowName}.json`);
  if (fs.existsSync(progressFile)) {
    fs.unlinkSync(progressFile);
  }
}

function listProgress() {
  if (!fs.existsSync(PROGRESS_DIR)) {
    return [];
  }
  return fs.readdirSync(PROGRESS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const data = JSON.parse(fs.readFileSync(path.join(PROGRESS_DIR, f), 'utf8'));
      return {
        file: f,
        workflow: data.workflow,
        timestamp: data.timestamp,
        step: data.data?.currentStep || 0
      };
    });
}

// ============================================================================
// INTERACTIVE PROMPT SYSTEM
// ============================================================================

function createPromptInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

async function prompt(rl, question, defaultValue = '') {
  return new Promise((resolve) => {
    const defaultHint = defaultValue ? ` (${defaultValue})` : '';
    rl.question(`${question}${defaultHint}: `, (answer) => {
      resolve(answer.trim() || defaultValue);
    });
  });
}

async function confirm(rl, question) {
  return new Promise((resolve) => {
    rl.question(`${question} [Y/n]: `, (answer) => {
      const a = answer.trim().toLowerCase();
      resolve(a === '' || a === 'y' || a === 'yes');
    });
  });
}

async function stepNavigation(rl, stepNum, totalSteps) {
  console.log(`\n${c.dim(`Step ${stepNum}/${totalSteps}`)}`);
  console.log(c.dim('[C]ontinue  [B]ack  [S]ave & Quit  [Q]uit'));

  return new Promise((resolve) => {
    rl.question('> ', (answer) => {
      const a = answer.trim().toLowerCase();
      if (a === 'c' || a === '') {
        resolve('continue');
      } else if (a === 'b') {
        resolve('back');
      } else if (a === 's') {
        resolve('save');
      } else if (a === 'q') {
        resolve('quit');
      } else {
        resolve('continue');
      }
    });
  });
}

// ============================================================================
// OUTPUT HELPERS
// ============================================================================

function output(content, filePath = null) {
  if (OUTPUT_MODE === 'console' || OUTPUT_MODE === 'both') {
    console.log(content);
  }
  if ((OUTPUT_MODE === 'file' || OUTPUT_MODE === 'both') && filePath) {
    fs.writeFileSync(filePath, content);
    console.log(`\nWritten to: ${filePath}`);
  }
}

// ============================================================================
// AGENT SYSTEM
// ============================================================================

function loadAgent(name) {
  const agentFile = path.join(AGENTS_DIR, `${name}.agent.yaml`);
  if (!fs.existsSync(agentFile)) {
    // Try aliases
    const aliases = {
      'architect': 'contract-architect',
      'validator': 'scope-validator',
      'strategist': 'plan-strategist',
      'dev': 'dev-agent',
      'auditor': 'auditor',
      'quick': 'quick-flow'
    };
    const aliased = aliases[name];
    if (aliased) {
      const aliasedFile = path.join(AGENTS_DIR, `${aliased}.agent.yaml`);
      if (fs.existsSync(aliasedFile)) {
        return yaml.parse(fs.readFileSync(aliasedFile, 'utf8'));
      }
    }
    return null;
  }
  return yaml.parse(fs.readFileSync(agentFile, 'utf8'));
}

function listAgents() {
  if (!fs.existsSync(AGENTS_DIR)) {
    console.log('No agents directory found.');
    return [];
  }
  const files = fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith('.agent.yaml'));
  return files.map(f => {
    const content = yaml.parse(fs.readFileSync(path.join(AGENTS_DIR, f), 'utf8'));
    return {
      file: f,
      id: content.agent?.metadata?.id || f,
      name: content.agent?.metadata?.name || 'Unknown',
      title: content.agent?.metadata?.title || 'Unknown',
      icon: content.agent?.metadata?.icon || '?',
      capabilities: content.agent?.metadata?.capabilities || ''
    };
  });
}

function displayAgent(agentData) {
  const { agent } = agentData;
  const { metadata, persona, greeting, menu } = agent;

  console.log('\n' + '═'.repeat(50));
  console.log(`${metadata.icon} ${metadata.name} - ${metadata.title}`);
  console.log('═'.repeat(50));

  if (greeting) {
    console.log('\n' + greeting.trim());
  }

  console.log('\n' + '─'.repeat(50));
  console.log('MENU');
  console.log('─'.repeat(50));

  if (menu && menu.length > 0) {
    menu.forEach(item => {
      console.log(`  ${item.description}`);
    });
  }

  console.log('\n' + '─'.repeat(50));
  console.log('Usage: afc agent ' + metadata.name.toLowerCase() + ' <command>');
  console.log('Example: afc agent ' + metadata.name.toLowerCase() + ' ' + (menu?.[0]?.trigger || 'CC'));
  console.log('');
}

// ============================================================================
// WORKFLOW SYSTEM
// ============================================================================

function loadWorkflow(workflowPath) {
  let fullPath = workflowPath;
  if (!path.isAbsolute(workflowPath)) {
    fullPath = path.join(PKG_ROOT, workflowPath);
  }
  if (!fs.existsSync(fullPath)) {
    // Try in workflows dir
    const inWorkflows = path.join(WORKFLOWS_DIR, workflowPath, 'workflow.yaml');
    if (fs.existsSync(inWorkflows)) {
      fullPath = inWorkflows;
    } else {
      return null;
    }
  }
  return yaml.parse(fs.readFileSync(fullPath, 'utf8'));
}

function loadWorkflowStep(workflowDir, stepFile) {
  const stepPath = path.join(workflowDir, stepFile);
  if (!fs.existsSync(stepPath)) {
    return null;
  }
  return fs.readFileSync(stepPath, 'utf8');
}

async function runCreateContractWorkflow(rl, agentData) {
  const agent = agentData.agent;

  console.log('\n' + c.heading('═'.repeat(50)));
  console.log(c.heading('CREATE CONTRACT WORKFLOW'));
  console.log(c.heading('═'.repeat(50)));
  console.log('\nLet\'s create a new feature contract through conversation.\n');

  // Step 0: Template Selection
  console.log(c.bold('What type of contract is this?'));
  console.log('  1. ' + c.info('General') + ' - Custom feature (default)');
  console.log('  2. ' + c.info('UI Component') + ' - React/Vue component');
  console.log('  3. ' + c.info('API Endpoint') + ' - Backend route/handler');
  console.log('  4. ' + c.info('Bug Fix') + ' - Fix a specific bug');
  console.log('  5. ' + c.info('Refactor') + ' - Code improvement');
  console.log('  6. ' + c.info('Integration') + ' - Third-party service');

  const templateChoice = await prompt(rl, '\nTemplate (1-6)', '1');
  const templateMap = {
    '1': 'contract',
    '2': 'ui-component',
    '3': 'api-endpoint',
    '4': 'bug-fix',
    '5': 'refactor',
    '6': 'integration'
  };
  const templateName = templateMap[templateChoice] || 'contract';

  // Step 1: Interview
  console.log('\n' + '─'.repeat(50));
  console.log(c.bold('STEP 1: Feature Interview'));
  console.log('─'.repeat(50) + '\n');

  const featureName = await prompt(rl, 'What would you like to call this feature?');
  if (!featureName) {
    console.log('Feature name is required. Aborting.');
    return;
  }

  const objective = await prompt(rl, 'In 1-2 sentences, what does this feature do?');
  if (!objective) {
    console.log('Objective is required. Aborting.');
    return;
  }

  const scopeInput = await prompt(rl, 'What are the main things this feature needs to do? (comma-separated)');
  const scopeItems = scopeInput.split(',').map(s => s.trim()).filter(Boolean);
  if (scopeItems.length === 0) {
    console.log('At least one scope item is required. Aborting.');
    return;
  }

  const nonGoalsInput = await prompt(rl, 'What is explicitly OUT of scope? (comma-separated, or press Enter to skip)');
  const nonGoals = nonGoalsInput ? nonGoalsInput.split(',').map(s => s.trim()).filter(Boolean) : ['None specified'];

  // Step 2: Scope Definition
  console.log('\n' + '─'.repeat(50));
  console.log('STEP 2: Scope Definition');
  console.log('─'.repeat(50) + '\n');

  const directories = await prompt(rl, 'Which directories will this feature touch?', 'src/components/, src/hooks/');

  console.log('\nList files to create/modify.');
  console.log('Format: action:path:reason (e.g., create:src/hooks/useAuth.ts:State management)');
  console.log('Enter one per line, empty line when done:\n');

  const files = [];
  let fileInput;
  while (true) {
    fileInput = await prompt(rl, `File ${files.length + 1}`);
    if (!fileInput) break;
    const parts = fileInput.split(':');
    if (parts.length >= 2) {
      files.push({
        action: parts[0].trim(),
        path: parts[1].trim(),
        reason: parts[2]?.trim() || 'Implementation'
      });
    }
  }

  if (files.length === 0) {
    // Default file based on feature name
    const hookName = `use${featureName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}`;
    files.push(
      { action: 'create', path: `src/hooks/${hookName}.ts`, reason: 'Main hook' },
      { action: 'create', path: `src/tests/${hookName}.test.ts`, reason: 'Unit tests' }
    );
    console.log(`\nUsing default files: ${files.map(f => f.path).join(', ')}`);
  }

  const dependencies = await prompt(rl, 'Any new dependencies needed?', 'none');

  // Step 3: Finalize
  console.log('\n' + '─'.repeat(50));
  console.log(c.bold('STEP 3: Finalize Contract'));
  console.log('─'.repeat(50) + '\n');

  const doneCriteriaInput = await prompt(rl, 'What conditions must be true when done?', 'Feature works as specified, Tests pass, Lint passes, Build succeeds');
  const doneCriteria = doneCriteriaInput.split(',').map(s => s.trim()).filter(Boolean);

  const testingInput = await prompt(rl, 'What tests are needed? (e.g., unit:src/tests/feature.test.ts)', '');

  // Show summary
  console.log('\n' + '═'.repeat(50));
  console.log('CONTRACT SUMMARY');
  console.log('═'.repeat(50));
  console.log(`\nFeature: ${featureName}`);
  console.log(`Objective: ${objective}`);
  console.log(`\nScope:`);
  scopeItems.forEach(s => console.log(`  - ${s}`));
  console.log(`\nFiles:`);
  files.forEach(f => console.log(`  ${f.action}: ${f.path}`));
  console.log('');

  const shouldGenerate = await confirm(rl, 'Generate this contract?');
  if (!shouldGenerate) {
    console.log('Contract generation cancelled.');
    return;
  }

  // Generate contract
  ensureContractsDir();
  const id = genId();
  const fileName = `${slug(featureName)}.fc.md`;
  const filePath = path.join(CONTRACTS_DIR, fileName);

  const filesTable = files.map(f => `| ${f.action} | \`${f.path}\` | ${f.reason} |`).join('\n');
  const scopeList = scopeItems.map(s => `- ${s}`).join('\n');
  const nonGoalsList = nonGoals.map(s => `- ${s}`).join('\n');
  const doneList = doneCriteria.map(s => `- [ ] ${s}`).join('\n');
  const testingSection = testingInput || `- Unit: src/tests/${slug(featureName)}.test.ts`;

  const contract = `# FC: ${featureName}
**ID:** ${id} | **Status:** draft

## Objective
${objective}

## Scope
${scopeList}

## Non-Goals
${nonGoalsList}

## Directories
**Allowed:** \`${directories}\`
**Restricted:** \`backend/\`, \`node_modules/\`, \`.env*\`

## Files
| Action | Path | Reason |
|--------|------|--------|
${filesTable}

## Dependencies
- Allowed: ${dependencies === 'none' ? 'existing packages only' : dependencies}
- Banned: moment, lodash, jquery

## Done When
${doneList}

## Testing
${testingSection}

## Context Refs
- ARCH_INDEX_v1
- RULESET_CORE_v1
`;

  output(contract, filePath);

  console.log('\n' + c.heading('═'.repeat(50)));
  console.log(c.heading('CONTRACT CREATED'));
  console.log(c.heading('═'.repeat(50)));
  console.log(`\nFile: ${c.info('contracts/' + fileName)}`);
  console.log(`ID: ${c.dim(id)}`);
  console.log(`Template: ${c.dim(templateName)}`);
  console.log(`\n${c.bold('Next steps:')}`);
  console.log(`  1. Review the contract: ${c.dim('contracts/' + fileName)}`);
  console.log(`  2. Validate: ${c.info('afc validate ' + fileName)}`);
  console.log(`  3. Plan: ${c.info('afc plan ' + fileName)}`);
  console.log('');
}

async function runValidateContractWorkflow(rl, agentData, contractFile) {
  const agent = agentData.agent;

  console.log('\n' + '═'.repeat(50));
  console.log(`${agent.metadata.icon} VALIDATE CONTRACT WORKFLOW`);
  console.log('═'.repeat(50));

  let targetFile = contractFile;
  if (!targetFile) {
    targetFile = await prompt(rl, 'Which contract to validate?');
  }

  const filePath = resolveContract(targetFile);
  const content = fs.readFileSync(filePath, 'utf8');
  const result = validateContract(content);
  const fileName = path.basename(filePath);

  // Enhanced validation with agent persona
  console.log(`\n${agent.metadata.name} says:`);
  console.log(agent.persona.identity.split('\n')[1] || 'Analyzing contract...');

  console.log('\n' + '─'.repeat(50));
  console.log('STEP 1: Structure Validation');
  console.log('─'.repeat(50));

  const required = ['Objective', 'Scope', 'Directories', 'Files', 'Done When'];
  const recommended = ['Non-Goals', 'Testing', 'Context Refs'];

  console.log('\nRequired sections:');
  required.forEach(s => {
    const present = content.includes(`## ${s}`);
    console.log(`  ${present ? '✓' : '✗'} ${s}`);
  });

  console.log('\nRecommended sections:');
  recommended.forEach(s => {
    const present = content.includes(`## ${s}`) || content.includes(s);
    console.log(`  ${present ? '✓' : '⚠'} ${s}`);
  });

  console.log('\n' + '─'.repeat(50));
  console.log('STEP 2: Scope Analysis');
  console.log('─'.repeat(50));

  // Check directories
  const filesSection = content.match(/## Files[\s\S]*?(?=##|$)/)?.[0] || '';
  const restricted = ['backend/', 'node_modules/', '.env'];
  let hasRestrictedViolation = false;

  console.log('\nDirectory boundary check:');
  restricted.forEach(r => {
    if (filesSection.includes(r)) {
      console.log(`  ✗ Restricted: ${r} found in Files section`);
      hasRestrictedViolation = true;
    }
  });
  if (!hasRestrictedViolation) {
    console.log('  ✓ No restricted directory violations');
  }

  // Check dependencies
  const banned = ['moment', 'lodash', 'jquery'];
  const depsSection = content.match(/## Dependencies[\s\S]*?(?=##|$)/)?.[0] || '';
  let hasBannedDeps = false;

  console.log('\nDependency check:');
  banned.forEach(b => {
    if (depsSection.toLowerCase().includes(b) && !depsSection.includes('Banned')) {
      console.log(`  ✗ Banned: ${b} detected`);
      hasBannedDeps = true;
    }
  });
  if (!hasBannedDeps) {
    console.log('  ✓ No banned dependencies');
  }

  console.log('\n' + '─'.repeat(50));
  console.log('STEP 3: Validation Report');
  console.log('─'.repeat(50));

  const status = result.valid ? (result.warnings.length > 0 ? 'WARNINGS' : 'PASS') : 'FAIL';

  console.log(`\nContract: ${fileName}`);
  console.log(`Status: ${status}`);
  console.log(`Errors: ${result.errors.length}`);
  console.log(`Warnings: ${result.warnings.length}`);

  if (result.errors.length > 0) {
    console.log('\n✗ Errors (must fix):');
    result.errors.forEach(e => console.log(`  - ${e}`));
  }

  if (result.warnings.length > 0) {
    console.log('\n⚠ Warnings (should consider):');
    result.warnings.forEach(w => console.log(`  - ${w}`));
  }

  console.log('\n' + '─'.repeat(50));

  if (result.valid) {
    console.log('\n✓ Contract is valid');
    console.log(`\nNext: afc plan ${fileName}`);
  } else {
    console.log('\n✗ Contract has errors');
    console.log('\nFix errors and re-validate:');
    console.log(`  afc validate ${fileName}`);
  }
  console.log('');
}

async function runExecuteContractWorkflow(rl, agentData, contractFile) {
  const agent = agentData.agent;

  console.log('\n' + '═'.repeat(50));
  console.log(`${agent.metadata.icon} EXECUTE CONTRACT WORKFLOW`);
  console.log('═'.repeat(50));

  let targetFile = contractFile;
  if (!targetFile) {
    targetFile = await prompt(rl, 'Which contract to execute?');
  }

  const filePath = resolveContract(targetFile);
  const content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);

  // Check preconditions
  console.log('\n' + '─'.repeat(50));
  console.log('STEP 1: Precondition Check');
  console.log('─'.repeat(50));

  const isApproved = content.includes('**Status:** approved');
  console.log(`\n${isApproved ? '✓' : '✗'} Contract status: ${isApproved ? 'approved' : 'not approved'}`);

  if (!isApproved) {
    console.log(`\n✗ Contract must be approved before execution.`);
    console.log(`Run: afc approve ${fileName}`);
    return;
  }

  const planFile = fileName.replace('.fc.md', '.plan.yaml');
  const planPath = path.join(CONTRACTS_DIR, planFile);
  const hasPlan = fs.existsSync(planPath);
  console.log(`${hasPlan ? '✓' : '✗'} Plan exists: ${hasPlan ? planFile : 'not found'}`);

  if (!hasPlan) {
    console.log(`\n✗ Plan must exist before execution.`);
    console.log(`Run: afc plan ${fileName}`);
    return;
  }

  const plan = yaml.parse(fs.readFileSync(planPath, 'utf8'));

  console.log(`\n${agent.metadata.name} says:`);
  console.log(agent.greeting?.split('\n')[1] || 'Ready to implement.');

  // Display execution plan
  console.log('\n' + '─'.repeat(50));
  console.log('STEP 2: Execution Plan');
  console.log('─'.repeat(50));

  console.log('\nContext:');
  (plan.context || []).forEach(c => console.log(`  @context ${c}`));

  console.log('\nFiles to implement:');
  (plan.files || []).forEach((f, i) => {
    console.log(`  ${i + 1}. ${f.action}: ${f.path}`);
    console.log(`     Reason: ${f.reason}`);
  });

  console.log('\nRules:');
  (plan.rules || []).forEach(r => console.log(`  ${r}`));

  const shouldExecute = await confirm(rl, '\nProceed with execution?');
  if (!shouldExecute) {
    console.log('Execution cancelled.');
    return;
  }

  // Execution instructions
  console.log('\n' + '─'.repeat(50));
  console.log('STEP 3: Implementation Instructions');
  console.log('─'.repeat(50));

  const instructions = `
# Execution Instructions for: ${fileName}

## Context to Load
${(plan.context || []).map(c => `@context ${c}`).join('\n')}

## Files to Implement (in order)
${(plan.files || []).map((f, i) => `${i + 1}. ${f.action.toUpperCase()}: ${f.path}\n   Reason: ${f.reason}`).join('\n')}

## Rules to Follow
${(plan.rules || []).map(r => `- ${r}`).join('\n')}

## Implementation Notes
- Implement files in the specified order
- Respect directory boundaries
- Follow project conventions
- Write tests as specified

## After Implementation
Run: afc audit ${fileName}
`;

  output(instructions.trim());

  // Update plan status
  plan.status = 'executing';
  plan.executed_at = timestamp();
  fs.writeFileSync(planPath, yaml.stringify(plan));

  console.log('\n' + '─'.repeat(50));
  console.log('\nCopy the above to your AI assistant (Cline/Claude Code).');
  console.log(`After completion: afc audit ${fileName}`);
  console.log('');
}

// ============================================================================
// EDIT CONTRACT WORKFLOW
// ============================================================================

async function runEditContractWorkflow(rl, agentData, contractFile) {
  const agent = agentData.agent;

  console.log('\n' + c.heading('═'.repeat(50)));
  console.log(c.heading(`${agent.metadata.icon} EDIT CONTRACT WORKFLOW`));
  console.log(c.heading('═'.repeat(50)));

  // List available contracts
  ensureContractsDir();
  const contracts = fs.readdirSync(CONTRACTS_DIR).filter(f => f.endsWith('.fc.md'));

  if (contracts.length === 0) {
    console.log(c.warn('\nNo contracts found. Create one first:'));
    console.log('  afc agent architect CC');
    return;
  }

  let targetFile = contractFile;
  if (!targetFile) {
    console.log('\n' + c.info('Available contracts:'));
    contracts.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
    const choice = await prompt(rl, '\nWhich contract to edit? (number or filename)');
    targetFile = isNaN(choice) ? choice : contracts[parseInt(choice) - 1];
  }

  const filePath = resolveContract(targetFile);
  let content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);

  console.log('\n' + '─'.repeat(50));
  console.log(c.bold('STEP 1: Select Section'));
  console.log('─'.repeat(50));

  const sections = ['Objective', 'Scope', 'Non-Goals', 'Directories', 'Files', 'Dependencies', 'Done When', 'Testing'];
  console.log('\nSections:');
  sections.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));

  const sectionChoice = await prompt(rl, '\nWhich section to edit? (1-8)');
  const sectionName = sections[parseInt(sectionChoice) - 1];

  if (!sectionName) {
    console.log(c.error('Invalid selection'));
    return;
  }

  // Extract current section content
  const sectionRegex = new RegExp(`## ${sectionName}([\\s\\S]*?)(?=##|$)`);
  const match = content.match(sectionRegex);
  const currentContent = match ? match[1].trim() : '';

  console.log('\n' + '─'.repeat(50));
  console.log(c.bold('STEP 2: Edit Section'));
  console.log('─'.repeat(50));

  console.log(`\nCurrent ${sectionName}:`);
  console.log(c.dim('───────────────────────────────────────'));
  console.log(currentContent || c.dim('(empty)'));
  console.log(c.dim('───────────────────────────────────────'));

  const newContent = await prompt(rl, `\nNew ${sectionName} (or Enter to keep current)`);

  if (newContent) {
    content = content.replace(sectionRegex, `## ${sectionName}\n${newContent}\n\n`);

    // Reset status to draft if it was approved
    if (content.includes('**Status:** approved')) {
      content = content.replace('**Status:** approved', '**Status:** draft');
      console.log(c.warn('\nNote: Status reset to draft due to edits.'));
    }

    fs.writeFileSync(filePath, content);
    console.log(c.success(`\n✓ Contract updated: ${fileName}`));
  } else {
    console.log(c.dim('\nNo changes made.'));
  }

  console.log(`\nNext: afc validate ${fileName}`);
}

// ============================================================================
// RISK CHECK WORKFLOW
// ============================================================================

async function runRiskCheckWorkflow(rl, agentData, contractFile) {
  const agent = agentData.agent;

  console.log('\n' + c.heading('═'.repeat(50)));
  console.log(c.heading(`${agent.metadata.icon} RISK CHECK WORKFLOW`));
  console.log(c.heading('═'.repeat(50)));

  let targetFile = contractFile;
  if (!targetFile) {
    targetFile = await prompt(rl, 'Which contract to analyze?');
  }

  const filePath = resolveContract(targetFile);
  const content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);

  console.log(`\n${c.agent(agent.metadata.name)} analyzing risks...`);

  console.log('\n' + '─'.repeat(50));
  console.log(c.bold('STEP 1: Risk Analysis'));
  console.log('─'.repeat(50));

  const risks = [];

  // Scope risks
  const scopeMatch = content.match(/## Scope([\s\S]*?)(?=##|$)/);
  const scopeItems = (scopeMatch?.[1]?.match(/^- .+$/gm) || []).length;

  if (scopeItems > 5) {
    risks.push({ level: 'HIGH', category: 'SCOPE', issue: `Large scope (${scopeItems} items)`, suggestion: 'Consider breaking into smaller contracts' });
  } else if (scopeItems > 3) {
    risks.push({ level: 'MEDIUM', category: 'SCOPE', issue: `Moderate scope (${scopeItems} items)`, suggestion: 'Ensure all items are well-bounded' });
  }

  // Vague terms
  const vagueTerms = ['improve', 'optimize', 'enhance', 'better', 'faster', 'refactor'];
  vagueTerms.forEach(term => {
    if (content.toLowerCase().includes(term)) {
      risks.push({ level: 'MEDIUM', category: 'SCOPE', issue: `Vague term: "${term}"`, suggestion: 'Add specific, measurable criteria' });
    }
  });

  // File count
  const filesMatch = content.match(/## Files([\s\S]*?)(?=##|$)/);
  const fileCount = (filesMatch?.[1]?.match(/^\|[^|]+\|/gm) || []).length - 2; // exclude header rows

  if (fileCount > 10) {
    risks.push({ level: 'HIGH', category: 'COMPLEXITY', issue: `Many files (${fileCount})`, suggestion: 'Consider phased implementation' });
  }

  // Testing
  if (!content.includes('## Testing') || !content.match(/test/i)) {
    risks.push({ level: 'HIGH', category: 'TESTING', issue: 'No testing plan', suggestion: 'Add test files to Files section' });
  }

  // Display risks
  const highRisks = risks.filter(r => r.level === 'HIGH');
  const mediumRisks = risks.filter(r => r.level === 'MEDIUM');
  const lowRisks = risks.filter(r => r.level === 'LOW');

  console.log(`\n${c.error('HIGH risks:')} ${highRisks.length}`);
  highRisks.forEach(r => {
    console.log(`  ${c.error('!')} [${r.category}] ${r.issue}`);
    console.log(`    ${c.dim('→')} ${r.suggestion}`);
  });

  console.log(`\n${c.warn('MEDIUM risks:')} ${mediumRisks.length}`);
  mediumRisks.forEach(r => {
    console.log(`  ${c.warn('⚠')} [${r.category}] ${r.issue}`);
    console.log(`    ${c.dim('→')} ${r.suggestion}`);
  });

  if (risks.length === 0) {
    console.log(c.success('\n✓ No significant risks detected'));
  }

  console.log('\n' + '─'.repeat(50));
  console.log(c.bold('RISK SUMMARY'));
  console.log('─'.repeat(50));

  const overallRisk = highRisks.length > 0 ? 'HIGH' : mediumRisks.length > 0 ? 'MEDIUM' : 'LOW';
  const riskColor = overallRisk === 'HIGH' ? c.error : overallRisk === 'MEDIUM' ? c.warn : c.success;

  console.log(`\nContract: ${fileName}`);
  console.log(`Overall Risk: ${riskColor(overallRisk)}`);
  console.log(`\nHigh: ${highRisks.length} | Medium: ${mediumRisks.length} | Low: ${lowRisks.length}`);

  if (highRisks.length > 0) {
    console.log(c.warn('\nRecommendation: Address HIGH risks before proceeding.'));
    console.log(`Edit contract: afc agent architect EC ${fileName}`);
  } else {
    console.log(c.success('\n✓ Contract is acceptable for planning.'));
    console.log(`Next: afc plan ${fileName}`);
  }
  console.log('');
}

// ============================================================================
// GENERATE PLAN WORKFLOW (STRATEGIST)
// ============================================================================

async function runGeneratePlanWorkflow(rl, agentData, contractFile) {
  const agent = agentData.agent;

  console.log('\n' + c.heading('═'.repeat(50)));
  console.log(c.heading(`${agent.metadata.icon} GENERATE PLAN WORKFLOW`));
  console.log(c.heading('═'.repeat(50)));

  let targetFile = contractFile;
  if (!targetFile) {
    targetFile = await prompt(rl, 'Which contract to plan?');
  }

  const filePath = resolveContract(targetFile);
  const content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);

  console.log(`\n${c.agent(agent.metadata.name)} analyzing dependencies...`);

  // Extract files from contract
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

  console.log('\n' + '─'.repeat(50));
  console.log(c.bold('STEP 1: Dependency Analysis'));
  console.log('─'.repeat(50));

  // Simple dependency analysis based on file types
  const typeFiles = files.filter(f => f.path.includes('types') || f.path.includes('interfaces'));
  const hookFiles = files.filter(f => f.path.includes('hooks') || f.path.includes('use'));
  const compFiles = files.filter(f => f.path.includes('components'));
  const testFiles = files.filter(f => f.path.includes('test'));
  const otherFiles = files.filter(f =>
    !typeFiles.includes(f) && !hookFiles.includes(f) &&
    !compFiles.includes(f) && !testFiles.includes(f)
  );

  // Optimal order: types -> hooks -> components -> other -> tests
  const orderedFiles = [...typeFiles, ...hookFiles, ...compFiles, ...otherFiles, ...testFiles];

  console.log('\nOptimal implementation order:');
  orderedFiles.forEach((f, i) => {
    const deps = i === 0 ? 'none' : orderedFiles.slice(0, i).map(d => path.basename(d.path)).join(', ');
    console.log(`  ${i + 1}. ${c.info(f.action)}: ${f.path}`);
    console.log(`     ${c.dim('Dependencies:')} ${deps || 'none'}`);
  });

  console.log('\n' + '─'.repeat(50));
  console.log(c.bold('STEP 2: Generate Plan'));
  console.log('─'.repeat(50));

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
    files: orderedFiles.map((f, i) => ({
      order: i + 1,
      action: f.action,
      path: f.path,
      reason: f.reason,
      dependencies: i === 0 ? [] : [orderedFiles[i-1].path]
    })),
    rules: ['§typescript', '§hooks', '§testing'],
    checkpoints: [
      { after: Math.ceil(orderedFiles.length / 2), verify: 'Core functionality works' },
      { after: orderedFiles.length, verify: 'All tests pass' }
    ],
    status: 'pending_approval'
  };

  const planFile = fileName.replace('.fc.md', '.plan.yaml');
  const planPath = path.join(CONTRACTS_DIR, planFile);
  fs.writeFileSync(planPath, yaml.stringify(plan));

  console.log(c.success('\n✓ Plan generated with optimized file order'));
  console.log(`\nSaved: ${c.info('contracts/' + planFile)}`);
  console.log('\n' + yaml.stringify(plan));

  console.log('─'.repeat(50));
  console.log(`\nNext: afc approve ${fileName}`);
  console.log('');
}

// ============================================================================
// OPTIMIZE PLAN WORKFLOW
// ============================================================================

async function runOptimizePlanWorkflow(rl, agentData, contractFile) {
  const agent = agentData.agent;

  console.log('\n' + c.heading('═'.repeat(50)));
  console.log(c.heading(`${agent.metadata.icon} OPTIMIZE PLAN WORKFLOW`));
  console.log(c.heading('═'.repeat(50)));

  let targetFile = contractFile;
  if (!targetFile) {
    targetFile = await prompt(rl, 'Which plan to optimize?');
  }

  // Find plan file
  const planFile = targetFile.replace('.fc.md', '').replace('.plan.yaml', '') + '.plan.yaml';
  const planPath = path.join(CONTRACTS_DIR, planFile);

  if (!fs.existsSync(planPath)) {
    console.log(c.error(`\n✗ Plan not found: ${planFile}`));
    console.log('Generate a plan first: afc agent strategist GP');
    return;
  }

  const plan = yaml.parse(fs.readFileSync(planPath, 'utf8'));

  console.log('\nCurrent file order:');
  plan.files.forEach((f, i) => {
    console.log(`  ${i + 1}. ${f.path}`);
  });

  console.log('\n' + '─'.repeat(50));
  console.log(c.bold('Optimization Options'));
  console.log('─'.repeat(50));

  console.log('\n  1. Move tests to end');
  console.log('  2. Group by directory');
  console.log('  3. Prioritize types/interfaces');
  console.log('  4. Manual reorder');

  const choice = await prompt(rl, '\nSelect optimization (1-4)');

  let optimized = [...plan.files];

  switch (choice) {
    case '1':
      const tests = optimized.filter(f => f.path.includes('test'));
      const nonTests = optimized.filter(f => !f.path.includes('test'));
      optimized = [...nonTests, ...tests];
      break;
    case '2':
      optimized.sort((a, b) => path.dirname(a.path).localeCompare(path.dirname(b.path)));
      break;
    case '3':
      const types = optimized.filter(f => f.path.includes('type') || f.path.includes('interface'));
      const others = optimized.filter(f => !f.path.includes('type') && !f.path.includes('interface'));
      optimized = [...types, ...others];
      break;
    case '4':
      console.log('\nManual reorder not yet implemented.');
      console.log('Edit the plan file directly: contracts/' + planFile);
      return;
  }

  // Update order numbers
  optimized = optimized.map((f, i) => ({ ...f, order: i + 1 }));
  plan.files = optimized;
  plan.optimized_at = timestamp();

  fs.writeFileSync(planPath, yaml.stringify(plan));

  console.log(c.success('\n✓ Plan optimized'));
  console.log('\nNew order:');
  optimized.forEach((f, i) => {
    console.log(`  ${i + 1}. ${f.path}`);
  });
  console.log('');
}

// ============================================================================
// TEST SUITE WORKFLOW
// ============================================================================

async function runTestSuiteWorkflow(rl, agentData, contractFile) {
  const agent = agentData.agent;

  console.log('\n' + c.heading('═'.repeat(50)));
  console.log(c.heading(`${agent.metadata.icon} TEST SUITE WORKFLOW`));
  console.log(c.heading('═'.repeat(50)));

  let targetFile = contractFile;
  if (!targetFile) {
    targetFile = await prompt(rl, 'Which contract to generate tests for?');
  }

  const filePath = resolveContract(targetFile);
  const content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);

  console.log(`\n${c.agent(agent.metadata.name)} analyzing testable components...`);

  // Extract files
  const files = [];
  const filesMatch = content.match(/## Files[\s\S]*?\|[\s\S]*?(?=##|$)/);
  if (filesMatch) {
    const rows = filesMatch[0].split('\n').filter(r =>
      r.startsWith('|') && !r.includes('Action') && !r.includes('---')
    );
    rows.forEach(row => {
      const cols = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cols.length >= 2) {
        const filePath = cols[1].replace(/`/g, '');
        if (!filePath.includes('test') && !filePath.includes('-')) {
          files.push(filePath);
        }
      }
    });
  }

  console.log('\n' + '─'.repeat(50));
  console.log(c.bold('STEP 1: Test Analysis'));
  console.log('─'.repeat(50));

  console.log('\nFiles to test:');
  files.forEach((f, i) => {
    console.log(`  ${i + 1}. ${f}`);
  });

  console.log('\n' + '─'.repeat(50));
  console.log(c.bold('STEP 2: Generate Test Templates'));
  console.log('─'.repeat(50));

  const testTemplates = files.map(f => {
    const baseName = path.basename(f, path.extname(f));
    const isHook = baseName.startsWith('use');
    const isComponent = /^[A-Z]/.test(baseName);

    let template;
    if (isHook) {
      template = `import { renderHook, act } from '@testing-library/react-hooks';
import { ${baseName} } from '${f.replace(/\.tsx?$/, '')}';

describe('${baseName}', () => {
  it('should initialize correctly', () => {
    const { result } = renderHook(() => ${baseName}());
    expect(result.current).toBeDefined();
  });

  it('should handle state updates', () => {
    // TODO: Add state update tests
  });

  it('should handle errors gracefully', () => {
    // TODO: Add error handling tests
  });
});`;
    } else if (isComponent) {
      template = `import { render, screen } from '@testing-library/react';
import { ${baseName} } from '${f.replace(/\.tsx?$/, '')}';

describe('${baseName}', () => {
  it('should render correctly', () => {
    render(<${baseName} />);
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('should handle user interaction', () => {
    // TODO: Add interaction tests
  });
});`;
    } else {
      template = `import { ${baseName} } from '${f.replace(/\.tsx?$/, '')}';

describe('${baseName}', () => {
  it('should work correctly', () => {
    // TODO: Add tests
  });
});`;
    }

    return {
      source: f,
      testFile: f.replace(/\.tsx?$/, '.test.ts').replace('/hooks/', '/tests/').replace('/components/', '/tests/'),
      template
    };
  });

  console.log('\nGenerated test templates:');
  testTemplates.forEach((t, i) => {
    console.log(`\n${c.info((i + 1) + '. ' + t.testFile)}`);
    console.log(c.dim('─'.repeat(40)));
    console.log(c.dim(t.template.slice(0, 200) + '...'));
  });

  const shouldSave = await confirm(rl, '\nSave test templates to files?');

  if (shouldSave) {
    testTemplates.forEach(t => {
      const testPath = path.join(CWD, t.testFile);
      const testDir = path.dirname(testPath);
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      if (!fs.existsSync(testPath)) {
        fs.writeFileSync(testPath, t.template);
        console.log(c.success(`✓ Created: ${t.testFile}`));
      } else {
        console.log(c.warn(`⚠ Skipped (exists): ${t.testFile}`));
      }
    });
  }

  console.log(`\nRun tests: ${c.info('npm test')}`);
  console.log('');
}

// ============================================================================
// AUDIT WORKFLOW
// ============================================================================

async function runAuditWorkflow(rl, agentData, contractFile) {
  const agent = agentData.agent;

  console.log('\n' + c.heading('═'.repeat(50)));
  console.log(c.heading(`${agent.metadata.icon} AUDIT WORKFLOW`));
  console.log(c.heading('═'.repeat(50)));

  let targetFile = contractFile;
  if (!targetFile) {
    targetFile = await prompt(rl, 'Which contract to audit?');
  }

  const filePath = resolveContract(targetFile);
  const content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);

  console.log(`\n${c.agent(agent.metadata.name)} performing audit...`);

  // Load plan
  const planFile = fileName.replace('.fc.md', '.plan.yaml');
  const planPath = path.join(CONTRACTS_DIR, planFile);
  const plan = fs.existsSync(planPath) ? yaml.parse(fs.readFileSync(planPath, 'utf8')) : null;

  console.log('\n' + '─'.repeat(50));
  console.log(c.bold('STEP 1: File Verification'));
  console.log('─'.repeat(50));

  const fileResults = [];
  if (plan?.files) {
    plan.files.forEach(f => {
      const fullPath = path.join(CWD, f.path);
      const exists = fs.existsSync(fullPath);
      fileResults.push({ ...f, exists });

      if (f.action === 'create') {
        console.log(`  ${exists ? c.success('✓') : c.error('✗')} create: ${f.path}`);
      } else {
        console.log(`  ${exists ? c.success('~') : c.error('✗')} modify: ${f.path}`);
      }
    });
  }

  const missingFiles = fileResults.filter(f => !f.exists);

  console.log('\n' + '─'.repeat(50));
  console.log(c.bold('STEP 2: Quality Checks'));
  console.log('─'.repeat(50));

  const { execSync } = require('child_process');
  const checks = [];

  // Lint check
  try {
    execSync('npm run lint', { stdio: 'pipe', cwd: CWD });
    checks.push({ name: 'Lint', status: 'PASS', details: 'No errors' });
    console.log(`  ${c.success('✓')} Lint: passed`);
  } catch (e) {
    checks.push({ name: 'Lint', status: 'FAIL', details: e.message });
    console.log(`  ${c.error('✗')} Lint: failed`);
  }

  // Build check
  try {
    execSync('npm run build', { stdio: 'pipe', cwd: CWD });
    checks.push({ name: 'Build', status: 'PASS', details: 'Succeeded' });
    console.log(`  ${c.success('✓')} Build: passed`);
  } catch (e) {
    checks.push({ name: 'Build', status: 'FAIL', details: e.message });
    console.log(`  ${c.error('✗')} Build: failed`);
  }

  // Test check
  try {
    execSync('npm test', { stdio: 'pipe', cwd: CWD });
    checks.push({ name: 'Tests', status: 'PASS', details: 'All passed' });
    console.log(`  ${c.success('✓')} Tests: passed`);
  } catch (e) {
    checks.push({ name: 'Tests', status: 'FAIL', details: 'Some failed' });
    console.log(`  ${c.error('✗')} Tests: failed`);
  }

  console.log('\n' + '─'.repeat(50));
  console.log(c.bold('STEP 3: Audit Report'));
  console.log('─'.repeat(50));

  const allFilesPassed = missingFiles.length === 0;
  const allChecksPassed = checks.every(c => c.status === 'PASS');
  const overallStatus = allFilesPassed && allChecksPassed ? 'PASS' : 'FAIL';

  console.log(`\nContract: ${fileName}`);
  console.log(`Status: ${overallStatus === 'PASS' ? c.success(overallStatus) : c.error(overallStatus)}`);
  console.log(`\nFiles: ${fileResults.length - missingFiles.length}/${fileResults.length} present`);
  console.log(`Checks: ${checks.filter(c => c.status === 'PASS').length}/${checks.length} passed`);

  if (overallStatus === 'PASS') {
    // Update contract status
    let updatedContent = content.replace(/\*\*Status:\*\*\s*\w+/, '**Status:** complete');
    fs.writeFileSync(filePath, updatedContent);

    if (plan) {
      plan.status = 'complete';
      plan.completed_at = timestamp();
      fs.writeFileSync(planPath, yaml.stringify(plan));
    }

    console.log(c.success('\n✓ Audit passed! Contract marked complete.'));
  } else {
    console.log(c.error('\n✗ Audit failed. Issues need resolution.'));

    if (missingFiles.length > 0) {
      console.log(`\nMissing files:`);
      missingFiles.forEach(f => console.log(`  - ${f.path}`));
    }
  }
  console.log('');
}

// ============================================================================
// QUALITY CHECK WORKFLOW
// ============================================================================

async function runQualityCheckWorkflow(rl, agentData, contractFile) {
  const agent = agentData.agent;

  console.log('\n' + c.heading('═'.repeat(50)));
  console.log(c.heading(`${agent.metadata.icon} QUALITY CHECK WORKFLOW`));
  console.log(c.heading('═'.repeat(50)));

  console.log(`\n${c.agent(agent.metadata.name)} performing deep quality analysis...`);

  let targetFile = contractFile;
  if (!targetFile) {
    targetFile = await prompt(rl, 'Which contract to quality check?');
  }

  const filePath = resolveContract(targetFile);
  const fileName = path.basename(filePath);

  const planFile = fileName.replace('.fc.md', '.plan.yaml');
  const planPath = path.join(CONTRACTS_DIR, planFile);
  const plan = fs.existsSync(planPath) ? yaml.parse(fs.readFileSync(planPath, 'utf8')) : null;

  if (!plan?.files) {
    console.log(c.warn('\nNo plan found. Generate a plan first.'));
    return;
  }

  console.log('\n' + '─'.repeat(50));
  console.log(c.bold('Code Quality Analysis'));
  console.log('─'.repeat(50));

  for (const file of plan.files) {
    const fullPath = path.join(CWD, file.path);
    if (!fs.existsSync(fullPath)) continue;

    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split('\n');

    console.log(`\n${c.info(file.path)}`);

    // Basic metrics
    console.log(`  Lines: ${lines.length}`);
    console.log(`  Functions: ${(content.match(/function\s+\w+|=>\s*{|=>\s*\(/g) || []).length}`);

    // Quality warnings
    const warnings = [];
    if (lines.length > 300) warnings.push('File is long (>300 lines)');
    if (content.includes('any')) warnings.push('Uses "any" type');
    if (content.includes('TODO')) warnings.push('Contains TODO comments');
    if (content.includes('console.log')) warnings.push('Contains console.log');
    if (!content.includes('export')) warnings.push('No exports found');

    if (warnings.length > 0) {
      console.log(`  ${c.warn('Warnings:')}`);
      warnings.forEach(w => console.log(`    - ${w}`));
    } else {
      console.log(`  ${c.success('✓ No quality issues')}`);
    }
  }

  console.log('\n' + '─'.repeat(50));
  console.log('Quality check complete.\n');
}

// ============================================================================
// QUICK SPEC WORKFLOW
// ============================================================================

async function runQuickSpecWorkflow(rl, agentData) {
  const agent = agentData.agent;

  console.log('\n' + c.heading('═'.repeat(50)));
  console.log(c.heading(`${agent.metadata.icon} QUICK SPEC WORKFLOW`));
  console.log(c.heading('═'.repeat(50)));

  console.log(`\n${c.agent(agent.metadata.name)}: Let's create a quick spec. Just 4 questions.\n`);

  // Question 1: What's the change?
  const change = await prompt(rl, 'What\'s the change? (one sentence)');
  if (!change) {
    console.log(c.error('Change description required.'));
    return;
  }

  // Question 2: Which files?
  const filesInput = await prompt(rl, 'Which files? (comma-separated, max 3)');
  const files = filesInput.split(',').map(f => f.trim()).filter(Boolean).slice(0, 3);

  if (files.length === 0) {
    console.log(c.error('At least one file required.'));
    return;
  }

  if (files.length > 3) {
    console.log(c.warn('\n⚠ More than 3 files specified.'));
    const escalate = await confirm(rl, 'This may be too large for quick flow. Escalate to full contract?');
    if (escalate) {
      console.log('\nUse: afc agent architect CC');
      return;
    }
  }

  // Question 3: Test criteria
  const test = await prompt(rl, 'How will we know it works?', 'It works as expected');

  // Question 4: Risks
  const risk = await prompt(rl, 'Any risks?', 'none');

  // Generate quick contract
  console.log('\n' + '─'.repeat(50));
  console.log(c.bold('QUICK SPEC SUMMARY'));
  console.log('─'.repeat(50));

  console.log(`\nChange: ${change}`);
  console.log(`Files: ${files.join(', ')}`);
  console.log(`Test: ${test}`);
  console.log(`Risk: ${risk}`);

  const shouldGenerate = await confirm(rl, '\nGenerate quick contract?');

  if (!shouldGenerate) {
    console.log('Cancelled.');
    return;
  }

  ensureContractsDir();
  const id = `QFC-${Date.now()}`;
  const featureSlug = slug(change.split(' ').slice(0, 3).join('-'));
  const fileName = `${featureSlug}.quick.md`;
  const fullPath = path.join(CONTRACTS_DIR, fileName);

  const filesTable = files.map(f => `| modify | \`${f}\` |`).join('\n');

  const quickContract = `# QFC: ${change}
**ID:** ${id} | **Status:** approved

## Change
${change}

## Files
| Action | Path |
|--------|------|
${filesTable}

## Done When
- [ ] ${test}
- [ ] Tests pass
- [ ] Lint passes

## Risk
${risk}
`;

  fs.writeFileSync(fullPath, quickContract);

  console.log(c.success(`\n✓ Quick contract created: contracts/${fileName}`));
  console.log(c.info('Status: approved (auto)'));
  console.log(`\nReady to implement! Run:`);
  console.log(`  afc agent quick QD ${fileName}`);
  console.log('');
}

// ============================================================================
// QUICK DEV WORKFLOW
// ============================================================================

async function runQuickDevWorkflow(rl, agentData, contractFile) {
  const agent = agentData.agent;

  console.log('\n' + c.heading('═'.repeat(50)));
  console.log(c.heading(`${agent.metadata.icon} QUICK DEV WORKFLOW`));
  console.log(c.heading('═'.repeat(50)));

  let targetFile = contractFile;
  if (!targetFile) {
    // List quick contracts
    ensureContractsDir();
    const quickContracts = fs.readdirSync(CONTRACTS_DIR).filter(f => f.endsWith('.quick.md'));

    if (quickContracts.length === 0) {
      console.log(c.warn('\nNo quick contracts found.'));
      console.log('Create one first: afc agent quick QS');
      return;
    }

    console.log('\nQuick contracts:');
    quickContracts.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
    const choice = await prompt(rl, '\nWhich quick contract? (number or filename)');
    targetFile = isNaN(choice) ? choice : quickContracts[parseInt(choice) - 1];
  }

  const filePath = resolveContract(targetFile);
  const content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);

  // Extract info
  const changeMatch = content.match(/## Change\n(.+)/);
  const change = changeMatch ? changeMatch[1] : fileName;

  const filesMatch = content.match(/## Files[\s\S]*?\|[\s\S]*?(?=##|$)/);
  const files = [];
  if (filesMatch) {
    const rows = filesMatch[0].split('\n').filter(r =>
      r.startsWith('|') && !r.includes('Action') && !r.includes('---')
    );
    rows.forEach(row => {
      const cols = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cols.length >= 2) {
        files.push({ action: cols[0], path: cols[1].replace(/`/g, '') });
      }
    });
  }

  console.log(`\n${c.agent(agent.metadata.name)}: Quick implementation mode.`);

  console.log('\n' + '─'.repeat(50));
  console.log(c.bold('IMPLEMENTATION INSTRUCTIONS'));
  console.log('─'.repeat(50));

  const instructions = `
## Quick Implementation: ${change}

### Files to modify
${files.map((f, i) => `${i + 1}. ${f.path}`).join('\n')}

### Instructions
1. Make the following change: ${change}
2. Keep changes minimal and focused
3. Run tests after changes
4. Commit when done

### After implementation
Run: afc audit ${fileName.replace('.quick.md', '.fc.md')}
`;

  console.log(instructions);

  console.log('─'.repeat(50));
  console.log('\nCopy the above to your AI assistant.');
  console.log('');
}

async function executeAgentCommand(agentName, command, args) {
  const agentData = loadAgent(agentName);
  if (!agentData) {
    console.log(`✗ Agent not found: ${agentName}`);
    console.log('\nAvailable agents:');
    const agents = listAgents();
    agents.forEach(a => console.log(`  ${a.icon} ${a.name} (${a.title})`));
    process.exit(1);
  }

  // If no command, just display agent info
  if (!command) {
    displayAgent(agentData);
    return;
  }

  // Find menu item
  const menu = agentData.agent.menu || [];
  const menuItem = menu.find(m =>
    m.trigger.toLowerCase() === command.toLowerCase() ||
    m.command.toLowerCase() === command.toLowerCase()
  );

  if (!menuItem) {
    console.log(`✗ Unknown command: ${command}`);
    console.log(`\nAvailable commands for ${agentData.agent.metadata.name}:`);
    menu.forEach(m => console.log(`  ${m.description}`));
    process.exit(1);
  }

  // Create readline interface for interactive prompts
  const rl = createPromptInterface();

  try {
    // Route to appropriate workflow
    switch (menuItem.command) {
      case 'create-contract':
        await runCreateContractWorkflow(rl, agentData);
        break;
      case 'edit-contract':
        await runEditContractWorkflow(rl, agentData, args[0]);
        break;
      case 'validate-contract':
        await runValidateContractWorkflow(rl, agentData, args[0]);
        break;
      case 'risk-check':
        await runRiskCheckWorkflow(rl, agentData, args[0]);
        break;
      case 'generate-plan':
        await runGeneratePlanWorkflow(rl, agentData, args[0]);
        break;
      case 'optimize-plan':
        await runOptimizePlanWorkflow(rl, agentData, args[0]);
        break;
      case 'execute-contract':
        await runExecuteContractWorkflow(rl, agentData, args[0]);
        break;
      case 'test-suite':
        await runTestSuiteWorkflow(rl, agentData, args[0]);
        break;
      case 'audit':
        await runAuditWorkflow(rl, agentData, args[0]);
        break;
      case 'quality-check':
        await runQualityCheckWorkflow(rl, agentData, args[0]);
        break;
      case 'quick-spec':
        await runQuickSpecWorkflow(rl, agentData);
        break;
      case 'quick-dev':
        await runQuickDevWorkflow(rl, agentData, args[0]);
        break;
      default:
        console.log(`\nWorkflow: ${menuItem.command}`);
        console.log(`Agent: ${agentData.agent.metadata.name}`);
        console.log(`\nThis workflow is defined but not yet implemented.`);
        console.log(`See: ${menuItem.workflow}`);
    }
  } finally {
    rl.close();
  }
}

// ============================================================================
// VALIDATION
// ============================================================================

function validateContract(content) {
  const errors = [];
  const warnings = [];
  const suggestions = [];

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

  // Check for vague/unbounded terms
  const vagueTerms = ['improve', 'optimize', 'enhance', 'better', 'faster', 'refactor', 'clean up', 'fix issues'];
  const objectiveSection = content.match(/## Objective[\s\S]*?(?=##|$)/)?.[0] || '';
  const scopeSection = content.match(/## Scope[\s\S]*?(?=##|$)/)?.[0] || '';

  vagueTerms.forEach(term => {
    if (objectiveSection.toLowerCase().includes(term)) {
      warnings.push(`Vague term in Objective: "${term}" - add specific metrics`);
    }
    if (scopeSection.toLowerCase().includes(term)) {
      warnings.push(`Vague term in Scope: "${term}" - be more specific`);
    }
  });

  // Check scope size
  const scopeItems = (scopeSection.match(/^- .+$/gm) || []).length;
  if (scopeItems > 7) {
    errors.push(`Scope too large (${scopeItems} items) - max 7 recommended`);
  } else if (scopeItems > 5) {
    warnings.push(`Large scope (${scopeItems} items) - consider splitting`);
  }

  // Check file count
  const fileRows = (filesSection.match(/^\|[^|]+\|/gm) || []).length - 2;
  if (fileRows > 15) {
    errors.push(`Too many files (${fileRows}) - consider splitting contract`);
  } else if (fileRows > 10) {
    warnings.push(`Many files (${fileRows}) - consider phased implementation`);
  }

  // Check for test files
  if (!filesSection.includes('test')) {
    warnings.push('No test files in Files section');
  }

  // Check Done When section has checkboxes
  const doneWhenSection = content.match(/## Done When[\s\S]*?(?=##|$)/)?.[0] || '';
  const checkboxCount = (doneWhenSection.match(/- \[ \]/g) || []).length;
  if (checkboxCount === 0) {
    warnings.push('Done When has no checkboxes - add verifiable criteria');
  } else if (checkboxCount < 3) {
    suggestions.push('Consider adding more Done When criteria');
  }

  // Warnings for missing optional sections
  if (!content.includes('## Testing')) {
    warnings.push('No testing section defined');
  }
  if (!content.includes('Context Refs')) {
    warnings.push('No context references defined');
  }
  if (!content.includes('## Non-Goals')) {
    suggestions.push('Consider adding Non-Goals section to clarify boundaries');
  }

  // Check for placeholder text
  const placeholders = ['[NAME]', '[ID]', '[TODO]', '[TBD]', '[FILL]'];
  placeholders.forEach(p => {
    if (content.includes(p)) {
      errors.push(`Placeholder not filled: ${p}`);
    }
  });

  // ============================================================================
  // SECURITY CHECKS
  // ============================================================================

  // Check for Security Considerations section
  const hasSecuritySection = content.includes('## Security Considerations');
  if (!hasSecuritySection) {
    warnings.push('Missing Security Considerations section');
  } else {
    const securitySection = content.match(/## Security Considerations[\s\S]*?(?=##|$)/)?.[0] || '';
    const securityChecks = (securitySection.match(/- \[ \]/g) || []).length;
    if (securityChecks === 0) {
      warnings.push('Security section has no checklist items');
    }
  }

  // Check for security-sensitive patterns in scope
  const securityPatterns = ['auth', 'login', 'password', 'token', 'credential', 'secret', 'api key', 'payment', 'credit card', 'ssn', 'pii'];
  const lowerContent = content.toLowerCase();
  const foundSecurityPatterns = securityPatterns.filter(p => lowerContent.includes(p));

  if (foundSecurityPatterns.length > 0 && !hasSecuritySection) {
    errors.push(`Security-sensitive feature (${foundSecurityPatterns.join(', ')}) requires Security Considerations section`);
  }

  // Check for dangerous patterns that should never be in allowed dependencies
  const dangerousPatterns = ['eval', 'child_process', 'vm', 'crypto'];
  const depsSection = content.match(/## Dependencies[\s\S]*?(?=##|$)/)?.[0] || '';
  dangerousPatterns.forEach(p => {
    if (depsSection.toLowerCase().includes(p) && depsSection.includes('Allowed')) {
      warnings.push(`Potentially dangerous dependency pattern: ${p} - ensure proper review`);
    }
  });

  // ============================================================================
  // CODE QUALITY CHECKS
  // ============================================================================

  // Check for Code Quality section
  const hasQualitySection = content.includes('## Code Quality');
  if (!hasQualitySection) {
    suggestions.push('Consider adding Code Quality checklist section');
  }

  // Check for 80% coverage requirement in Done When
  const has80Coverage = doneWhenSection.includes('80%') || doneWhenSection.includes('80+');
  if (!has80Coverage) {
    warnings.push('Done When should include 80%+ coverage requirement');
  }

  // Check for lint requirement in Done When
  const hasLintCheck = doneWhenSection.toLowerCase().includes('lint');
  if (!hasLintCheck) {
    warnings.push('Done When should include lint check');
  }

  // Check for npm audit mention in security-sensitive contracts
  if (foundSecurityPatterns.length > 0) {
    const hasAudit = content.includes('npm audit') || content.includes('security scan');
    if (!hasAudit) {
      warnings.push('Security-sensitive feature should include npm audit requirement');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    suggestions,
    stats: {
      scopeItems,
      fileCount: fileRows,
      checkboxCount,
      hasSecuritySection,
      hasQualitySection,
      securitySensitive: foundSecurityPatterns.length > 0
    }
  };
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
  const fileName = path.basename(filePath);

  console.log(c.heading(`\nValidating: ${fileName}`));
  console.log('─'.repeat(50));

  // Stats
  if (result.stats) {
    console.log(`\n${c.dim('Stats:')} ${result.stats.scopeItems} scope items, ${result.stats.fileCount} files, ${result.stats.checkboxCount} done-when criteria`);
  }

  if (result.errors.length > 0) {
    console.log(`\n${c.error('✗ Errors (' + result.errors.length + '):')} `);
    result.errors.forEach(e => console.log(`  ${c.error('•')} ${e}`));
  }

  if (result.warnings.length > 0) {
    console.log(`\n${c.warn('⚠ Warnings (' + result.warnings.length + '):')} `);
    result.warnings.forEach(w => console.log(`  ${c.warn('•')} ${w}`));
  }

  if (result.suggestions && result.suggestions.length > 0) {
    console.log(`\n${c.info('💡 Suggestions:')}`);
    result.suggestions.forEach(s => console.log(`  ${c.dim('•')} ${s}`));
  }

  console.log('\n' + '─'.repeat(50));

  if (result.valid) {
    if (result.warnings.length > 0) {
      console.log(c.warn('✓ Validation passed with warnings'));
    } else {
      console.log(c.success('✓ Validation passed'));
    }
    console.log(`\nNext: ${c.info('afc plan ' + fileName)}`);
  } else {
    console.log(c.error('✗ Validation failed - fix errors above'));
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

function agentList() {
  const agents = listAgents();

  if (agents.length === 0) {
    console.log('No agents found.');
    return;
  }

  console.log('\n' + '═'.repeat(50));
  console.log('AVAILABLE AGENTS');
  console.log('═'.repeat(50) + '\n');

  agents.forEach(a => {
    console.log(`  ${a.icon} ${a.name} - ${a.title}`);
    console.log(`     ${a.capabilities}`);
    console.log(`     Usage: afc agent ${a.name.toLowerCase()}`);
    console.log('');
  });

  console.log('─'.repeat(50));
  console.log('Use: afc agent <name> to load an agent');
  console.log('Use: afc agent <name> <command> to run a workflow');
  console.log('');
}

async function agent() {
  const agentName = process.argv[3];
  const command = process.argv[4];
  const commandArgs = process.argv.slice(5).filter(a => !a.startsWith('--'));

  if (!agentName || agentName === 'list') {
    agentList();
    return;
  }

  await executeAgentCommand(agentName, command, commandArgs);
}

async function quick() {
  const name = process.argv[3];
  const rl = createPromptInterface();

  try {
    const agentData = loadAgent('quick');
    if (!agentData) {
      console.log(c.error('Quick Flow agent not found'));
      return;
    }

    if (!name) {
      // Run quick spec workflow
      await runQuickSpecWorkflow(rl, agentData);
    } else {
      // Run quick dev with the specified contract
      await runQuickDevWorkflow(rl, agentData, name);
    }
  } finally {
    rl.close();
  }
}

async function party() {
  console.log('\n' + c.heading('═'.repeat(50)));
  console.log(c.heading('🎉 PARTY MODE - Full Team'));
  console.log(c.heading('═'.repeat(50)));

  const agents = listAgents();

  console.log('\nLoading the full team...\n');
  agents.forEach(a => {
    console.log(`  ${a.icon} ${c.agent(a.name)} - ${a.title}`);
  });

  console.log('\n' + '─'.repeat(50));
  console.log(c.bold('TEAM WORKFLOW'));
  console.log('─'.repeat(50));

  console.log(`
Party mode enables sequential agent handoffs:

  1. ${c.agent('Archie')} creates the contract (CC)
  2. ${c.agent('Val')} validates and checks risks (VC, RC)
  3. ${c.agent('Sage')} generates optimized plan (GP)
  4. ${c.agent('Dev')} executes the contract (EX)
  5. ${c.agent('Iris')} audits the result (AU)

To start, run:
  afc agent architect CC

After each step, the agent will suggest the next action.
`);
}

async function workflow() {
  const workflowName = process.argv[3];

  if (!workflowName) {
    // List available workflows
    console.log('\n' + c.heading('Available Workflows'));
    console.log('─'.repeat(50));

    const workflows = fs.readdirSync(WORKFLOWS_DIR).filter(f =>
      fs.statSync(path.join(WORKFLOWS_DIR, f)).isDirectory()
    );

    workflows.forEach(w => {
      const workflowFile = path.join(WORKFLOWS_DIR, w, 'workflow.yaml');
      if (fs.existsSync(workflowFile)) {
        const wf = yaml.parse(fs.readFileSync(workflowFile, 'utf8'));
        console.log(`  ${c.info(w)}`);
        console.log(`    ${c.dim(wf.description || 'No description')}`);
      }
    });

    console.log('\nUsage: afc workflow <name>');
    return;
  }

  // Load and display workflow
  const workflowFile = path.join(WORKFLOWS_DIR, workflowName, 'workflow.yaml');
  if (!fs.existsSync(workflowFile)) {
    console.log(c.error(`Workflow not found: ${workflowName}`));
    return;
  }

  const wf = yaml.parse(fs.readFileSync(workflowFile, 'utf8'));

  console.log('\n' + c.heading('═'.repeat(50)));
  console.log(c.heading(`Workflow: ${wf.name}`));
  console.log(c.heading('═'.repeat(50)));

  console.log(`\n${wf.description}`);
  console.log(`\nAgent: ${wf.agent}`);
  console.log('\nSteps:');
  wf.steps?.forEach((s, i) => {
    console.log(`  ${i + 1}. ${s.goal}`);
  });

  console.log(`\nRun via agent: afc agent ${wf.agent}`);
}

function resume() {
  const progressList = listProgress();

  if (progressList.length === 0) {
    console.log(c.dim('\nNo saved progress found.'));
    console.log('Start a workflow with: afc agent <name> <command>');
    return;
  }

  console.log('\n' + c.heading('Saved Progress'));
  console.log('─'.repeat(50));

  progressList.forEach((p, i) => {
    const ago = Math.round((Date.now() - new Date(p.timestamp).getTime()) / 60000);
    console.log(`  ${i + 1}. ${c.info(p.workflow)}`);
    console.log(`     Step: ${p.step} | ${c.dim(ago + ' minutes ago')}`);
  });

  console.log('\n' + c.dim('To resume, re-run the workflow command.'));
  console.log(c.dim('To clear: delete .afc-progress/ directory'));
}

function help() {
  console.log(`
${c.heading('AI Feature Contracts - CLI')}

${c.bold('Core Commands:')}
  afc init                  Initialize in current project
  afc create <name>         Create new contract
  afc validate <file>       Validate contract
  afc plan <file>           Generate plan (Phase 1)
  afc approve <file>        Approve for execution
  afc execute <file>        Execute instructions (Phase 2)
  afc audit <file>          Post-execution audit
  afc list                  List all contracts

${c.bold('Agent Commands:')}
  afc agent list            List available agents
  afc agent <name>          Load agent and show menu
  afc agent architect       ${c.dim('Archie - Contract creation')}
  afc agent validator       ${c.dim('Val - Validation & risk analysis')}
  afc agent strategist      ${c.dim('Sage - Plan generation')}
  afc agent dev             ${c.dim('Dev - Contract execution')}
  afc agent auditor         ${c.dim('Iris - Post-execution audit')}
  afc agent quick           ${c.dim('Flash - Quick flow for small changes')}

${c.bold('Quick Commands:')}
  afc quick                 Create quick spec (fast track)
  afc quick <file>          Implement quick spec
  afc party                 Load full team (multi-agent)
  afc workflow <name>       View/run workflow directly

${c.bold('Options:')}
  --output <mode>           Output mode: console, file, or both

${c.bold('Workflow (Traditional):')}
  1. afc create "feature"   → Create contract
  2. afc validate           → Validate
  3. afc plan               → Generate plan
  4. afc approve            → Approve
  5. afc execute            → Get instructions
  6. [Implement]            → Code with AI
  7. afc audit              → Verify

${c.bold('Workflow (Agent-Assisted):')}
  1. afc agent architect CC → Interactive creation
  2. afc agent validator VC → Validate + risk check
  3. afc agent strategist GP→ Optimized plan
  4. afc approve            → Approve
  5. afc agent dev EX       → Execute
  6. afc agent auditor AU   → Audit

${c.bold('Quick Workflow (Small Changes):')}
  1. afc quick              → Create quick spec (4 questions)
  2. afc quick <file>       → Implement immediately
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
  create: () => create(args.join(' ').replace(/--output.*$/, '').trim() || 'new-feature'),
  validate: () => validate(args[0]),
  plan: () => plan(args[0]),
  approve: () => approve(args[0]),
  execute: () => execute(args[0]),
  audit: () => audit(args[0]),
  list,
  agent,
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
