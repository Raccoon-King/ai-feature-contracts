const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const readline = require('readline');
const { inferCreateRequest } = require('./commands.cjs');
const { loadConfig: loadRepoConfig, getContractsDirectory, getTrackingMode } = require('./config.cjs');
const { selectPersonaForTask } = require('./personas.cjs');
const { buildTaskBrief, getTaskBriefPath } = require('./task-brief.cjs');
const {
  parseTicketInput,
  mergeTicketInput,
  getWizardQuestions,
  applyWizardAnswer,
  validateTicket,
  buildTicketMarkdown,
} = require('./ticket-intake.cjs');
const {
  getTaskDefaults,
  normalizeDoneWhen,
  buildTaskContract,
  buildExecutionBrief,
  buildAuditChecklist,
  getExecutionBriefPath,
  getAuditChecklistPath,
  getSessionPath,
  buildSessionSummary,
} = require('./task-artifacts.cjs');
const { parseWorkItemId } = require('./id-utils.cjs');
const { createWorkflowTracker } = require('./progress.cjs');
const { generateSmartPrompts } = require('./smart-prompts.cjs');

const FEATURE_REQUEST_TRIGGER_RE = /\b(build|implement|create|change|fix|add|remove|update)\b/i;
const CONTRACT_REFERENCE_RE = /\b(?:contracts[\\/])?([A-Za-z][A-Za-z0-9]+-\d+)\.fc\.md\b/i;

function extractReferencedContract(request = '') {
  const match = String(request || '').match(CONTRACT_REFERENCE_RE);
  if (!match) return null;
  const ticketId = parseWorkItemId(match[1]);
  if (!ticketId) return null;
  return {
    ticketId,
    fileName: `${ticketId}.fc.md`,
    path: `contracts/${ticketId}.fc.md`,
  };
}

function shouldRouteFeatureRequest(request = '') {
  const normalized = String(request || '').trim();
  if (!normalized) return false;
  return FEATURE_REQUEST_TRIGGER_RE.test(normalized) && !extractReferencedContract(normalized);
}

