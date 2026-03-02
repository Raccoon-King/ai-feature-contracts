const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const yaml = require('yaml');
const { initConfig, loadConfig, renderPromptBundle } = require('./governance.cjs');
const { generateBacklog, getBacklogPath } = require('./agile.cjs');
const { initGrabbyIgnore, isIgnoredByGrabby } = require('./ignore.cjs');
const {
  getSessionPath,
  buildSessionSummary,
  validateSessionSummary,
} = require('./task-artifacts.cjs');

const {
  validateContract,
  createContract,
  resolveContract: resolveContractFile,
  timestamp,
} = require('./core.cjs');
const {
  resolveContextRefs,
  checkVersionCompatibility,
  validateExecutionScope,
  collectFeatureMetrics,
  saveFeatureMetrics,
  summarizeFeatureMetrics,
  upgradeContractVersions,
} = require('./governance-runtime.cjs');

function createProjectContext({ cwd, pkgRoot }) {
  return {
    cwd,
    pkgRoot,
    templatesDir: path.join(pkgRoot, 'templates'),
    docsDir: path.join(pkgRoot, 'docs'),
    contractsDir: path.join(cwd, 'contracts'),
    grabbyDir: path.join(cwd, '.grabby'),
  };
}

function ensureContractsDir(contractsDir) {
  if (!fs.existsSync(contractsDir)) {
    fs.mkdirSync(contractsDir, { recursive: true });
  }
}

function writeOutput({ content, filePath, logger, outputMode }) {
  if (outputMode === 'console' || outputMode === 'both') {
    logger.log(content);
  }
  if ((outputMode === 'file' || outputMode === 'both') && filePath) {
    fs.writeFileSync(filePath, content);
    logger.log(`\nWritten to: ${filePath}`);
  }
}

function inferCreateRequest(input) {
  const normalizedInput = String(input || '')
    .trim()
    .replace(/\s+/g, ' ') || 'new-feature';

  const rules = [
    {
      templateName: 'api-endpoint',
      detect: /\b(api|endpoint|route|handler)\b/i,
      strip: [
        /^(?:add|build|create|implement|write)\s+/i,
        /^(?:an?|the)\s+/i,
        /^(?:new\s+)?(?:api\s+endpoint|api\s+route|endpoint|route\s+handler|route|handler)\s*(?:for\s+)?/i,
      ],
    },
    {
      templateName: 'bug-fix',
      detect: /\b(bug|fix|defect|regression|broken|error)\b/i,
      strip: [
        /^(?:add|build|create|implement|write)\s+/i,
        /^(?:an?|the)\s+/i,
        /^(?:bug\s+fix|fix(?:\s+the)?|bug(?:\s+in)?|regression(?:\s+in)?|error(?:\s+in)?)\s+/i,
      ],
    },
    {
      templateName: 'refactor',
      detect: /\b(refactor|cleanup|clean up|restructure|simplify)\b/i,
      strip: [
        /^(?:add|build|create|implement|write)\s+/i,
        /^(?:an?|the)\s+/i,
        /^(?:refactor|cleanup|clean up|restructure|simplify)\s+/i,
      ],
    },
    {
      templateName: 'ui-component',
      detect: /\b(component|ui|page|screen|modal|dialog|form)\b/i,
      strip: [
        /^(?:add|build|create|implement|write)\s+/i,
        /^(?:an?|the)\s+/i,
        /^(?:new\s+)?(?:ui\s+component|component|page|screen|modal|dialog|form)\s*(?:for\s+)?/i,
      ],
    },
    {
      templateName: 'integration',
      detect: /\b(integration|integrate|webhook|sync|provider)\b/i,
      strip: [
        /^(?:add|build|create|implement|write)\s+/i,
        /^(?:an?|the)\s+/i,
        /^(?:new\s+)?(?:integration|webhook|sync|provider)\s*(?:for\s+)?/i,
      ],
    },
  ];

  const selectedRule = rules.find((rule) => rule.detect.test(normalizedInput));
  let name = normalizedInput;

  if (selectedRule) {
    selectedRule.strip.forEach((pattern) => {
      name = name.replace(pattern, '');
    });
  }

  name = name
    .replace(/^(?:an?|the)\s+/i, '')
    .replace(/^(?:for|to)\s+/i, '')
    .trim();

  return {
    rawInput: normalizedInput,
    name: name || normalizedInput,
    templateName: selectedRule ? selectedRule.templateName : 'contract',
  };
}

