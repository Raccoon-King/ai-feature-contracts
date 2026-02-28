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

// Paths
const PKG_ROOT = path.join(__dirname, '..');
const TEMPLATES_DIR = path.join(PKG_ROOT, 'templates');
const DOCS_DIR = path.join(PKG_ROOT, 'docs');
const AGENTS_DIR = path.join(PKG_ROOT, 'agents');
const WORKFLOWS_DIR = path.join(PKG_ROOT, 'workflows');
const CWD = process.cwd();
const CONTRACTS_DIR = path.join(CWD, 'contracts');

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

  console.log('\n' + '═'.repeat(50));
  console.log('CREATE CONTRACT WORKFLOW');
  console.log('═'.repeat(50));
  console.log('\nLet\'s create a new feature contract through conversation.\n');

  // Step 1: Interview
  console.log('─'.repeat(50));
  console.log('STEP 1: Feature Interview');
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
  console.log('STEP 3: Finalize Contract');
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

  console.log('\n' + '═'.repeat(50));
  console.log('CONTRACT CREATED');
  console.log('═'.repeat(50));
  console.log(`\nFile: contracts/${fileName}`);
  console.log(`ID: ${id}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Review the contract: contracts/${fileName}`);
  console.log(`  2. Validate: afc validate ${fileName}`);
  console.log(`  3. Plan: afc plan ${fileName}`);
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
    if (menuItem.command === 'create-contract') {
      await runCreateContractWorkflow(rl, agentData);
    } else if (menuItem.command === 'validate-contract') {
      await runValidateContractWorkflow(rl, agentData, args[0]);
    } else if (menuItem.command === 'execute-contract') {
      await runExecuteContractWorkflow(rl, agentData, args[0]);
    } else {
      // Generic workflow message
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

Agent Commands:
  afc agent list            List available agents
  afc agent <name>          Load agent and show menu
  afc agent architect       Load Contract Architect (Archie)
  afc agent architect CC    Create Contract workflow
  afc agent validator       Load Scope Validator (Val)
  afc agent validator VC    Validate Contract workflow
  afc agent dev             Load Dev Agent (Dev)
  afc agent dev EX          Execute Contract workflow

Options:
  --output <mode>           Output mode: console, file, or both (default: both)

Workflow (Traditional):
  1. afc init                    # First time setup
  2. afc create "my-feature"     # Create contract
  3. Edit contracts/my-feature.fc.md
  4. afc validate my-feature.fc.md
  5. afc plan my-feature.fc.md
  6. afc approve my-feature.fc.md
  7. afc execute my-feature.fc.md
  8. [Implement with Cline/Claude]
  9. afc audit my-feature.fc.md

Workflow (Agent-Assisted):
  1. afc agent architect CC      # Interactive contract creation
  2. afc agent validator VC      # Validate with recommendations
  3. afc plan my-feature.fc.md   # Generate plan
  4. afc approve my-feature.fc.md
  5. afc agent dev EX            # Execute with Dev agent
  6. afc audit my-feature.fc.md

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
  create: () => create(args.join(' ').replace(/--output.*$/, '').trim() || 'new-feature'),
  validate: () => validate(args[0]),
  plan: () => plan(args[0]),
  approve: () => approve(args[0]),
  execute: () => execute(args[0]),
  audit: () => audit(args[0]),
  list,
  agent,
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