function createWorkflowRuntime(deps) {
  const { c, outputMode, pkgRoot, cwd, commandHandlers } = deps;
  const AGENTS_DIR = path.join(pkgRoot, 'agents');
  const WORKFLOWS_DIR = path.join(pkgRoot, 'workflows');
  const repoConfig = loadRepoConfig(cwd);
  const CONTRACTS_DIR = getContractsDirectory(cwd, repoConfig);
  const TRACKING_MODE = getTrackingMode(repoConfig, cwd);
  const PROGRESS_DIR = path.join(cwd, '.grabby-progress');

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

async function resolveInputValue(rl, providedValue, question, defaultValue = '') {
  if (providedValue !== undefined && providedValue !== null) {
    return providedValue;
  }
  return prompt(rl, question, defaultValue);
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
  if (outputMode === 'console' || outputMode === 'both') {
    console.log(content);
  }
  if ((outputMode === 'file' || outputMode === 'both') && filePath) {
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

  console.log('\n' + '-'.repeat(50));
  console.log(`${metadata.icon} ${metadata.name} - ${metadata.title}`);
  console.log('-'.repeat(50));

  if (greeting) {
    console.log('\n' + greeting.trim());
  }

  console.log('\n' + '-'.repeat(50));
  console.log('MENU');
  console.log('-'.repeat(50));

  if (menu && menu.length > 0) {
    menu.forEach(item => {
      console.log(`  ${item.description}`);
    });
  }

  console.log('\n' + '-'.repeat(50));
  console.log('Usage: grabby agent ' + metadata.name.toLowerCase() + ' <command>');
  console.log('Example: grabby agent ' + metadata.name.toLowerCase() + ' ' + (menu?.[0]?.trigger || 'CC'));
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

  console.log('\n' + c.heading('-'.repeat(50)));
  console.log(c.heading('CREATE CONTRACT WORKFLOW'));
  console.log(c.heading('-'.repeat(50)));
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
  console.log('\n' + '-'.repeat(50));
  console.log(c.bold('STEP 1: Feature Interview'));
  console.log('-'.repeat(50) + '\n');

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
  console.log('\n' + '-'.repeat(50));
  console.log('STEP 2: Scope Definition');
  console.log('-'.repeat(50) + '\n');

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
    const hookName = `use${featureName
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join('')}`;
    files.push(
      { action: 'create', path: `src/hooks/${hookName}.ts`, reason: 'Main hook' },
      { action: 'create', path: `src/tests/${hookName}.test.ts`, reason: 'Unit tests' }
    );
    console.log(`\nUsing default files: ${files.map(f => f.path).join(', ')}`);
  }

  const dependencies = await prompt(rl, 'Any new dependencies needed?', 'none');

  // Step 3: Finalize
  console.log('\n' + '-'.repeat(50));
  console.log(c.bold('STEP 3: Finalize Contract'));
  console.log('-'.repeat(50) + '\n');

  const doneCriteriaInput = await prompt(rl, 'What conditions must be true when done?', 'Feature works as specified, Tests pass, Lint passes, Build succeeds');
  const doneCriteria = doneCriteriaInput.split(',').map(s => s.trim()).filter(Boolean);

  const testingInput = await prompt(rl, 'What tests are needed? (e.g., unit:src/tests/feature.test.ts)', '');

  // Show summary
  console.log('\n' + '-'.repeat(50));
  console.log('CONTRACT SUMMARY');
  console.log('-'.repeat(50));
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

  console.log('\n' + c.heading('-'.repeat(50)));
  console.log(c.heading('CONTRACT CREATED'));
  console.log(c.heading('-'.repeat(50)));
  console.log(`\nFile: ${c.info('contracts/' + fileName)}`);
  console.log(`ID: ${c.dim(id)}`);
  console.log(`Template: ${c.dim(templateName)}`);
  console.log(`\n${c.bold('Next steps:')}`);
  console.log(`  1. Review the contract: ${c.dim('contracts/' + fileName)}`);
  console.log(`  2. Validate: ${c.info('grabby validate ' + fileName)}`);
  console.log(`  3. Plan: ${c.info('grabby plan ' + fileName)}`);
  console.log('');
}

async function runValidateContractWorkflow(rl, agentData, contractFile) {
  const agent = agentData.agent;

  console.log('\n' + '-'.repeat(50));
  console.log(`${agent.metadata.icon} VALIDATE CONTRACT WORKFLOW`);
  console.log('-'.repeat(50));

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

  console.log('\n' + '-'.repeat(50));
  console.log('STEP 1: Structure Validation');
  console.log('-'.repeat(50));

  const required = ['Objective', 'Scope', 'Directories', 'Files', 'Done When'];
  const recommended = ['Non-Goals', 'Testing', 'Context Refs'];

  console.log('\nRequired sections:');
  required.forEach(s => {
    const present = content.includes(`## ${s}`);
    console.log(`  ${present ? '?' : '?'} ${s}`);
  });

  console.log('\nRecommended sections:');
  recommended.forEach(s => {
    const present = content.includes(`## ${s}`) || content.includes(s);
    console.log(`  ${present ? '?' : '?'} ${s}`);
  });

  console.log('\n' + '-'.repeat(50));
  console.log('STEP 2: Scope Analysis');
  console.log('-'.repeat(50));

  // Check directories
  const filesSection = content.match(/## Files[\s\S]*?(?=##|$)/)?.[0] || '';
  const restricted = ['backend/', 'node_modules/', '.env'];
  let hasRestrictedViolation = false;

  console.log('\nDirectory boundary check:');
  restricted.forEach(r => {
    if (filesSection.includes(r)) {
      console.log(`  ? Restricted: ${r} found in Files section`);
      hasRestrictedViolation = true;
    }
  });
  if (!hasRestrictedViolation) {
    console.log('  ? No restricted directory violations');
  }

  // Check dependencies
  const banned = ['moment', 'lodash', 'jquery'];
  const depsSection = content.match(/## Dependencies[\s\S]*?(?=##|$)/)?.[0] || '';
  let hasBannedDeps = false;

  console.log('\nDependency check:');
  banned.forEach(b => {
    if (depsSection.toLowerCase().includes(b) && !depsSection.includes('Banned')) {
      console.log(`  ? Banned: ${b} detected`);
      hasBannedDeps = true;
    }
  });
  if (!hasBannedDeps) {
    console.log('  ? No banned dependencies');
  }

  console.log('\n' + '-'.repeat(50));
  console.log('STEP 3: Validation Report');
  console.log('-'.repeat(50));

  const status = result.valid ? (result.warnings.length > 0 ? 'WARNINGS' : 'PASS') : 'FAIL';

  console.log(`\nContract: ${fileName}`);
  console.log(`Status: ${status}`);
  console.log(`Errors: ${result.errors.length}`);
  console.log(`Warnings: ${result.warnings.length}`);

  if (result.errors.length > 0) {
    console.log('\n? Errors (must fix):');
    result.errors.forEach(e => console.log(`  - ${e}`));
  }

  if (result.warnings.length > 0) {
    console.log('\n? Warnings (should consider):');
    result.warnings.forEach(w => console.log(`  - ${w}`));
  }

  console.log('\n' + '-'.repeat(50));

  if (result.valid) {
    console.log('\n? Contract is valid');
    console.log(`\nNext: grabby plan ${fileName}`);
  } else {
    console.log('\n? Contract has errors');
    console.log('\nFix errors and re-validate:');
    console.log(`  grabby validate ${fileName}`);
  }
  console.log('');
}

async function runExecuteContractWorkflow(rl, agentData, contractFile) {
  const agent = agentData.agent;

  console.log('\n' + '-'.repeat(50));
  console.log(`${agent.metadata.icon} EXECUTE CONTRACT WORKFLOW`);
  console.log('-'.repeat(50));

  let targetFile = contractFile;
  if (!targetFile) {
    targetFile = await prompt(rl, 'Which contract to execute?');
  }

  const filePath = resolveContract(targetFile);
  const content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);

  // Check preconditions
  console.log('\n' + '-'.repeat(50));
  console.log('STEP 1: Precondition Check');
  console.log('-'.repeat(50));

  const isApproved = content.includes('**Status:** approved');
  console.log(`\n${isApproved ? '?' : '?'} Contract status: ${isApproved ? 'approved' : 'not approved'}`);

  if (!isApproved) {
    console.log(`\n? Contract must be approved before execution.`);
    console.log(`Run: grabby approve ${fileName}`);
    return;
  }

  const planFile = fileName.replace('.fc.md', '.plan.yaml');
  const planPath = path.join(CONTRACTS_DIR, planFile);
  const hasPlan = fs.existsSync(planPath);
  console.log(`${hasPlan ? '?' : '?'} Plan exists: ${hasPlan ? planFile : 'not found'}`);

  if (!hasPlan) {
    console.log(`\n? Plan must exist before execution.`);
    console.log(`Run: grabby plan ${fileName}`);
    return;
  }

  const plan = yaml.parse(fs.readFileSync(planPath, 'utf8'));

  console.log(`\n${agent.metadata.name} says:`);
  console.log(agent.greeting?.split('\n')[1] || 'Ready to implement.');

  // Display execution plan
  console.log('\n' + '-'.repeat(50));
  console.log('STEP 2: Execution Plan');
  console.log('-'.repeat(50));

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
  console.log('\n' + '-'.repeat(50));
  console.log('STEP 3: Implementation Instructions');
  console.log('-'.repeat(50));

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
Run: grabby audit ${fileName}
`;

  output(instructions.trim());

  // Update plan status
  plan.status = 'executing';
  plan.executed_at = timestamp();
  fs.writeFileSync(planPath, yaml.stringify(plan));

  console.log('\n' + '-'.repeat(50));
  console.log('\nCopy the above to your AI assistant (Cline/Claude Code).');
  console.log(`After completion: grabby audit ${fileName}`);
  console.log('');
}

// ============================================================================
// EDIT CONTRACT WORKFLOW
// ============================================================================

async function runEditContractWorkflow(rl, agentData, contractFile) {
  const agent = agentData.agent;

  console.log('\n' + c.heading('-'.repeat(50)));
  console.log(c.heading(`${agent.metadata.icon} EDIT CONTRACT WORKFLOW`));
  console.log(c.heading('-'.repeat(50)));

  // List available contracts
  ensureContractsDir();
  const contracts = fs.readdirSync(CONTRACTS_DIR).filter(f => f.endsWith('.fc.md'));

  if (contracts.length === 0) {
    console.log(c.warn('\nNo contracts found. Create one first:'));
    console.log('  grabby agent architect CC');
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

  console.log('\n' + '-'.repeat(50));
  console.log(c.bold('STEP 1: Select Section'));
  console.log('-'.repeat(50));

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

  console.log('\n' + '-'.repeat(50));
  console.log(c.bold('STEP 2: Edit Section'));
  console.log('-'.repeat(50));

  console.log(`\nCurrent ${sectionName}:`);
  console.log(c.dim('---------------------------------------'));
  console.log(currentContent || c.dim('(empty)'));
  console.log(c.dim('---------------------------------------'));

  const newContent = await prompt(rl, `\nNew ${sectionName} (or Enter to keep current)`);

  if (newContent) {
    content = content.replace(sectionRegex, `## ${sectionName}\n${newContent}\n\n`);

    // Reset status to draft if it was approved
    if (content.includes('**Status:** approved')) {
      content = content.replace('**Status:** approved', '**Status:** draft');
      console.log(c.warn('\nNote: Status reset to draft due to edits.'));
    }

    fs.writeFileSync(filePath, content);
    console.log(c.success(`\n? Contract updated: ${fileName}`));
  } else {
    console.log(c.dim('\nNo changes made.'));
  }

  console.log(`\nNext: grabby validate ${fileName}`);
}

// ============================================================================
// RISK CHECK WORKFLOW
// ============================================================================

async function runRiskCheckWorkflow(rl, agentData, contractFile) {
  const agent = agentData.agent;

  console.log('\n' + c.heading('-'.repeat(50)));
  console.log(c.heading(`${agent.metadata.icon} RISK CHECK WORKFLOW`));
  console.log(c.heading('-'.repeat(50)));

  let targetFile = contractFile;
  if (!targetFile) {
    targetFile = await prompt(rl, 'Which contract to analyze?');
  }

  const filePath = resolveContract(targetFile);
  const content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);

  console.log(`\n${c.agent(agent.metadata.name)} analyzing risks...`);

  console.log('\n' + '-'.repeat(50));
  console.log(c.bold('STEP 1: Risk Analysis'));
  console.log('-'.repeat(50));

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
    console.log(`    ${c.dim('?')} ${r.suggestion}`);
  });

  console.log(`\n${c.warn('MEDIUM risks:')} ${mediumRisks.length}`);
  mediumRisks.forEach(r => {
    console.log(`  ${c.warn('?')} [${r.category}] ${r.issue}`);
    console.log(`    ${c.dim('?')} ${r.suggestion}`);
  });

  if (risks.length === 0) {
    console.log(c.success('\n? No significant risks detected'));
  }

  console.log('\n' + '-'.repeat(50));
  console.log(c.bold('RISK SUMMARY'));
  console.log('-'.repeat(50));

  const overallRisk = highRisks.length > 0 ? 'HIGH' : mediumRisks.length > 0 ? 'MEDIUM' : 'LOW';
  const riskColor = overallRisk === 'HIGH' ? c.error : overallRisk === 'MEDIUM' ? c.warn : c.success;

  console.log(`\nContract: ${fileName}`);
  console.log(`Overall Risk: ${riskColor(overallRisk)}`);
  console.log(`\nHigh: ${highRisks.length} | Medium: ${mediumRisks.length} | Low: ${lowRisks.length}`);

  if (highRisks.length > 0) {
    console.log(c.warn('\nRecommendation: Address HIGH risks before proceeding.'));
    console.log(`Edit contract: grabby agent architect EC ${fileName}`);
  } else {
    console.log(c.success('\n? Contract is acceptable for planning.'));
    console.log(`Next: grabby plan ${fileName}`);
  }
  console.log('');
}