function createCommandHandlers({
  context,
  outputMode = 'both',
  logger = console,
  exit = (code) => process.exit(code),
  formatter = {},
  execSyncImpl = execSync,
}) {
  const c = {
    error: formatter.error || ((value) => value),
    success: formatter.success || ((value) => value),
    warn: formatter.warn || ((value) => value),
    info: formatter.info || ((value) => value),
    dim: formatter.dim || ((value) => value),
    bold: formatter.bold || ((value) => value),
    heading: formatter.heading || ((value) => value),
  };

  function resolveContract(file) {
    try {
      return resolveContractFile(context.contractsDir, file);
    } catch (error) {
      logger.log(`✗ ${error.message}`);
      if (!file) {
        return exit(1);
      }
      logger.log(`  Looked in: ${context.contractsDir}`);
      return exit(1);
    }
  }

  function init() {
    logger.log('Initializing Grabby in current project...\n');

    ensureContractsDir(context.contractsDir);
    const configPath = initConfig(context.cwd);
    const ignorePath = initGrabbyIgnore(context.cwd);
    const projectDocs = path.join(context.cwd, 'docs');
    if (!fs.existsSync(projectDocs)) {
      fs.mkdirSync(projectDocs, { recursive: true });
    }

    const docFiles = ['ARCHITECTURE_INDEX.md', 'RULESET_CORE.md', 'ENV_STACK.md', 'EXECUTION_PROTOCOL.md'];
    docFiles.forEach((file) => {
      const src = path.join(context.docsDir, file);
      const dest = path.join(projectDocs, file);
      if (fs.existsSync(src) && !fs.existsSync(dest)) {
        fs.copyFileSync(src, dest);
        logger.log(`  ✓ Created docs/${file}`);
      }
    });

    const readmePath = path.join(context.contractsDir, 'README.md');
    if (!fs.existsSync(readmePath)) {
      fs.writeFileSync(readmePath, `# Feature Contracts

This directory contains feature contracts for AI-assisted development.

## Commands

\`\`\`bash
grabby task "request"          # Interview-driven task breakdown
grabby orchestrate "request"   # Full persona handoff
grabby create "feature-name"   # Create new contract
grabby validate file.fc.md     # Validate contract
grabby plan file.fc.md         # Generate plan (Phase 1)
grabby backlog file.fc.md      # Generate Agile backlog
grabby prompt file.fc.md       # Render LLM bundle
grabby session file.fc.md      # Inspect/regenerate session artifact
grabby approve file.fc.md      # Approve for execution
grabby execute file.fc.md      # Execute (Phase 2)
grabby audit file.fc.md        # Post-execution audit
grabby list                    # List all contracts
\`\`\`

## Workflow

1. Break down work: \`grabby task "my-feature"\`
2. Orchestrate end-to-end: \`grabby orchestrate "my-feature"\`
3. Validate: \`grabby validate my-feature.fc.md\`
4. Generate plan/backlog: \`grabby plan my-feature.fc.md\` and \`grabby backlog my-feature.fc.md\`
5. Approve: \`grabby approve my-feature.fc.md\`
6. Execute: \`grabby execute my-feature.fc.md\`
7. Audit: \`grabby audit my-feature.fc.md\`
`);
      logger.log('  ✓ Created contracts/README.md');
    }

    logger.log(`  ✓ Created ${path.relative(context.cwd, configPath).replace(/\\/g, '/')}`);
    logger.log(`  ✓ Created ${path.relative(context.cwd, ignorePath).replace(/\\/g, '/')}`);
    logger.log('\n✓ Initialized! Run `grabby create "feature-name"` to start.\n');
  }

  function create(name) {
    ensureContractsDir(context.contractsDir);

    try {
      const request = inferCreateRequest(name);
      const result = createContract(
        context.templatesDir,
        context.contractsDir,
        request.name,
        request.templateName
      );
      logger.log(`✓ Created: contracts/${result.fileName}`);
      logger.log(`  ID: ${result.id}`);
      logger.log(`  Template: ${request.templateName}`);
      logger.log('\nNext: Edit the contract, then run:');
      logger.log(`  grabby validate ${result.fileName}`);
    } catch (error) {
      logger.log(`✗ ${error.message}`);
      exit(1);
    }
  }

  function validate(file) {
    const filePath = resolveContract(file);
    if (!filePath) {
      return;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const result = validateContract(content);
    const versionCheck = checkVersionCompatibility(content, context.docsDir);
    result.errors.push(...versionCheck.errors);
    result.warnings.push(...versionCheck.warnings);
    const fileName = path.basename(filePath);

    logger.log(c.heading(`\nValidating: ${fileName}`));
    logger.log('─'.repeat(50));

    if (result.stats) {
      logger.log(`\n${c.dim('Stats:')} ${result.stats.scopeItems} scope items, ${result.stats.fileCount} files, ${result.stats.checkboxCount} done-when criteria`);
    }

    if (result.errors.length > 0) {
      logger.log(`\n${c.error(`✗ Errors (${result.errors.length}):`)} `);
      result.errors.forEach((error) => logger.log(`  ${c.error('•')} ${error}`));
    }

    if (result.warnings.length > 0) {
      logger.log(`\n${c.warn(`⚠ Warnings (${result.warnings.length}):`)} `);
      result.warnings.forEach((warning) => logger.log(`  ${c.warn('•')} ${warning}`));
    }

    if (result.suggestions && result.suggestions.length > 0) {
      logger.log(`\n${c.info('Suggestions:')}`);
      result.suggestions.forEach((suggestion) => logger.log(`  ${c.dim('•')} ${suggestion}`));
    }

    logger.log(`\n${'─'.repeat(50)}`);

    if (result.valid) {
      logger.log(result.warnings.length > 0 ? c.warn('✓ Validation passed with warnings') : c.success('✓ Validation passed'));
      logger.log(`\nNext: ${c.info(`grabby plan ${fileName}`)}`);
      return;
    }

    logger.log(c.error('✗ Validation failed - fix errors above'));
    exit(1);
  }

  function plan(file) {
    const filePath = resolveContract(file);
    if (!filePath) {
      return;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const fileName = path.basename(filePath);
    const validation = validateContract(content);

    if (!validation.valid) {
      logger.log(`✗ Contract has validation errors. Run: grabby validate ${fileName}`);
      exit(1);
      return;
    }

    const files = [];
    const filesMatch = content.match(/## Files[\s\S]*?\|[\s\S]*?(?=##|$)/);
    if (filesMatch) {
      const rows = filesMatch[0].split('\n').filter((row) =>
        row.startsWith('|') && !row.includes('Action') && !row.includes('---')
      );
      rows.forEach((row) => {
        const cols = row.split('|').map((cell) => cell.trim()).filter(Boolean);
        if (cols.length >= 3 && !cols[0].includes('-')) {
          files.push({
            action: cols[0],
            path: cols[1].replace(/`/g, ''),
            reason: cols[2],
          });
        }
      });
    }

    const resolvedContext = resolveContextRefs({
      docsDir: context.docsDir,
      contractContent: content,
      phase: 'plan',
      tokenBudget: 1200,
    });

    const planData = {
      contract: fileName,
      phase: 'plan',
      timestamp: timestamp(),
      context: resolvedContext.resolved.map((entry) => `${entry.kind}:${entry.ref}`),
      context_token_usage: resolvedContext.tokenUsage,
      context_token_budget: resolvedContext.tokenBudget,
      files,
      rules: ['§typescript', '§hooks', '§testing'],
      risks: ['State synchronization', 'Type coverage', 'Edge cases'],
      status: 'pending_approval',
    };

    if (content.includes('CONTRACT_TYPE: ARCH_CHANGE_CONTRACT') && !content.includes('ARCH_APPROVED: true')) {
      logger.log('✗ ARCH_CHANGE_CONTRACT requires ARCH_APPROVED: true before execution');
      exit(1);
      return;
    }

    const planFile = fileName.replace('.fc.md', '.plan.yaml');
    const planPath = path.join(context.contractsDir, planFile);
    fs.writeFileSync(planPath, yaml.stringify(planData));

    logger.log('═'.repeat(50));
    logger.log('PHASE 1: PLAN');
    logger.log('═'.repeat(50));
    logger.log(yaml.stringify(planData));
    logger.log(`Saved: contracts/${planFile}`);
    logger.log(`\nNext: grabby approve ${fileName}`);
  }

  function approve(file) {
    const filePath = resolveContract(file);
    if (!filePath) {
      return;
    }

    const fileName = path.basename(filePath);
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/\*\*Status:\*\*\s*\w+/, '**Status:** approved');
    fs.writeFileSync(filePath, content);

    const planFile = fileName.replace('.fc.md', '.plan.yaml');
    const planPath = path.join(context.contractsDir, planFile);
    if (fs.existsSync(planPath)) {
      const planData = yaml.parse(fs.readFileSync(planPath, 'utf8'));
      planData.status = 'approved';
      planData.approved_at = timestamp();
      fs.writeFileSync(planPath, yaml.stringify(planData));
    }

    logger.log('✓ Contract approved');
    logger.log(`\nNext: grabby execute ${fileName}`);
  }

  function guard(file) {
    const filePath = resolveContract(file);
    if (!filePath) {
      return;
    }

    const fileName = path.basename(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const planFile = fileName.replace('.fc.md', '.plan.yaml');
    const planPath = path.join(context.contractsDir, planFile);
    if (!fs.existsSync(planPath)) {
      logger.log(`✗ No plan found. Run: grabby plan ${fileName}`);
      exit(1);
      return;
    }

    const planData = yaml.parse(fs.readFileSync(planPath, 'utf8'));
    const scopeValidation = validateExecutionScope({
      cwd: context.cwd,
      planData,
      contractContent: content,
    });

    if (!scopeValidation.valid) {
      logger.log('✗ Guard violations detected:');
      scopeValidation.violations.forEach((v) => logger.log(`  - ${v}`));
      exit(1);
      return;
    }

    logger.log('✓ Guard passed (no scope violations)');
  }

  function execute(file) {
    const filePath = resolveContract(file);
    if (!filePath) {
      return;
    }

    const fileName = path.basename(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.includes('**Status:** approved')) {
      logger.log(`✗ Contract not approved. Run: grabby approve ${fileName}`);
      exit(1);
      return;
    }

    const planFile = fileName.replace('.fc.md', '.plan.yaml');
    const planPath = path.join(context.contractsDir, planFile);
    if (!fs.existsSync(planPath)) {
      logger.log(`✗ No plan found. Run: grabby plan ${fileName}`);
      exit(1);
      return;
    }

    const planData = yaml.parse(fs.readFileSync(planPath, 'utf8'));
    const resolvedContext = resolveContextRefs({
      docsDir: context.docsDir,
      contractContent: content,
      phase: 'execute',
      tokenBudget: 1800,
    });
    const scopeValidation = validateExecutionScope({
      cwd: context.cwd,
      planData,
      contractContent: content,
    });
    if (!scopeValidation.valid) {
      logger.log('✗ Execution guard failure:');
      scopeValidation.violations.forEach((v) => logger.log(`  - ${v}`));
      exit(1);
      return;
    }

    logger.log('═'.repeat(50));
    logger.log('PHASE 2: EXECUTE');
    logger.log('═'.repeat(50));
    logger.log('\nContext:');
    if (Array.isArray(planData.context)) {
      planData.context.forEach((entry) => logger.log(`  @context ${entry}`));
    }
    const legacy = { ARCH: 'ARCH_INDEX_v1', RULESET: 'RULESET_CORE_v1', ENV: 'ENV_STACK_v1' };
    resolvedContext.resolved.forEach((entry) => {
      logger.log(`  @context ${legacy[entry.kind] || entry.kind}`);
      logger.log(`  @resolved ${entry.kind}:${entry.ref} (${entry.tokens}t)`);
    });
    logger.log('\nFiles:');
    planData.files.forEach((entry) => logger.log(`  ${entry.action}: ${entry.path}`));
    logger.log('\nRules:');
    planData.rules.forEach((entry) => logger.log(`  ${entry}`));
    logger.log(`\n${'─'.repeat(50)}`);
    logger.log('\nCopy the above to Cline/Claude Code.');
    logger.log(`After completion: grabby audit ${fileName}\n`);

    planData.status = 'executing';
    planData.executed_at = timestamp();
    planData.execution_guard = 'passed';
    fs.writeFileSync(planPath, yaml.stringify(planData));

    const metrics = collectFeatureMetrics({
      cwd: context.cwd,
      contractFileName: fileName,
      planData,
      contextStats: { plan: planData.context_token_usage || 0, execute: resolvedContext.tokenUsage },
      violations: scopeValidation.violations,
    });
    const metricsPath = saveFeatureMetrics(context.contractsDir, metrics);
    logger.log(`Metrics: ${path.relative(context.cwd, metricsPath).replace(/\\/g, '/')}`);
  }

  function audit(file) {
    const filePath = resolveContract(file);
    if (!filePath) {
      return;
    }

    const fileName = path.basename(filePath);
    const planFile = fileName.replace('.fc.md', '.plan.yaml');
    const planPath = path.join(context.contractsDir, planFile);
    const planData = fs.existsSync(planPath)
      ? yaml.parse(fs.readFileSync(planPath, 'utf8'))
      : null;

    logger.log('═'.repeat(50));
    logger.log('POST-EXECUTION AUDIT');
    logger.log('═'.repeat(50));
    logger.log(`\nContract: ${fileName}`);
    logger.log(`Status: ${planData?.status || 'unknown'}`);
    logger.log('\nFiles specified:');

    if (planData?.files) {
      planData.files.forEach((entry) => {
        const exists = fs.existsSync(path.join(context.cwd, entry.path));
        const icon = entry.action === 'create' ? (exists ? '✓' : '✗') : '~';
        logger.log(`  ${icon} ${entry.action}: ${entry.path}`);
      });
    }

    logger.log('\nRunning checks...');
    const pkgPath = path.join(context.cwd, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        execSyncImpl('npm run lint', { stdio: 'pipe', cwd: context.cwd });
        logger.log('  ✓ Lint: passed');
      } catch {
        logger.log('  ✗ Lint: failed');
      }

      try {
        execSyncImpl('npm run build', { stdio: 'pipe', cwd: context.cwd });
        logger.log('  ✓ Build: passed');
      } catch {
        logger.log('  ✗ Build: failed');
      }
    }

    logger.log(`\n${'─'.repeat(50)}`);
    logger.log('Update contract status to "complete" when done.');
    logger.log('Mark Done When checkboxes in the contract.\n');
  }

  function list() {
    ensureContractsDir(context.contractsDir);

    const files = fs.readdirSync(context.contractsDir).filter((file) => file.endsWith('.fc.md'));
    if (files.length === 0) {
      logger.log('No contracts found.');
      logger.log('Create one: grabby create "feature-name"\n');
      return;
    }

    logger.log('Contracts:\n');
    files.forEach((file) => {
      const content = fs.readFileSync(path.join(context.contractsDir, file), 'utf8');
      const status = content.match(/\*\*Status:\*\*\s*(\w+)/)?.[1] || '?';
      const id = content.match(/\*\*ID:\*\*\s*(FC-\d+)/)?.[1] || '?';
      const icons = {
        draft: '📝',
        approved: '✓ ',
        executing: '⚡',
        complete: '✓✓',
      };
      logger.log(`  ${icons[status] || '? '} ${file}`);
      logger.log(`     ID: ${id} | Status: ${status}`);
    });
    logger.log('');
  }

  function backlog(file) {
    const filePath = resolveContract(file);
    if (!filePath) {
      return;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const fileName = path.basename(filePath);
    const validation = validateContract(content);
    if (!validation.valid) {
      logger.log(`✗ Contract has validation errors. Run: grabby validate ${fileName}`);
      exit(1);
      return;
    }

    const config = loadConfig(context.cwd);
    const backlogData = generateBacklog({ content, fileName, config });
    const backlogPath = getBacklogPath(context.contractsDir, fileName);
    fs.writeFileSync(backlogPath, yaml.stringify(backlogData));

    logger.log('═'.repeat(50));
    logger.log('AGILE BACKLOG');
    logger.log('═'.repeat(50));
    logger.log(yaml.stringify(backlogData));
    logger.log(`Saved: contracts/${path.basename(backlogPath)}`);
  }

  function promptBundle(file) {
    const filePath = resolveContract(file);
    if (!filePath) {
      return;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const fileName = path.basename(filePath);
    const config = loadConfig(context.cwd);
    const planPath = path.join(context.contractsDir, fileName.replace(/\.fc\.md$/, '.plan.yaml'));
    const backlogPath = getBacklogPath(context.contractsDir, fileName);

    const prompt = renderPromptBundle({
      fileName,
      contractContent: content,
      config,
      planContent: fs.existsSync(planPath) ? fs.readFileSync(planPath, 'utf8') : null,
      backlogContent: fs.existsSync(backlogPath) ? fs.readFileSync(backlogPath, 'utf8') : null,
    });

    const outputPath = path.join(context.contractsDir, fileName.replace(/\.fc\.md$/, '.prompt.md'));
    writeOutput({ content: prompt, filePath: outputPath, logger, outputMode });
  }

  function resolveSessionFile(file) {
    if (!file) {
      throw new Error('No file specified');
    }

    const directPath = path.isAbsolute(file) ? file : path.join(context.cwd, file);
    if (fs.existsSync(directPath) && /\.(json|ya?ml)$/i.test(directPath)) {
      return directPath;
    }

    const contractPath = resolveContract(file);
    if (!contractPath) {
      return null;
    }

    const fileName = path.basename(contractPath);
    const jsonPath = getSessionPath(context.contractsDir, fileName, 'json');
    const yamlPath = getSessionPath(context.contractsDir, fileName, 'yaml');

    if (fs.existsSync(jsonPath)) {
      return jsonPath;
    }
    if (fs.existsSync(yamlPath)) {
      return yamlPath;
    }

    throw new Error(`Session not found for contract: ${fileName}`);
  }

  function readSessionFile(sessionPath) {
    const raw = fs.readFileSync(sessionPath, 'utf8');
    return sessionPath.endsWith('.json') ? JSON.parse(raw) : yaml.parse(raw);
  }

  function listSessionFiles() {
    if (!fs.existsSync(context.contractsDir)) {
      return [];
    }

    return fs.readdirSync(context.contractsDir)
      .filter((file) => file.endsWith('.session.json') || file.endsWith('.session.yaml'))
      .map((file) => path.join(context.contractsDir, file));
  }

  function derivePersonaFromArtifacts(artifactPaths) {
    if (
      artifactPaths.planPath &&
      artifactPaths.backlogPath &&
      artifactPaths.executionPath &&
      artifactPaths.auditPath
    ) {
      return {
        agentKey: 'architect',
        agentName: 'Conductor',
        title: 'Workflow Orchestrator',
        handoffCommand: `grabby execute ${path.basename(artifactPaths.contractPath)}`,
      };
    }

    return {
      agentKey: 'architect',
      agentName: 'Archie',
      title: 'Contract Architect',
      handoffCommand: 'grabby agent architect CC',
    };
  }

  function regenerateSession(contractFile, { format = 'json', outputPath = null } = {}) {
    const contractPath = resolveContract(contractFile);
    if (!contractPath) {
      return null;
    }

    const fileName = path.basename(contractPath);
    const briefPath = path.join(context.contractsDir, fileName.replace(/\.fc\.md$/, '.brief.md'));
    if (!fs.existsSync(briefPath)) {
      throw new Error(`Brief not found for contract: ${fileName}`);
    }

    const artifactPaths = {
      contractPath,
      briefPath,
      planPath: path.join(context.contractsDir, fileName.replace(/\.fc\.md$/, '.plan.yaml')),
      backlogPath: getBacklogPath(context.contractsDir, fileName),
      executionPath: path.join(context.contractsDir, fileName.replace(/\.fc\.md$/, '.execute.md')),
      auditPath: path.join(context.contractsDir, fileName.replace(/\.fc\.md$/, '.audit.md')),
    };

    Object.keys(artifactPaths).forEach((key) => {
      if (key !== 'contractPath' && key !== 'briefPath' && !fs.existsSync(artifactPaths[key])) {
        artifactPaths[key] = null;
      }
    });

    const persona = derivePersonaFromArtifacts(artifactPaths);
    const contractContent = fs.readFileSync(contractPath, 'utf8');
    const request = contractContent.match(/^# FC:\s+(.+)$/m)?.[1] || fileName.replace(/\.fc\.md$/, '');
    const mode = artifactPaths.planPath && artifactPaths.backlogPath && artifactPaths.executionPath && artifactPaths.auditPath
      ? 'orchestrate'
      : 'task';

    const session = buildSessionSummary({
      request,
      persona,
      contractFile: `contracts/${fileName}`,
      briefFile: `contracts/${path.basename(briefPath)}`,
      planFile: artifactPaths.planPath ? `contracts/${path.basename(artifactPaths.planPath)}` : null,
      backlogFile: artifactPaths.backlogPath ? `contracts/${path.basename(artifactPaths.backlogPath)}` : null,
      executionFile: artifactPaths.executionPath ? `contracts/${path.basename(artifactPaths.executionPath)}` : null,
      auditFile: artifactPaths.auditPath ? `contracts/${path.basename(artifactPaths.auditPath)}` : null,
      handoff: mode === 'orchestrate' ? `grabby execute ${fileName}` : persona.handoffCommand,
      mode,
    });

    const targetPath = outputPath || getSessionPath(context.contractsDir, fileName, format);
    const sessionContent = format === 'yaml'
      ? yaml.stringify(session)
      : `${JSON.stringify(session, null, 2)}\n`;
    fs.writeFileSync(targetPath, sessionContent);
    return { targetPath, session };
  }

  function session(file, options = {}) {
    const {
      regenerate = false,
      format = 'json',
      outputPath = null,
      check = false,
      checkAll = false,
    } = options;

    try {
      if (checkAll) {
        const sessionFiles = listSessionFiles();
        if (sessionFiles.length === 0) {
          logger.log('INVALID contracts :: no session artifacts found');
          return exit(1);
        }

        const invalid = [];
        sessionFiles.forEach((sessionPath) => {
          const sessionData = readSessionFile(sessionPath);
          const validation = validateSessionSummary(sessionData);
          const relative = path.relative(context.cwd, sessionPath).replace(/\\/g, '/');
          if (!validation.valid) {
            invalid.push({ relative, errors: validation.errors });
            logger.log(`INVALID ${relative} :: ${validation.errors.join('; ')}`);
            return;
          }
          logger.log(`OK ${relative}`);
        });

        if (invalid.length > 0) {
          return exit(1);
        }
        return;
      }

      if (regenerate) {
        const result = regenerateSession(file, { format, outputPath });
        if (check) {
          logger.log(`OK ${path.relative(context.cwd, result.targetPath).replace(/\\/g, '/')}`);
        } else {
          logger.log(`Session regenerated: ${path.relative(context.cwd, result.targetPath).replace(/\\/g, '/')}`);
        }
        return;
      }

      const sessionPath = resolveSessionFile(file);
      const sessionData = readSessionFile(sessionPath);
      const validation = validateSessionSummary(sessionData);

      if (check) {
        if (!validation.valid) {
          logger.log(`INVALID ${path.relative(context.cwd, sessionPath).replace(/\\/g, '/')} :: ${validation.errors.join('; ')}`);
          return exit(1);
        }
        logger.log(`OK ${path.relative(context.cwd, sessionPath).replace(/\\/g, '/')}`);
        return;
      }

      logger.log(c.heading(`\nSession: ${path.relative(context.cwd, sessionPath).replace(/\\/g, '/')}`));
      logger.log('-'.repeat(50));
      logger.log(`Mode: ${sessionData.mode}`);
      logger.log(`Request: ${sessionData.request}`);
      logger.log(`Persona: ${sessionData.persona.name} (${sessionData.persona.title})`);
      logger.log(`Schema: v${sessionData.version} ${validation.valid ? 'valid' : 'invalid'}`);
      logger.log('\nArtifacts:');

      Object.entries(sessionData.artifacts || {})
        .filter(([, value]) => value)
        .forEach(([key, value]) => {
          const fullPath = path.join(context.cwd, value);
          const exists = fs.existsSync(fullPath);
          const ignored = exists && isIgnoredByGrabby(context.cwd, fullPath);
          logger.log(`  - ${key}: ${value}${exists ? '' : ' (missing)'}${ignored ? ' (ignored)' : ''}`);
        });

      if (!validation.valid) {
        logger.log(`\n${c.error('Schema errors:')}`);
        validation.errors.forEach((error) => logger.log(`  - ${error}`));
        exit(1);
      }
    } catch (error) {
      if (check) {
        logger.log(`INVALID ${file} :: ${error.message}`);
      } else {
        logger.log(`Error: ${error.message}`);
      }
      exit(1);
    }
  }

  function resolve(file) {
    const filePath = resolveContract(file);
    if (!filePath) {
      return;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const planContext = resolveContextRefs({ docsDir: context.docsDir, contractContent: content, phase: 'plan', tokenBudget: 1200 });
    const executeContext = resolveContextRefs({ docsDir: context.docsDir, contractContent: content, phase: 'execute', tokenBudget: 1800 });
    logger.log(yaml.stringify({ plan: planContext, execute: executeContext }));
  }

  function upgradeContract(file) {
    const filePath = resolveContract(file);
    if (!filePath) {
      return;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const upgraded = upgradeContractVersions(content, context.docsDir);
    fs.writeFileSync(filePath, upgraded);
    logger.log(`✓ Upgraded version pins in ${path.basename(filePath)}`);
  }

  function metricsSummary() {
    const summary = summarizeFeatureMetrics(context.contractsDir);
    logger.log(yaml.stringify(summary));
  }

  function initHooks() {
    const hooksDir = path.join(context.cwd, '.git', 'hooks');
    const pkgHooksDir = path.join(context.pkgRoot, 'hooks');

    if (!fs.existsSync(path.join(context.cwd, '.git'))) {
      logger.log(c.error('Not a git repository. Initialize git first.'));
      exit(1);
      return;
    }

    if (!fs.existsSync(hooksDir)) {
      fs.mkdirSync(hooksDir, { recursive: true });
    }

    const hooks = ['pre-commit', 'commit-msg'];
    hooks.forEach((hook) => {
      const src = path.join(pkgHooksDir, hook);
      const dest = path.join(hooksDir, hook);

      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        // Make executable on Unix
        try {
          fs.chmodSync(dest, '755');
        } catch {
          // Windows doesn't support chmod
        }
        logger.log(c.success(`✓ Installed: .git/hooks/${hook}`));
      }
    });

    logger.log('');
    logger.log(c.heading('Git Hooks Installed'));
    logger.log('-'.repeat(50));
    logger.log('');
    logger.log('Hooks enforce contract-based workflow:');
    logger.log('  • pre-commit: Warns if no approved contract');
    logger.log('  • commit-msg: Suggests linking commits to contracts');
    logger.log('');
    logger.log('To enable strict mode (block commits without contracts):');
    logger.log(c.info('  export GRABBY_STRICT=1'));
    logger.log('');
  }

  return {
    init,
    initHooks,
    resolve,
    upgradeContract,
    metricsSummary,
    create,
    validate,
    plan,
    approve,
    execute,
    guard,
    audit,
    list,
    backlog,
    promptBundle,
    session,
    resolveContract,
    writeOutput: (content, filePath = null) => writeOutput({ content, filePath, logger, outputMode }),
  };
}

module.exports = {
  createProjectContext,
  createCommandHandlers,
  inferCreateRequest,
};