// ============================================================================
// GENERATE PLAN WORKFLOW (STRATEGIST)
// ============================================================================

async function runGeneratePlanWorkflow(rl, agentData, contractFile) {
  const agent = agentData.agent;

  console.log('\n' + c.heading('-'.repeat(50)));
  console.log(c.heading(`${agent.metadata.icon} GENERATE PLAN WORKFLOW`));
  console.log(c.heading('-'.repeat(50)));

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

  console.log('\n' + '-'.repeat(50));
  console.log(c.bold('STEP 1: Dependency Analysis'));
  console.log('-'.repeat(50));

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

  console.log('\n' + '-'.repeat(50));
  console.log(c.bold('STEP 2: Generate Plan'));
  console.log('-'.repeat(50));

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
    rules: ['�typescript', '�hooks', '�testing'],
    checkpoints: [
      { after: Math.ceil(orderedFiles.length / 2), verify: 'Core functionality works' },
      { after: orderedFiles.length, verify: 'All tests pass' }
    ],
    status: 'pending_approval'
  };

  const planFile = fileName.replace('.fc.md', '.plan.yaml');
  const planPath = path.join(CONTRACTS_DIR, planFile);
  fs.writeFileSync(planPath, yaml.stringify(plan));

  console.log(c.success('\n? Plan generated with optimized file order'));
  console.log(`\nSaved: ${c.info('contracts/' + planFile)}`);
  console.log('\n' + yaml.stringify(plan));

  console.log('-'.repeat(50));
  console.log(`\nNext: grabby approve ${fileName}`);
  console.log('');
}

// ============================================================================
// OPTIMIZE PLAN WORKFLOW
// ============================================================================

async function runOptimizePlanWorkflow(rl, agentData, contractFile) {
  const agent = agentData.agent;

  console.log('\n' + c.heading('-'.repeat(50)));
  console.log(c.heading(`${agent.metadata.icon} OPTIMIZE PLAN WORKFLOW`));
  console.log(c.heading('-'.repeat(50)));

  let targetFile = contractFile;
  if (!targetFile) {
    targetFile = await prompt(rl, 'Which plan to optimize?');
  }

  // Find plan file
  const planFile = targetFile.replace('.fc.md', '').replace('.plan.yaml', '') + '.plan.yaml';
  const planPath = path.join(CONTRACTS_DIR, planFile);

  if (!fs.existsSync(planPath)) {
    console.log(c.error(`\n? Plan not found: ${planFile}`));
    console.log('Generate a plan first: grabby agent strategist GP');
    return;
  }

  const plan = yaml.parse(fs.readFileSync(planPath, 'utf8'));

  console.log('\nCurrent file order:');
  plan.files.forEach((f, i) => {
    console.log(`  ${i + 1}. ${f.path}`);
  });

  console.log('\n' + '-'.repeat(50));
  console.log(c.bold('Optimization Options'));
  console.log('-'.repeat(50));

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

  console.log(c.success('\n? Plan optimized'));
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

  console.log('\n' + c.heading('-'.repeat(50)));
  console.log(c.heading(`${agent.metadata.icon} TEST SUITE WORKFLOW`));
  console.log(c.heading('-'.repeat(50)));

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

  console.log('\n' + '-'.repeat(50));
  console.log(c.bold('STEP 1: Test Analysis'));
  console.log('-'.repeat(50));

  console.log('\nFiles to test:');
  files.forEach((f, i) => {
    console.log(`  ${i + 1}. ${f}`);
  });

  console.log('\n' + '-'.repeat(50));
  console.log(c.bold('STEP 2: Generate Test Templates'));
  console.log('-'.repeat(50));

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
    console.log(c.dim('-'.repeat(40)));
    console.log(c.dim(t.template.slice(0, 200) + '...'));
  });

  const shouldSave = await confirm(rl, '\nSave test templates to files?');

  if (shouldSave) {
    testTemplates.forEach(t => {
      const testPath = path.join(cwd, t.testFile);
      const testDir = path.dirname(testPath);
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      if (!fs.existsSync(testPath)) {
        fs.writeFileSync(testPath, t.template);
        console.log(c.success(`? Created: ${t.testFile}`));
      } else {
        console.log(c.warn(`? Skipped (exists): ${t.testFile}`));
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

  console.log('\n' + c.heading('-'.repeat(50)));
  console.log(c.heading(`${agent.metadata.icon} AUDIT WORKFLOW`));
  console.log(c.heading('-'.repeat(50)));

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

  console.log('\n' + '-'.repeat(50));
  console.log(c.bold('STEP 1: File Verification'));
  console.log('-'.repeat(50));

  const fileResults = [];
  if (plan?.files) {
    plan.files.forEach(f => {
      const fullPath = path.join(cwd, f.path);
      const exists = fs.existsSync(fullPath);
      fileResults.push({ ...f, exists });

      if (f.action === 'create') {
        console.log(`  ${exists ? c.success('?') : c.error('?')} create: ${f.path}`);
      } else {
        console.log(`  ${exists ? c.success('~') : c.error('?')} modify: ${f.path}`);
      }
    });
  }

  const missingFiles = fileResults.filter(f => !f.exists);

  console.log('\n' + '-'.repeat(50));
  console.log(c.bold('STEP 2: Quality Checks'));
  console.log('-'.repeat(50));

  const { execSync } = require('child_process');
  const checks = [];

  // Lint check
  try {
    execSync('npm run lint', { stdio: 'pipe', cwd });
    checks.push({ name: 'Lint', status: 'PASS', details: 'No errors' });
    console.log(`  ${c.success('?')} Lint: passed`);
  } catch (e) {
    checks.push({ name: 'Lint', status: 'FAIL', details: e.message });
    console.log(`  ${c.error('?')} Lint: failed`);
  }

  // Build check
  try {
    execSync('npm run build', { stdio: 'pipe', cwd });
    checks.push({ name: 'Build', status: 'PASS', details: 'Succeeded' });
    console.log(`  ${c.success('?')} Build: passed`);
  } catch (e) {
    checks.push({ name: 'Build', status: 'FAIL', details: e.message });
    console.log(`  ${c.error('?')} Build: failed`);
  }

  // Test check
  try {
    execSync('npm test', { stdio: 'pipe', cwd });
    checks.push({ name: 'Tests', status: 'PASS', details: 'All passed' });
    console.log(`  ${c.success('?')} Tests: passed`);
  } catch (e) {
    checks.push({ name: 'Tests', status: 'FAIL', details: 'Some failed' });
    console.log(`  ${c.error('?')} Tests: failed`);
  }

  console.log('\n' + '-'.repeat(50));
  console.log(c.bold('STEP 3: Audit Report'));
  console.log('-'.repeat(50));

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

    console.log(c.success('\n? Audit passed! Contract marked complete.'));
  } else {
    console.log(c.error('\n? Audit failed. Issues need resolution.'));

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

  console.log('\n' + c.heading('-'.repeat(50)));
  console.log(c.heading(`${agent.metadata.icon} QUALITY CHECK WORKFLOW`));
  console.log(c.heading('-'.repeat(50)));

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

  console.log('\n' + '-'.repeat(50));
  console.log(c.bold('Code Quality Analysis'));
  console.log('-'.repeat(50));

  for (const file of plan.files) {
    const fullPath = path.join(cwd, file.path);
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
      console.log(`  ${c.success('? No quality issues')}`);
    }
  }

  console.log('\n' + '-'.repeat(50));
  console.log('Quality check complete.\n');
}

// ============================================================================
// QUICK SPEC WORKFLOW
// ============================================================================

async function runQuickSpecWorkflow(rl, agentData) {
  const agent = agentData.agent;

  console.log('\n' + c.heading('-'.repeat(50)));
  console.log(c.heading(`${agent.metadata.icon} QUICK SPEC WORKFLOW`));
  console.log(c.heading('-'.repeat(50)));

  console.log(`\n${c.agent(agent.metadata.name)}: Let's create a quick spec. Just 4 questions.\n`);

  // Question 1: What's the change?
  const change = await prompt(rl, 'What\'s the change? (one sentence)');
  if (!change) {
    console.log(c.error('Change description required.'));
    return;
  }

  // Question 2: Which files?
  const filesInput = await prompt(rl, 'Which files? (comma-separated, max 3)');
  const requestedFiles = filesInput.split(',').map(f => f.trim()).filter(Boolean);
  const files = requestedFiles.slice(0, 3);

  if (requestedFiles.length === 0) {
    console.log(c.error('At least one file required.'));
    return;
  }

  if (requestedFiles.length > 3) {
    console.log(c.warn('\n? More than 3 files specified.'));
    const escalate = await confirm(rl, 'This may be too large for quick flow. Escalate to full contract?');
    if (escalate) {
      console.log('\nUse: grabby agent architect CC');
      return;
    }
  }

  // Question 3: Test criteria
  const test = await prompt(rl, 'How will we know it works?', 'It works as expected');

  // Question 4: Risks
  const risk = await prompt(rl, 'Any risks?', 'none');

  // Generate quick contract
  console.log('\n' + '-'.repeat(50));
  console.log(c.bold('QUICK SPEC SUMMARY'));
  console.log('-'.repeat(50));

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

  console.log(c.success(`\n? Quick contract created: contracts/${fileName}`));
  console.log(c.info('Status: approved (auto)'));
  console.log(`\nReady to implement! Run:`);
  console.log(`  grabby agent quick QD ${fileName}`);
  console.log('');
}

// ============================================================================
// QUICK DEV WORKFLOW
// ============================================================================

async function runQuickDevWorkflow(rl, agentData, contractFile) {
  const agent = agentData.agent;

  console.log('\n' + c.heading('-'.repeat(50)));
  console.log(c.heading(`${agent.metadata.icon} QUICK DEV WORKFLOW`));
  console.log(c.heading('-'.repeat(50)));

  let targetFile = contractFile;
  if (!targetFile) {
    // List quick contracts
    ensureContractsDir();
    const quickContracts = fs.readdirSync(CONTRACTS_DIR).filter(f => f.endsWith('.quick.md'));

    if (quickContracts.length === 0) {
      console.log(c.warn('\nNo quick contracts found.'));
      console.log('Create one first: grabby agent quick QS');
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

  console.log('\n' + '-'.repeat(50));
  console.log(c.bold('IMPLEMENTATION INSTRUCTIONS'));
  console.log('-'.repeat(50));

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
Run: grabby audit ${fileName.replace('.quick.md', '.fc.md')}
`;

  console.log(instructions);

  console.log('-'.repeat(50));
  console.log('\nCopy the above to your AI assistant.');
  console.log('');
}

async function executeAgentCommand(agentName, command, args) {
  const agentData = loadAgent(agentName);
  if (!agentData) {
    console.log(`? Agent not found: ${agentName}`);
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
    console.log(`? Unknown command: ${command}`);
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
      case 'audit-contract':
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

async function collectTicketIntake(rl, request, input = {}, nonInteractive = false, options = {}) {
  const requireTicketId = Boolean(options.requireTicketId);
  const parsed = parseTicketInput(input.request || request);
  let ticket = mergeTicketInput(parsed.ticket, {
    ticketId: input.ticketId,
    who: input.who,
    what: input.what,
    why: input.why,
    dod: input.dod,
    requireTicketId,
  });

  const questions = getWizardQuestions(ticket, {
    rawRequest: parsed.rawRequest || request,
    maxQuestions: 5,
    requireTicketId,
  });

  if (questions.length > 0) {
    if (nonInteractive) {
      const validation = validateTicket(ticket, { requireTicketId });
      throw new Error(`Ticket intake incomplete. Provide ${validation.missingFields.join(', ')} via structured ticket text or --who/--what/--why/--dod.`);
    }

    console.log('\n' + c.bold('TICKET GENERATOR'));
    console.log(c.dim('Structured ticket required before contract generation.'));

    for (const question of questions) {
      const answer = await prompt(rl, question.prompt, question.defaultValue);
      ticket = applyWizardAnswer(ticket, question.field, answer);
      if (validateTicket(ticket).valid) {
        break;
      }
    }
  }

  const validation = validateTicket(ticket, { requireTicketId });
  if (!validation.valid) {
    throw new Error(validation.errors[0]);
  }

  console.log('\n' + c.bold('Ticket Draft'));
  console.log('```markdown');
  console.log(buildTicketMarkdown(ticket).trimEnd());
  console.log('```');

  return ticket;
}

// ============================================================================

async function runTaskBreakdownWorkflow(rl, seedRequest = '', options = {}) {
  const {
    orchestrate = false,
    input = {},
    nonInteractive = false,
    sessionFormat = null,
    sessionOutput = null,
  } = options;
  ensureContractsDir();

  const request = input.request || seedRequest || await prompt(rl, 'What task should Grabby break down?');
  if (!request) {
    console.log(c.error('Task description required.'));
    return;
  }

  const routeTriggered = shouldRouteFeatureRequest(request);
  const requireTicketId = routeTriggered || Boolean(input.ticketId);
  const promptContext = generateSmartPrompts(cwd, CONTRACTS_DIR, request);
  const workflowTracker = createWorkflowTracker([
    'Collect ticket intake',
    'Shape task details',
    'Scaffold contract artifacts',
  ], {
    silent: !orchestrate,
  });

  workflowTracker.start();

  let ticket;
  try {
    ticket = await collectTicketIntake(rl, request, input, nonInteractive, { requireTicketId });
    workflowTracker.next('Ticket intake complete');
  } catch (error) {
    workflowTracker.fail(error.message);
    console.log(c.error(error.message));
    return;
  }

  const persona = orchestrate
    ? selectPersonaForTask('orchestrate full handoff')
    : selectPersonaForTask(request);
  const agentData = loadAgent(persona.agentKey);
  const agentLabel = agentData?.agent?.metadata?.name || persona.agentName;
  const agentTitle = agentData?.agent?.metadata?.title || persona.title;
  const greeting = agentData?.agent?.greeting || `Hi, I'm ${agentLabel}.`;
  const createRequest = inferCreateRequest(ticket.what || request);
  const defaults = getTaskDefaults(createRequest.templateName, createRequest.name);

  console.log('\n' + c.heading('-'.repeat(50)));
  console.log(c.heading(orchestrate ? 'TASK ORCHESTRATION' : 'TASK BREAKDOWN'));
  console.log(c.heading('-'.repeat(50)));
  console.log(`\n${c.agent(agentLabel)} - ${agentTitle}`);
  console.log('\n' + greeting.trim());
  console.log(`\n${c.bold('Why this persona:')} ${persona.rationale}`);
  if (promptContext.projectTypes.length > 0 || promptContext.projectDirs.length > 0) {
    console.log('\n' + c.bold('Detected Project Context'));
    if (promptContext.projectTypes.length > 0) {
      console.log(`- Types: ${promptContext.projectTypes.join(', ')}`);
    }
    if (promptContext.projectDirs.length > 0) {
      console.log(`- Directories: ${promptContext.projectDirs.join(', ')}`);
    }
    if (promptContext.prompts.directories.length > 0) {
      console.log(`- Hint: ${promptContext.prompts.directories[0]}`);
    }
  }

  const taskName = nonInteractive
    ? (input.taskName || createRequest.name)
    : await resolveInputValue(rl, input.taskName, 'Working title', createRequest.name);
  const objective = nonInteractive
    ? (input.objective || `${ticket.what} Why: ${ticket.why}`)
    : await resolveInputValue(rl, input.objective, 'What outcome do you want?', `${ticket.what} Why: ${ticket.why}`);
  const scopeInput = input.scopeItems
    ? input.scopeItems.join(', ')
    : nonInteractive
      ? ''
      : await prompt(rl, 'Key scope items (comma-separated)', '');
  const scopeItems = scopeInput.split(',').map((item) => item.trim()).filter(Boolean);
  const nonGoalsInput = input.nonGoals
    ? input.nonGoals.join(', ')
    : nonInteractive
      ? 'No unrelated scope expansion'
      : await prompt(rl, 'What is explicitly out of scope? (comma-separated)', 'No unrelated scope expansion');
  const nonGoals = nonGoalsInput.split(',').map((item) => item.trim()).filter(Boolean);
  const restrictedAreasInput = nonInteractive
    ? (input.restrictedAreas || 'node_modules/, .git/, dist/')
    : routeTriggered
      ? await resolveInputValue(rl, input.restrictedAreas, 'Restricted areas (comma-separated)', 'node_modules/, .git/, dist/')
      : 'node_modules/, .git/, dist/';
  const directoriesInput = input.directories
    ? input.directories.join(', ')
    : nonInteractive
      ? defaults.directories.join(', ')
      : await prompt(
        rl,
        'Allowed directories (comma-separated)',
        promptContext.projectDirs.length > 0
          ? promptContext.projectDirs.map((dir) => `${dir}/`).join(', ')
          : defaults.directories.join(', ')
      );
  const directories = directoriesInput.split(',').map((item) => item.trim()).filter(Boolean);
  const constraints = nonInteractive
    ? (input.constraints || 'Stay within the intended files and keep the change bounded')
    : await resolveInputValue(
      rl,
      input.constraints,
      'Constraints, files, or directories to respect',
      'Stay within the intended files and keep the change bounded'
    );
  const dependencies = nonInteractive
    ? (input.dependencies || 'none')
    : await resolveInputValue(rl, input.dependencies, 'New dependencies needed?', 'none');
  const securityImpact = nonInteractive
    ? (input.securityImpact || 'None')
    : routeTriggered
      ? await resolveInputValue(rl, input.securityImpact, 'Security/migration impact', 'None')
      : 'None';
  const doneWhenInput = input.doneWhen
    ? input.doneWhen.join(', ')
    : input.dod
      ? input.dod.join(', ')
    : nonInteractive
      ? ticket.dod.join(', ')
      : await prompt(
        rl,
        'Definition of done',
        ticket.dod.join(', ')
      );
  const testing = nonInteractive
    ? (input.testing || defaults.testing)
    : await resolveInputValue(
      rl,
      input.testing,
      'Testing approach',
      promptContext.prompts.testing.length > 0
        ? promptContext.prompts.testing.join('; ')
        : defaults.testing
    );

  workflowTracker.next('Task details collected');

  console.log('\n' + '-'.repeat(50));
  console.log(c.bold('BREAKDOWN SUMMARY'));
  console.log('-'.repeat(50));
  console.log(`Task: ${taskName}`);
  console.log(`Persona: ${agentLabel} (${agentTitle})`);
  console.log(`Template: ${createRequest.templateName}`);
  console.log(`Objective: ${objective}`);
  console.log(`Ticket: ${ticket.ticketId || 'untracked'} | Who: ${ticket.who}`);
  console.log(`Recommended handoff: ${persona.handoffCommand}`);
  if (scopeItems.length > 0) {
    console.log('\nScope:');
    scopeItems.forEach((item) => console.log(`  - ${item}`));
  }

  const shouldScaffold = nonInteractive
    ? true
    : await confirm(
      rl,
      orchestrate
        ? '\nCreate the contract and run the full persona handoff?'
        : '\nCreate a populated contract and task brief?'
    );
  if (!shouldScaffold) {
    workflowTracker.complete();
    console.log('\nNo files created.');
    return;
  }

  const taskFiles = defaults.files;
  const contractId = ticket.ticketId || genId();
  const fileName = `${contractId}.fc.md`;
  const contractPath = path.join(CONTRACTS_DIR, fileName);
  let contractContent = buildTaskContract({
    taskName,
    id: contractId,
    ticket,
    objective,
    scopeItems,
    nonGoals,
    directories,
    files: taskFiles,
    dependencies,
    doneWhen: normalizeDoneWhen(doneWhenInput.split(',').map((item) => item.trim()).filter(Boolean)),
    testing,
  });
  contractContent = contractContent
    .replace(/^(\*\*Restricted:\*\*\s*).+$/m, `$1${restrictedAreasInput.split(',').map((item) => `\`${item.trim()}\``).filter((item) => item !== '``').join(', ')}`)
    .replace(/## Security Considerations\n/, `## Security Considerations\n- [ ] Security/migration impact reviewed: ${securityImpact}\n`);
  fs.writeFileSync(contractPath, contractContent);
  appendLocalFeatureLog({
    id: extractGeneratedContractId(contractContent),
    title: taskName,
    type: createRequest.templateName,
    contractFile: path.relative(cwd, contractPath).replace(/\\/g, '/'),
  });

  const briefPath = path.join(CONTRACTS_DIR, `${contractId}.brief.md`);
  const brief = buildTaskBrief({
    taskName,
    request,
    ticket,
    persona,
    objective,
    scopeItems,
    constraints,
    doneWhen: doneWhenInput,
  });

  fs.writeFileSync(briefPath, brief);

  let executionBriefPath = null;
  let auditChecklistPath = null;
  let generatedSessionPath = null;

  if (orchestrate) {
    const validation = validateContract(contractContent);
    console.log('\n' + c.heading('-'.repeat(50)));
    console.log(c.heading('ORCHESTRATOR HANDOFF'));
    console.log(c.heading('-'.repeat(50)));
    console.log(`\n${c.agent('Archie')} created ${fileName}`);

    if (!validation.valid) {
      console.log(c.error(`\nValidation failed with ${validation.errors.length} errors.`));
      validation.errors.forEach((error) => console.log(`  - ${error}`));
      return;
    }

    console.log(`${c.agent('Val')} validated the contract`);
    commandHandlers.backlog(fileName);
    console.log(`${c.agent('Sage')} generated the backlog`);
    commandHandlers.plan(fileName);
    console.log(`${c.agent('Sage')} generated the execution plan`);

    const planPath = path.join(CONTRACTS_DIR, fileName.replace('.fc.md', '.plan.yaml'));
    const backlogPath = path.join(CONTRACTS_DIR, fileName.replace('.fc.md', '.backlog.yaml'));
    const plan = yaml.parse(fs.readFileSync(planPath, 'utf8'));
    const backlog = yaml.parse(fs.readFileSync(backlogPath, 'utf8'));

    executionBriefPath = getExecutionBriefPath(CONTRACTS_DIR, fileName);
    auditChecklistPath = getAuditChecklistPath(CONTRACTS_DIR, fileName);

    fs.writeFileSync(
      executionBriefPath,
      buildExecutionBrief({ fileName, plan, backlog })
    );
    fs.writeFileSync(
      auditChecklistPath,
      buildAuditChecklist({ fileName, contractContent })
    );

    console.log(`${c.agent('Dev')} prepared execution instructions`);
    console.log(`${c.agent('Iris')} prepared the audit checklist`);
  }

  if (sessionFormat) {
    const normalizedFormat = String(sessionFormat).toLowerCase();
    const sessionPath = sessionOutput || getSessionPath(CONTRACTS_DIR, fileName, normalizedFormat);
    const session = buildSessionSummary({
      request,
      persona,
      contractFile: `contracts/${fileName}`,
      briefFile: `contracts/${path.basename(briefPath)}`,
      planFile: orchestrate ? `contracts/${fileName.replace('.fc.md', '.plan.yaml')}` : null,
      backlogFile: orchestrate ? `contracts/${fileName.replace('.fc.md', '.backlog.yaml')}` : null,
      executionFile: executionBriefPath ? `contracts/${path.basename(executionBriefPath)}` : null,
      auditFile: auditChecklistPath ? `contracts/${path.basename(auditChecklistPath)}` : null,
      handoff: orchestrate ? `grabby execute ${fileName}` : persona.handoffCommand,
      mode: orchestrate ? 'orchestrate' : 'task',
    });
    const sessionContent = normalizedFormat === 'yaml'
      ? yaml.stringify(session)
      : `${JSON.stringify(session, null, 2)}\n`;
    fs.writeFileSync(sessionPath, sessionContent);
    generatedSessionPath = sessionPath;
  }

  workflowTracker.complete();

  console.log('\n' + c.heading('-'.repeat(50)));
  console.log(c.heading(orchestrate ? 'ORCHESTRATION COMPLETE' : 'ARTIFACTS CREATED'));
  console.log(c.heading('-'.repeat(50)));
  console.log(`\nContract: ${c.info(path.relative(cwd, contractPath).replace(/\\/g, '/'))}`);
  console.log(`Brief: ${c.info(path.relative(cwd, briefPath).replace(/\\/g, '/'))}`);
  console.log(`Template: ${c.dim(createRequest.templateName)}`);
  if (executionBriefPath) {
    console.log(`Execution: ${c.info(path.relative(cwd, executionBriefPath).replace(/\\/g, '/'))}`);
  }
  if (auditChecklistPath) {
    console.log(`Audit: ${c.info(path.relative(cwd, auditChecklistPath).replace(/\\/g, '/'))}`);
  }
  if (generatedSessionPath) {
    console.log(`Session: ${c.info(path.relative(cwd, generatedSessionPath).replace(/\\/g, '/'))}`);
  }
  console.log(`Next: ${c.info(`grabby validate ${fileName}`)}`);
  console.log(`Handoff: ${c.info(orchestrate ? 'grabby execute ' + fileName : persona.handoffCommand)}`);
  console.log('');
}

// ============================================================================

async function runTicketWizardWorkflow(rl, seedRequest = '', options = {}) {
  const {
    input = {},
    nonInteractive = false,
  } = options;
  const request = input.request || seedRequest || await prompt(rl, 'What idea should be turned into a ticket?');
  if (!request && !input.who && !input.what && !input.why && !input.dod) {
    console.log(c.error('Ticket input required.'));
    return null;
  }

  try {
    const ticket = await collectTicketIntake(rl, request, input, nonInteractive);
    return ticket;
  } catch (error) {
    console.log(c.error(error.message));
    return null;
  }
}

function appendLocalFeatureLog(entry) {
  if (TRACKING_MODE !== 'local-only') {
    return;
  }

  const grabbyDir = path.join(cwd, '.grabby');
  if (!fs.existsSync(grabbyDir)) {
    fs.mkdirSync(grabbyDir, { recursive: true });
  }

  const logPath = path.join(grabbyDir, 'feature-log.json');
  const current = fs.existsSync(logPath)
    ? JSON.parse(fs.readFileSync(logPath, 'utf8'))
    : { entries: [] };

  current.entries.push({
    ...entry,
    trackedAt: timestamp(),
    contractsDir: path.relative(cwd, CONTRACTS_DIR).replace(/\\/g, '/'),
  });

  fs.writeFileSync(logPath, JSON.stringify(current, null, 2) + '\n');
}

function extractGeneratedContractId(content) {
  return content.match(/\*\*ID:\*\*\s*([^|\n\r]+)/i)?.[1]?.trim() || null;
}

// ============================================================================


function listWorkflowMetadata() {
  return fs.readdirSync(WORKFLOWS_DIR)
    .filter((f) => fs.statSync(path.join(WORKFLOWS_DIR, f)).isDirectory())
    .map((name) => {
      const workflowFile = path.join(WORKFLOWS_DIR, name, 'workflow.yaml');
      if (!fs.existsSync(workflowFile)) {
        return { name, description: 'No description', agent: null, steps: [] };
      }
      const wf = yaml.parse(fs.readFileSync(workflowFile, 'utf8'));
      return {
        name,
        description: wf.description || 'No description',
        agent: wf.agent || null,
        steps: wf.steps || [],
      };
    });
}

function getWorkflowDetails(workflowName) {
  const workflowFile = path.join(WORKFLOWS_DIR, workflowName, 'workflow.yaml');
  if (!fs.existsSync(workflowFile)) {
    return null;
  }

  const wf = yaml.parse(fs.readFileSync(workflowFile, 'utf8'));
  return {
    name: wf.name || workflowName,
    description: wf.description || '',
    agent: wf.agent || null,
    steps: wf.steps || [],
  };
}

function resolveContract(file) {
  return commandHandlers.resolveContract(file);
}

  return {
    createPromptInterface,
    loadAgent,
    listAgents,
    executeAgentCommand,
    runTaskBreakdownWorkflow,
    runTicketWizardWorkflow,
    runQuickSpecWorkflow,
    runQuickDevWorkflow,
    listProgress,
    listWorkflowMetadata,
    getWorkflowDetails,
    resolveContract,
    output,
  };
}

module.exports = { createWorkflowRuntime };
module.exports.shouldRouteFeatureRequest = shouldRouteFeatureRequest;
module.exports.extractReferencedContract = extractReferencedContract;


