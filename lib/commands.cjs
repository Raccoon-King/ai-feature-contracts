const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const yaml = require('yaml');
const { initConfig, loadConfig, renderPromptBundle } = require('./governance.cjs');
const {
  initConfig: initRepoConfig,
  loadConfig: loadRepoConfig,
  saveConfig: saveRepoConfig,
  getContractsDirectory,
  getTrackingMode,
} = require('./config.cjs');
const { generateBacklog, getBacklogPath } = require('./agile.cjs');
const { initGrabbyIgnore, isIgnoredByGrabby } = require('./ignore.cjs');
const { generateBaselineContracts, generateProjectContextArtifact } = require('./assessment.cjs');
const {
  getSessionPath,
  buildSessionSummary,
  validateSessionSummary,
} = require('./task-artifacts.cjs');
const { ensureIdMatchesFilename, extractContractId, slugifyTitle } = require('./id-utils.cjs');

const {
  validateContract,
  createContract,
  resolveContract: resolveContractFile,
  timestamp,
} = require('./core.cjs');
const { lintAgentDefinitions } = require('./personas.cjs');
const featuresLib = require('./features.cjs');
const {
  resolveContextRefs,
  checkVersionCompatibility,
  validateExecutionScope,
  collectFeatureMetrics,
  saveFeatureMetrics,
  summarizeFeatureMetrics,
  upgradeContractVersions,
  lintContextIndex,
  findCompletedContractsInActive,
} = require('./governance-runtime.cjs');

function createProjectContext({ cwd, pkgRoot }) {
  const repoConfig = loadRepoConfig(cwd);
  const contractsDir = getContractsDirectory(cwd, repoConfig);
  return {
    cwd,
    pkgRoot,
    templatesDir: path.join(pkgRoot, 'templates'),
    docsDir: path.join(pkgRoot, 'docs'),
    contractsDir,
    grabbyDir: path.join(cwd, '.grabby'),
    trackingMode: getTrackingMode(repoConfig, cwd),
  };
}

function ensureContractsDir(contractsDir) {
  if (!fs.existsSync(contractsDir)) {
    fs.mkdirSync(contractsDir, { recursive: true });
  }
}

function getPlanEntries(planData = {}) {
  if (Array.isArray(planData.files)) {
    return planData.files;
  }

  const legacyEntries = [];
  const createEntries = Array.isArray(planData.files_to_create) ? planData.files_to_create : [];
  const modifyEntries = Array.isArray(planData.files_to_modify) ? planData.files_to_modify : [];

  createEntries.forEach((entry) => legacyEntries.push({ action: 'create', path: entry }));
  modifyEntries.forEach((entry) => legacyEntries.push({ action: 'modify', path: entry }));

  return legacyEntries;
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

function appendLocalFeatureLog(context, entry) {
  if (context.trackingMode !== 'local-only') {
    return;
  }

  if (!fs.existsSync(context.grabbyDir)) {
    fs.mkdirSync(context.grabbyDir, { recursive: true });
  }

  const logPath = path.join(context.grabbyDir, 'feature-log.json');
  const current = fs.existsSync(logPath)
    ? JSON.parse(fs.readFileSync(logPath, 'utf8'))
    : { entries: [] };

  current.entries.push({
    ...entry,
    trackedAt: timestamp(),
    contractsDir: path.relative(context.cwd, context.contractsDir).replace(/\\/g, '/'),
  });

  fs.writeFileSync(logPath, JSON.stringify(current, null, 2) + '\n');
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


function extractContractTitle(content, fileName = '') {
  return content.match(/^# FC:\s+(.+)$/m)?.[1] || content.match(/^#\s+(.+)$/m)?.[1] || fileName.replace(/\.fc\.md$/i, '');
}

function setOrInsertBranchLine(content, branchName) {
  if (/\*\*Branch:\*\*\s*\S+/i.test(content)) {
    return content.replace(/\*\*Branch:\*\*\s*\S+/i, `**Branch:** ${branchName}`);
  }
  if (/\*\*ID:\*\*[^\n\r]*/i.test(content)) {
    return content.replace(/(\*\*ID:\*\*[^\n\r]*)(\r?\n)/i, `$1\n**Branch:** ${branchName}$2`);
  }
  return `${content.trimEnd()}\n\n**Branch:** ${branchName}\n`;
}

function extractDoneWhenSection(content) {
  return content.match(/## Done When\s*\n([\s\S]*?)(?:\n## |$)/)?.[1]?.trim() || '- Not specified';
}


function prefixedError(message, suggestion = '') {
  return `[GRABBY] ${message}${suggestion ? ` Suggestion: ${suggestion}` : ''}`;
}

function normalizeRepoPath(targetPath) {
  return String(targetPath || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function getArtifactPaths(context, id) {
  return {
    planPath: path.join(context.contractsDir, `${id}.plan.yaml`),
    auditPath: path.join(context.contractsDir, `${id}.audit.md`),
    metricsPath: path.join(context.grabbyDir, 'metrics', `${id}.metrics.json`),
  };
}

function getInteractiveSessionDir(context) {
  return path.join(context.grabbyDir, 'session');
}

function ensureInteractiveSessionDir(context) {
  const sessionDir = getInteractiveSessionDir(context);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }
  return sessionDir;
}

function getInteractiveSessionPath(context, id) {
  ensureInteractiveSessionDir(context);
  return path.join(getInteractiveSessionDir(context), `${String(id || '').trim().toUpperCase()}.json`);
}

function isInteractiveModeEnabled(context, options = {}) {
  const repoConfig = loadRepoConfig(context.cwd) || {};
  return options.interactive === true || repoConfig.interactive?.enabled === true;
}

function normalizeInteractiveAction(value) {
  if (!value) return null;
  return String(value).trim().toLowerCase().replace(/_/g, '-').replace(/\s+/g, '-');
}

function hashInteractiveValue(value) {
  if (!value) return null;
  return crypto.createHash('sha1').update(String(value)).digest('hex');
}

function saveInteractiveSession(context, id, session) {
  const sessionPath = getInteractiveSessionPath(context, id);
  const payload = {
    ticketId: String(id || '').trim().toUpperCase(),
    updatedAt: timestamp(),
    ...session,
  };
  fs.writeFileSync(sessionPath, `${JSON.stringify(payload, null, 2)}\n`);
  return sessionPath;
}

function renderInteractiveMenu(logger) {
  logger.log('Decision:');
  logger.log('  1) Continue');
  logger.log('  2) Revise Contract');
  logger.log('  3) Revise Plan');
  logger.log('  4) Switch Role');
  logger.log('  5) Pause');
  logger.log('  6) Abort');
}

function checkpointActionFromOptions(options = {}) {
  if (options.yes) {
    return 'continue';
  }
  return normalizeInteractiveAction(options.next);
}

function runInteractiveCommandCheckpoint(context, logger, id, checkpoint, options = {}) {
  if (!isInteractiveModeEnabled(context, options)) {
    return { action: 'continue', sessionPath: null };
  }

  const action = checkpointActionFromOptions(options);
  const sessionPath = saveInteractiveSession(context, id, checkpoint.session);

  logger.log('-'.repeat(50));
  logger.log('INTERACTIVE BREAKPOINT');
  logger.log('-'.repeat(50));
  logger.log(`Phase: ${checkpoint.phase}`);
  logger.log(`Breakpoint: ${checkpoint.interactionPoint}`);
  logger.log(`Suggested role: ${checkpoint.suggestedRole}`);
  logger.log('Current state:');
  checkpoint.completed.forEach((item) => logger.log(`  - ${item}`));
  logger.log(`Next: ${checkpoint.next}`);

  if (!action) {
    renderInteractiveMenu(logger);
    logger.log(`Session: ${path.relative(context.cwd, sessionPath).replace(/\\/g, '/')}`);
    logger.log('Use --yes to continue automatically or --next <action> to script the next step.');
    return { action: 'pause', sessionPath };
  }

  if (action === 'switch-role') {
    logger.log(`Role reframed to: ${checkpoint.suggestedRole}`);
    return { action: 'continue', sessionPath };
  }

  if (action !== 'continue') {
    renderInteractiveMenu(logger);
    logger.log(`Next command: ${checkpoint.nextCommand}`);
  }

  return { action, sessionPath };
}

const BASELINE_README_SECTION = `## Baseline Contracts

\`grabby init\` can seed baseline contracts for the repository:

- \`SYSTEM-BASELINE.fc.md\` captures Grabby governance defaults for the project
- \`PROJECT-BASELINE.fc.md\` captures the detected local stack and directory layout

Review generated baseline contracts before using them as implementation scope.
`;

function ensureGovernanceLock(context) {
  const lockPath = path.join(context.grabbyDir, 'governance.lock');
  if (fs.existsSync(lockPath)) return lockPath;
  const pkg = JSON.parse(fs.readFileSync(path.join(context.pkgRoot, 'package.json'), 'utf8'));
  const lock = {
    governance: {
      version: pkg.version || '0.0.0',
      profile: 'default',
      rules_version: 'v1',
    },
  };
  if (!fs.existsSync(context.grabbyDir)) fs.mkdirSync(context.grabbyDir, { recursive: true });
  fs.writeFileSync(lockPath, yaml.stringify(lock));
  return lockPath;
}

function readPackageScripts(pkgPath) {
  if (!fs.existsSync(pkgPath)) {
    return {};
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg && typeof pkg.scripts === 'object' && pkg.scripts ? pkg.scripts : {};
  } catch {
    return {};
  }
}

function runProjectCheck({ execSyncImpl, cwd, scripts, scriptName, label }) {
  const script = scripts[scriptName];
  if (!script) {
    return {
      name: label,
      status: 'not_configured',
      summary: `${label}: not configured`,
    };
  }

  // Treat explicit placeholder scripts as intentionally unconfigured so audit
  // does not fail on repositories that have not adopted a real lint/build step yet.
  if (
    (scriptName === 'lint' || scriptName === 'build') &&
    /^\s*echo\b/i.test(script) &&
    /\bno\s+(lint|build)\s+configured\b/i.test(script)
  ) {
    return {
      name: label,
      status: 'not_configured',
      summary: `${label}: not configured (noop script)`,
    };
  }

  try {
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    execSyncImpl(`${npmCommand} run ${scriptName}`, { stdio: 'pipe', cwd });
    return {
      name: label,
      status: 'passed',
      summary: `${label}: passed`,
    };
  } catch (error) {
    return {
      name: label,
      status: 'failed',
      summary: `${label}: failed`,
      details: error && error.message ? error.message : String(error),
    };
  }
}

function readWorkflowChecklist(context, workflowName) {
  const checklistPath = path.join(context.pkgRoot, 'workflows', workflowName, 'checklist.md');
  if (!fs.existsSync(checklistPath)) {
    return null;
  }
  return fs.readFileSync(checklistPath, 'utf8').trim();
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
      logger.log(`? ${prefixedError(error.message, 'Ensure contract filename ID matches **ID:** content.')}`);
      if (!file) {
        return exit(1);
      }
      logger.log(`  Looked in: ${context.contractsDir}`);
      return exit(1);
    }
  }

  async function init(options = {}) {
    logger.log('Initializing Grabby in current project...\n');

    const createdArtifacts = [];
    const preservedArtifacts = [];
    const updatedArtifacts = [];
    const noteCreated = (artifactPath) => createdArtifacts.push(artifactPath);
    const notePreserved = (artifactPath) => preservedArtifacts.push(artifactPath);
    const noteUpdated = (artifactPath) => updatedArtifacts.push(artifactPath);
    const isBrownfieldRepo = fs.existsSync(path.join(context.cwd, 'package.json'))
      || ['src', 'lib', 'app', 'tests', 'docs', '.git'].some((name) => fs.existsSync(path.join(context.cwd, name)));

    if (!fs.existsSync(context.contractsDir)) {
      noteCreated(path.relative(context.cwd, context.contractsDir).replace(/\\/g, '/'));
    }
    ensureContractsDir(context.contractsDir);
    const hadConfig = fs.existsSync(path.join(context.cwd, '.grabby', 'config.json'));
    const hadRepoConfig = fs.existsSync(path.join(context.cwd, 'grabby.config.json'));
    const hadIgnore = fs.existsSync(path.join(context.cwd, '.grabbyignore'));
    const hadLock = fs.existsSync(path.join(context.grabbyDir, 'governance.lock'));
    const configPath = initConfig(context.cwd);
    const repoConfigResult = initRepoConfig(context.cwd);
    const ignorePath = initGrabbyIgnore(context.cwd);
    const lockPath = ensureGovernanceLock(context);
    const projectDocs = path.join(context.cwd, 'docs');
    if (!fs.existsSync(projectDocs)) {
      fs.mkdirSync(projectDocs, { recursive: true });
      noteCreated('docs/');
    }
    (hadConfig ? notePreserved : noteCreated)(path.relative(context.cwd, configPath).replace(/\\/g, '/'));
    (hadRepoConfig ? notePreserved : noteCreated)(path.relative(context.cwd, repoConfigResult.file).replace(/\\/g, '/'));
    (hadIgnore ? notePreserved : noteCreated)(path.relative(context.cwd, ignorePath).replace(/\\/g, '/'));
    (hadLock ? notePreserved : noteCreated)(path.relative(context.cwd, lockPath).replace(/\\/g, '/'));

    if (options.interactive) {
      const repoConfig = loadRepoConfig(context.cwd) || initRepoConfig(context.cwd);
      const nextRepoConfig = repoConfig.file ? loadRepoConfig(context.cwd) : repoConfig;
      nextRepoConfig.interactive = {
        ...(nextRepoConfig.interactive || {}),
        enabled: true,
      };
      saveRepoConfig(nextRepoConfig, context.cwd);

      const governanceConfig = loadConfig(context.cwd) || {};
      governanceConfig.interactive = {
        ...(governanceConfig.interactive || {}),
        enabled: true,
      };
      fs.writeFileSync(configPath, `${JSON.stringify(governanceConfig, null, 2)}\n`);
      logger.log('  ? Enabled interactive mode by default');
      noteUpdated(path.relative(context.cwd, repoConfigResult.file).replace(/\\/g, '/'));
      noteUpdated(path.relative(context.cwd, configPath).replace(/\\/g, '/'));
    }

    const docFiles = ['ARCHITECTURE_INDEX.md', 'RULESET_CORE.md', 'ENV_STACK.md', 'EXECUTION_PROTOCOL.md'];
    docFiles.forEach((file) => {
      const src = path.join(context.docsDir, file);
      const dest = path.join(projectDocs, file);
      if (fs.existsSync(src) && !fs.existsSync(dest)) {
        fs.copyFileSync(src, dest);
        logger.log(`  ? Created docs/${file}`);
        noteCreated(`docs/${file}`);
      } else if (fs.existsSync(dest)) {
        notePreserved(`docs/${file}`);
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
      logger.log('  ? Created contracts/README.md');
      noteCreated('contracts/README.md');
    }
    const readmeContent = fs.readFileSync(readmePath, 'utf8');
    if (!readmeContent.includes('## Baseline Contracts')) {
      fs.writeFileSync(readmePath, `${readmeContent.trimEnd()}\n\n${BASELINE_README_SECTION}`, 'utf8');
      logger.log('  ? Updated contracts/README.md with baseline contract guidance');
      noteUpdated('contracts/README.md');
    } else {
      notePreserved('contracts/README.md');
    }

    // Install router rules for agent surfaces
    const routerRulesContent = `# Grabby Core Router Rules (Managed)

## Feature Request Detection

When the user asks to implement, add, create, build, fix, refactor, or change functionality:

1. **Check for existing contract reference**
   - If the request mentions \`contracts/<ID>.fc.md\` or a valid contract ID (e.g., \`GRAB-001\`), use that contract.
   - Otherwise, this is an **uncontracted feature request**.

2. **Route uncontracted requests through ticket intake**
   - Do NOT start planning or implementation immediately.
   - Ask for structured ticket information:
     - **Who** is this for?
     - **What** should be built or changed?
     - **Why** is this needed?
     - **Definition of Done** (acceptance criteria)

3. **Generate contract draft**
   - Once ticket fields are complete, create \`contracts/<ID>.fc.md\` as a draft.
   - Generate \`contracts/<ID>.plan.yaml\` without modifying implementation files.

## Phase Boundaries

### Plan Phase
- Read and analyze the contract.
- Generate the plan file.
- **NO code modifications allowed.**
- Output must be plan artifacts only.

### Approval Gate
- Execution is **blocked** until the plan contains \`approval_token: Approved\`.
- Do not proceed to execute phase without explicit approval.

### Execute Phase
- Only modify files listed in the plan's \`files:\` section.
- Stay within the contract's \`Allowed\` directories.
- Never touch \`Restricted\` directories.

## Scope Enforcement

- If a file is not in the plan, do not modify it.
- If a directory is restricted, do not create or edit files there.
- If blocked, stop and report the issue.

## ID Normalization

Work item IDs must match \`[A-Z][A-Z0-9]+-\\d+\` and are normalized to uppercase.

## Recovery

If you encounter a blocked state:
1. Report the specific blocker.
2. Do not attempt workarounds that bypass governance.
3. Wait for user guidance or contract amendment.

---
*This file is managed by \`grabby init\`. Local overrides go in \`90-local-overrides.md\`.*
`;

    const managedFiles = [
      { file: path.join(context.cwd, '.clinerules', '00-grabby-core.md'), content: routerRulesContent, managed: true },
      { file: path.join(context.cwd, '.clinerules', '90-local-overrides.md'), content: '# Local overrides\n\nAdd repository-specific overrides here.\n', managed: false },
      { file: path.join(context.cwd, '.continue', 'rules', '00-grabby-core.md'), content: routerRulesContent, managed: true },
      { file: path.join(context.cwd, '.continue', 'rules', '90-local-overrides.md'), content: '# Local overrides\n\nAdd repository-specific overrides here.\n', managed: false },
      { file: path.join(context.cwd, '.codex', 'prompts', 'router.md'), content: routerRulesContent, managed: true },
    ];
    managedFiles.forEach(({ file, content, managed }) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (managed) {
        // Always overwrite managed files
        const existed = fs.existsSync(file);
        fs.writeFileSync(file, content);
        (existed ? noteUpdated : noteCreated)(path.relative(context.cwd, file).replace(/\\/g, '/'));
      } else if (!fs.existsSync(file)) {
        // Only create override files if they don't exist
        fs.writeFileSync(file, content);
        noteCreated(path.relative(context.cwd, file).replace(/\\/g, '/'));
      } else {
        notePreserved(path.relative(context.cwd, file).replace(/\\/g, '/'));
      }
    });

    try {
      const baselineResult = await generateBaselineContracts({
        cwd: context.cwd,
        contractsDir: context.contractsDir,
        templatesDir: context.templatesDir,
      });
      baselineResult.created.forEach((fileName) => {
        logger.log(`  ? Created contracts/${fileName}`);
        noteCreated(`contracts/${fileName}`);
      });
      baselineResult.skipped.forEach((fileName) => {
        logger.log(`  ? Preserved existing contracts/${fileName}`);
        notePreserved(`contracts/${fileName}`);
      });
      logger.log(`  ? Baseline assessment: ${baselineResult.summary}`);
    } catch (error) {
      logger.log(`  ? Baseline assessment skipped: ${error.message}`);
    }

    try {
      const projectContextPath = path.join(context.grabbyDir, 'project-context.json');
      const hadProjectContext = fs.existsSync(projectContextPath);
      const projectContextResult = await generateProjectContextArtifact({ cwd: context.cwd });
      logger.log(`  ? Project context: ${path.relative(context.cwd, projectContextResult.outputPath).replace(/\\/g, '/')}`);
      logger.log(`  ? Context summary: ${projectContextResult.summary}`);
      (hadProjectContext ? noteUpdated : noteCreated)(path.relative(context.cwd, projectContextResult.outputPath).replace(/\\/g, '/'));
    } catch (error) {
      logger.log(`  ? Project context skipped: ${error.message}`);
    }

    logger.log('\nSetup summary');
    logger.log(`  Mode: ${isBrownfieldRepo ? 'brownfield' : 'greenfield'}`);
    if (createdArtifacts.length > 0) {
      logger.log(`  Created: ${createdArtifacts.join(', ')}`);
    }
    if (updatedArtifacts.length > 0) {
      logger.log(`  Updated: ${updatedArtifacts.join(', ')}`);
    }
    if (preservedArtifacts.length > 0) {
      logger.log(`  Preserved: ${preservedArtifacts.join(', ')}`);
    }
    logger.log('\nNext steps');
    if (isBrownfieldRepo) {
      logger.log('  1. Review contracts/PROJECT-BASELINE.fc.md and contracts/SYSTEM-BASELINE.fc.md against the existing repo.');
      logger.log('  2. Review .grabby/project-context.json and keep it aligned with the repo.');
      logger.log('  3. Start bounded work with grabby ticket "<request>" or grabby task "<request>".');
      logger.log('  4. Validate and plan before editing brownfield code.');
    } else {
      logger.log('  1. Create your first contract with grabby create "feature-name" or grabby task "<request>".');
      logger.log('  2. Validate and plan before editing code.');
    }
    logger.log('\n? Initialized! Run `grabby create "feature-name"` to start.\n');
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
      appendLocalFeatureLog(context, {
        id: result.id,
        title: request.name,
        type: request.templateName,
        contractFile: path.relative(context.cwd, result.filePath).replace(/\\/g, '/'),
      });
      logger.log(`? Created: ${path.relative(context.cwd, result.filePath).replace(/\\/g, '/')}`);
      logger.log(`  ID: ${result.id}`);
      logger.log(`  Template: ${request.templateName}`);
      logger.log('\nNext: Edit the contract, then run:');
      logger.log(`  grabby validate ${result.fileName}`);
    } catch (error) {
      logger.log(`? ${prefixedError(error.message, 'Ensure contract filename ID matches **ID:** content.')}`);
      exit(1);
    }
  }

  function validate(file) {
    const filePath = resolveContract(file);
    if (!filePath) {
      return;
    }

    let canonicalId;
    try {
      canonicalId = ensureIdMatchesFilename(filePath);
    } catch (error) {
      logger.log(`? ${prefixedError(error.message, 'Ensure contract filename ID matches **ID:** content.')}`);
      exit(1);
      return;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lockPath = path.join(context.grabbyDir, 'governance.lock');
    if (fs.existsSync(lockPath)) {
      try {
        const lock = yaml.parse(fs.readFileSync(lockPath, 'utf8'));
        const pkg = JSON.parse(fs.readFileSync(path.join(context.pkgRoot, 'package.json'), 'utf8'));
        if (lock?.governance?.version && lock.governance.version !== pkg.version) {
          logger.log(c.warn(`[GRABBY] governance.lock version (${lock.governance.version}) differs from CLI version (${pkg.version}).`));
        }
      } catch {}
    }
    const result = validateContract(content);
    const versionCheck = checkVersionCompatibility(content, context.docsDir);
    result.errors.push(...versionCheck.errors);
    result.warnings.push(...versionCheck.warnings);
    const normalizedContractPath = path.relative(context.cwd, filePath).replace(/\\/g, '/');
    const contractStatus = String(content.match(/\*\*Status:\*\*\s*([^\n\r|]+)/i)?.[1] || '').trim().toLowerCase();
    if (normalizedContractPath.startsWith('contracts/active/') && ['complete', 'completed'].includes(contractStatus)) {
      result.errors.push('Completed features must not remain in contracts/active/. Close and archive the feature instead.');
    }
    const completedInActive = findCompletedContractsInActive(context.cwd);
    if (completedInActive.includes(normalizedContractPath)) {
      result.errors.push('Completed features must not remain in contracts/active/. Close and archive the feature instead.');
    }
    const legacyTicketFiles = featuresLib.findLegacyTicketFiles(context.cwd);
    if (legacyTicketFiles.length > 0) {
      result.warnings.push(`Standalone ticket markdown is deprecated: ${legacyTicketFiles.join(', ')}`);
      result.warnings.push('Migrate ticket content into contracts/<ID>.fc.md and keep external tickets as references only.');
    }
    result.valid = result.errors.length === 0;
    const fileName = path.basename(filePath);

    logger.log(c.heading(`\nValidating: ${fileName}`));
    logger.log('-'.repeat(50));

    if (result.stats) {
      logger.log(`\n${c.dim('Stats:')} ${result.stats.scopeItems} scope items, ${result.stats.fileCount} files, ${result.stats.checkboxCount} done-when criteria`);
    }

    if (result.errors.length > 0) {
      logger.log(`\n${c.error(`? Errors (${result.errors.length}):`)} `);
      result.errors.forEach((error) => logger.log(`  ${c.error('•')} ${error}`));
    }

    if (result.warnings.length > 0) {
      logger.log(`\n${c.warn(`? Warnings (${result.warnings.length}):`)} `);
      result.warnings.forEach((warning) => logger.log(`  ${c.warn('•')} ${warning}`));
    }

    if (result.suggestions && result.suggestions.length > 0) {
      logger.log(`\n${c.info('Suggestions:')}`);
      result.suggestions.forEach((suggestion) => logger.log(`  ${c.dim('•')} ${suggestion}`));
    }

    logger.log(`\n${'-'.repeat(50)}`);

    if (result.valid) {
      logger.log(result.warnings.length > 0 ? c.warn('? Validation passed with warnings') : c.success('? Validation passed'));
      logger.log(`\nNext: ${c.info(`grabby plan ${fileName}`)}`);
      return;
    }

    logger.log(c.error('? Validation failed - fix errors above'));
    exit(1);
  }

  function plan(file) {
    const filePath = resolveContract(file);
    if (!filePath) {
      return;
    }

    let canonicalId;
    try {
      canonicalId = ensureIdMatchesFilename(filePath);
    } catch (error) {
      logger.log(`? ${prefixedError(error.message, 'Ensure contract filename ID matches **ID:** content.')}`);
      exit(1);
      return;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const fileName = path.basename(filePath);
    const validation = validateContract(content);

    if (!validation.valid) {
      logger.log(`? Contract has validation errors. Run: grabby validate ${fileName}`);
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
      approval_token_required: 'Approved',
      execution_mode: 'plan_only',
    };

    if (content.includes('CONTRACT_TYPE: ARCH_CHANGE_CONTRACT') && !content.includes('ARCH_APPROVED: true')) {
      logger.log('? ARCH_CHANGE_CONTRACT requires ARCH_APPROVED: true before execution');
      exit(1);
      return;
    }

    const { planPath } = getArtifactPaths(context, canonicalId);
    const planFile = path.basename(planPath);
    fs.writeFileSync(planPath, yaml.stringify(planData));

    logger.log('-'.repeat(50));
    logger.log('PHASE 1: PLAN');
    logger.log('-'.repeat(50));
    logger.log(yaml.stringify(planData));
    logger.log('Plan-only phase: no implementation files may be modified until approval is recorded.');
    logger.log(`Saved: contracts/${planFile}`);
    logger.log(`\nNext: grabby approve ${fileName}`);
  }

  function approve(file) {
    const filePath = resolveContract(file);
    if (!filePath) {
      return;
    }

    let canonicalId;
    try {
      canonicalId = ensureIdMatchesFilename(filePath);
    } catch (error) {
      logger.log(`? ${prefixedError(error.message, 'Ensure contract filename ID matches **ID:** content.')}`);
      exit(1);
      return;
    }

    const { planPath } = getArtifactPaths(context, canonicalId);
    const fileName = path.basename(filePath);
    if (!fs.existsSync(planPath)) {
      logger.log(`? No plan found. Run: grabby plan ${fileName}`);
      exit(1);
      return;
    }
    const planData = yaml.parse(fs.readFileSync(planPath, 'utf8'));
    planData.status = 'approved';
    planData.approved_at = timestamp();
    planData.approval_token = 'Approved';
    fs.writeFileSync(planPath, yaml.stringify(planData));

    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/\*\*Status:\*\*\s*\w+/, '**Status:** approved');
    fs.writeFileSync(filePath, content);

    logger.log('? Contract approved');
    logger.log(`\nNext: grabby execute ${fileName}`);
  }

  function guard(file) {
    const filePath = resolveContract(file);
    if (!filePath) {
      return;
    }

    const fileName = path.basename(filePath);
    const canonicalId = ensureIdMatchesFilename(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const { planPath } = getArtifactPaths(context, canonicalId);
    const planFile = path.basename(planPath);
    if (!fs.existsSync(planPath)) {
      logger.log(`? No plan found. Run: grabby plan ${fileName}`);
      exit(1);
      return;
    }

    const planData = yaml.parse(fs.readFileSync(planPath, 'utf8'));
    if (planData.status !== 'approved' && planData.status !== 'executing') {
      logger.log(`? Plan is not approved (current status: ${planData.status || 'unknown'}). Run: grabby approve ${fileName}`);
      exit(1);
      return;
    }

    const scopeValidation = validateExecutionScope({
      cwd: context.cwd,
      planData,
      contractContent: content,
    });

    if (!scopeValidation.valid) {
      logger.log('? Guard violations detected. Action: revert out-of-scope changes or update plan/contract.');
      scopeValidation.violations.forEach((v) => logger.log(`  - ${v}`));
      exit(1);
      return;
    }

    logger.log('? Guard passed (no scope violations)');
  }

  function execute(file, options = {}) {
    const filePath = resolveContract(file);
    if (!filePath) {
      return;
    }

    const fileName = path.basename(filePath);
    const canonicalId = ensureIdMatchesFilename(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.includes('**Status:** approved')) {
      logger.log(`? Contract not approved. Run: grabby approve ${fileName}`);
      exit(1);
      return;
    }

    const { planPath } = getArtifactPaths(context, canonicalId);
    const planFile = path.basename(planPath);
    if (!fs.existsSync(planPath)) {
      logger.log(`? No plan found. Run: grabby plan ${fileName}`);
      exit(1);
      return;
    }

    const planData = yaml.parse(fs.readFileSync(planPath, 'utf8'));
    if (planData.status !== 'approved') {
      logger.log(`? Plan is not approved (current status: ${planData.status || 'unknown'}). Reply with "Approved" and run: grabby approve ${fileName}`);
      exit(1);
      return;
    }
    const resolvedContext = resolveContextRefs({
      docsDir: context.docsDir,
      contractContent: content,
      phase: 'execute',
      tokenBudget: 1800,
    });
    logger.log('-'.repeat(50));
    logger.log('PHASE 2: EXECUTE');
    logger.log('-'.repeat(50));
    logger.log('\nContext:');
    if (Array.isArray(planData.context)) {
      planData.context.forEach((entry) => logger.log(`  @context ${entry}`));
    }
    const legacy = { ARCH: 'ARCH_INDEX_v1', RULESET: 'RULESET_CORE_v1', ENV: 'ENV_STACK_v1' };
    resolvedContext.resolved.forEach((entry) => {
      logger.log(`  @context ${legacy[entry.kind] || entry.kind}`);
      logger.log(`  @resolved ${entry.kind}:${entry.ref} (${entry.tokens}t)`);
    });
    const planRules = Array.isArray(planData.rules) ? planData.rules : [];
    const planEntries = getPlanEntries(planData);
    logger.log('\nFiles:');
    planEntries.forEach((entry) => logger.log(`  ${entry.action}: ${entry.path}`));
    logger.log('\nRules:');
    planRules.forEach((entry) => logger.log(`  ${entry}`));
    const verificationChecklist = readWorkflowChecklist(context, 'test-engineer');
    if (verificationChecklist) {
      logger.log('\nVerification Checklist:');
      verificationChecklist.split(/\r?\n/).forEach((line) => logger.log(`  ${line}`));
    }
    logger.log(`\n${'-'.repeat(50)}`);
    logger.log('\nCopy the above to Cline/Claude Code.');
    logger.log(`After completion: grabby audit ${fileName}\n`);

    const scopeValidation = validateExecutionScope({
      cwd: context.cwd,
      planData: { ...planData, files: planEntries },
      contractContent: content,
    });

    if (!scopeValidation.valid) {
      logger.log('? Execution guard failure: scope drift detected after execution.');
      logger.log('  Action: revert out-of-scope changes or update plan/contract, then re-run execute.');
      scopeValidation.violations.forEach((v) => logger.log(`  - ${v}`));
      exit(1);
      return;
    }

    planData.status = 'executing';
    planData.executed_at = timestamp();
    planData.execution_guard = 'passed';
    fs.writeFileSync(planPath, yaml.stringify(planData));

    if (isInteractiveModeEnabled(context, options)) {
      saveInteractiveSession(context, canonicalId, {
        currentPhase: 'execution',
        lastInteractionPoint: 'execution-handoff',
        selectedRole: 'dev',
        approvedPlanHash: hashInteractiveValue(fs.readFileSync(planPath, 'utf8')),
      });
    }

    const metrics = collectFeatureMetrics({
      cwd: context.cwd,
      contractFileName: `${canonicalId}.fc.md`,
      planData,
      contextStats: { plan: planData.context_token_usage || 0, execute: resolvedContext.tokenUsage },
      violations: scopeValidation.violations,
    });
    const metricsPath = saveFeatureMetrics(path.join(context.grabbyDir, 'metrics'), metrics);
    logger.log(`Metrics: ${path.relative(context.cwd, metricsPath).replace(/\\/g, '/')}`);
  }

  function audit(file, options = {}) {
    const filePath = resolveContract(file);
    if (!filePath) {
      return;
    }

    const fileName = path.basename(filePath);
    const contractContent = fs.readFileSync(filePath, 'utf8');
    const canonicalId = ensureIdMatchesFilename(filePath);
    const { planPath, auditPath } = getArtifactPaths(context, canonicalId);
    const planData = fs.existsSync(planPath)
      ? yaml.parse(fs.readFileSync(planPath, 'utf8'))
      : null;
    const contractStatus = String(contractContent.match(/\*\*Status:\*\*\s*([^\n\r|]+)/i)?.[1] || 'unknown').trim() || 'unknown';

    logger.log('-'.repeat(50));
    logger.log('POST-EXECUTION AUDIT');
    logger.log('-'.repeat(50));
    logger.log(`\nContract: ${fileName}`);
    logger.log(`Status: ${contractStatus}`);
    logger.log('\nFiles specified:');

    const planEntries = getPlanEntries(planData || {});
    if (planEntries.length > 0) {
      planEntries.forEach((entry) => {
        const exists = fs.existsSync(path.join(context.cwd, entry.path));
        const icon = entry.action === 'create' ? (exists ? '+' : 'x') : '~';
        logger.log(`  ${icon} ${entry.action}: ${entry.path}`);
      });
    }
    const auditChecklist = readWorkflowChecklist(context, 'audit-contract');
    if (auditChecklist) {
      logger.log('\nAudit Checklist:');
      auditChecklist.split(/\r?\n/).forEach((line) => logger.log(`  ${line}`));
    }

    const beforeTests = runInteractiveCommandCheckpoint(context, logger, canonicalId, {
      phase: 'verification',
      interactionPoint: 'after-code-changes',
      suggestedRole: 'Test Engineer',
      completed: [
        `Execution complete for ${fileName}`,
        'Code changes are ready for verification',
      ],
      next: 'Run tests and quality checks',
      nextCommand: `grabby audit ${fileName} --yes`,
      session: {
        currentPhase: 'verification',
        lastInteractionPoint: 'after-code-changes',
        selectedRole: 'tester',
        approvedPlanHash: planData ? hashInteractiveValue(fs.readFileSync(planPath, 'utf8')) : null,
      },
    }, options);
    if (beforeTests.action !== 'continue') {
      logger.log('Audit paused before test execution.');
      return;
    }

    logger.log('\nRunning checks...');
    const pkgPath = path.join(context.cwd, 'package.json');
    const checks = [];
    if (fs.existsSync(pkgPath)) {
      const scripts = readPackageScripts(pkgPath);
      checks.push(runProjectCheck({ execSyncImpl, cwd: context.cwd, scripts, scriptName: 'lint', label: 'Lint' }));
      checks.push(runProjectCheck({ execSyncImpl, cwd: context.cwd, scripts, scriptName: 'build', label: 'Build' }));

      checks.forEach((check) => {
        if (check.status === 'passed') {
          logger.log(`  + ${check.summary}`);
        } else if (check.status === 'not_configured') {
          logger.log(`  - ${check.summary}`);
        } else {
          logger.log(`  x ${check.summary}`);
        }
      });
    }

    const afterTests = runInteractiveCommandCheckpoint(context, logger, canonicalId, {
      phase: 'audit',
      interactionPoint: 'after-tests',
      suggestedRole: 'Test Engineer',
      completed: checks.length > 0
        ? checks.map((check) => check.summary)
        : ['No project checks configured'],
      next: 'Write audit artifact and close the verification loop',
      nextCommand: `grabby audit ${fileName} --yes`,
      session: {
        currentPhase: 'audit',
        lastInteractionPoint: 'after-tests',
        selectedRole: 'tester',
        approvedPlanHash: planData ? hashInteractiveValue(fs.readFileSync(planPath, 'utf8')) : null,
      },
    }, options);
    if (afterTests.action !== 'continue') {
      logger.log('Audit paused before final audit writeout.');
      return;
    }

    const auditStatus = checks.some((check) => check.status === 'failed')
      ? 'needs_attention'
      : (checks.length > 0 ? 'complete' : 'pending');
    const auditLines = [
      `# Audit: ${canonicalId}`,
      '',
      `- Status: ${auditStatus}`,
    ];
    if (checks.length > 0) {
      auditLines.push('', '## Checks', ...checks.map((check) => `- ${check.summary}`));
    }
    fs.writeFileSync(auditPath, `${auditLines.join('\n')}\n`);

    logger.log(`\n${'-'.repeat(50)}`);
    logger.log(`Audit: ${path.relative(context.cwd, auditPath).replace(/\\/g, '/')}`);
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
      let id = '?';
      try { id = extractContractId(content, file); } catch {}
      const icons = {
        draft: '??',
        approved: '? ',
        executing: '?',
        complete: '??',
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
      logger.log(`? Contract has validation errors. Run: grabby validate ${fileName}`);
      exit(1);
      return;
    }

    const config = loadConfig(context.cwd);
    const backlogData = generateBacklog({ content, fileName, config });
    const backlogPath = getBacklogPath(context.contractsDir, fileName);
    fs.writeFileSync(backlogPath, yaml.stringify(backlogData));

    logger.log('-'.repeat(50));
    logger.log('AGILE BACKLOG');
    logger.log('-'.repeat(50));
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


  function start(file, { type = 'feat' } = {}) {
    const filePath = resolveContract(file);
    if (!filePath) return;

    const content = fs.readFileSync(filePath, 'utf8');
    const id = ensureIdMatchesFilename(filePath);
    const title = extractContractTitle(content, path.basename(filePath));
    const slug = slugifyTitle(title) || id.toLowerCase();
    const branchName = `${type}/${id}-${slug}`;

    try {
      execSyncImpl('git rev-parse --is-inside-work-tree', { cwd: context.cwd, stdio: 'pipe' });
      execSyncImpl(`git checkout -b ${branchName}`, { cwd: context.cwd, stdio: 'pipe' });
    } catch (_error) {
      logger.log(`Branch: ${branchName}`);
      logger.log('Git not available. Create the branch manually.');
      exit(1);
      return;
    }

    const updated = setOrInsertBranchLine(content, branchName);
    fs.writeFileSync(filePath, updated);
    logger.log(`? Created branch ${branchName}`);
    logger.log(`? Updated contract: ${path.basename(filePath)}`);
  }

  function prTemplate(file) {
    const filePath = resolveContract(file);
    if (!filePath) return;

    const content = fs.readFileSync(filePath, 'utf8');
    const id = ensureIdMatchesFilename(filePath);
    const title = extractContractTitle(content, path.basename(filePath));
    const planPath = `contracts/${id}.plan.yaml`;
    const auditPath = `contracts/${id}.audit.md`;
    const doneWhen = extractDoneWhenSection(content);

    const body = [
      `Title: ${id}: ${title}`,
      '',
      '## Ticket',
      `- ID: ${id}`,
      `- Contract: ${path.relative(context.cwd, filePath).replace(/\\/g, '/')}`,
      `- Plan: ${planPath}`,
      `- Audit: ${auditPath}`,
      '',
      '## Done When',
      doneWhen,
    ].join('\n');

    logger.log(body);
  }

  function cleanLocalContracts() {
    const localContractsDir = path.join(context.grabbyDir, 'contracts');
    const featureLogPath = path.join(context.grabbyDir, 'feature-log.json');
    const removed = [];

    if (fs.existsSync(localContractsDir)) {
      fs.rmSync(localContractsDir, { recursive: true, force: true });
      removed.push(path.relative(context.cwd, localContractsDir).replace(/\\/g, '/'));
    }

    if (fs.existsSync(featureLogPath)) {
      fs.rmSync(featureLogPath, { force: true });
      removed.push(path.relative(context.cwd, featureLogPath).replace(/\\/g, '/'));
    }

    if (removed.length === 0) {
      logger.log('No local-only Grabby artifacts found.');
      return;
    }

    logger.log('? Removed local-only Grabby artifacts:');
    removed.forEach((item) => logger.log(`  - ${item}`));
  }

  function featureClose(id, options = {}) {
    const normalizedId = String(id || '').trim().toUpperCase();
    if (!normalizedId) {
      logger.log('Usage: grabby feature:close <ID>');
      exit(1);
      return;
    }

    try {
      const checkpoint = runInteractiveCommandCheckpoint(context, logger, normalizedId, {
        phase: 'archive',
        interactionPoint: 'before-archive-close',
        suggestedRole: 'Analyst',
        completed: [
          `Feature ${normalizedId} is complete`,
          'All active artifacts are ready to compress and archive',
        ],
        next: 'Archive active artifacts and refresh the feature index',
        nextCommand: `grabby feature close ${normalizedId} --yes`,
        session: {
          currentPhase: 'archive',
          lastInteractionPoint: 'before-archive-close',
          selectedRole: 'analyst',
          approvedPlanHash: null,
        },
      }, options);
      if (checkpoint.action !== 'continue') {
        logger.log(`Archive paused for ${normalizedId}.`);
        return;
      }

      const result = featuresLib.createArchiveBundle(normalizedId, context.cwd);
      logger.log(`Archived feature ${result.id}`);
      logger.log(`History: ${result.historyFile}`);
      logger.log(`Index: ${result.indexPath}`);
      logger.log(`Closed: ${result.closedAt}`);
    } catch (error) {
      logger.log(prefixedError(error.message, 'Close only completed features with matching artifact IDs.'));
      exit(1);
    }
  }

  function featureGc(action = 'list', id = null, options = {}) {
    const normalizedAction = String(action || 'list').trim().toLowerCase();
    const normalizedId = id ? String(id).trim().toUpperCase() : null;

    if (normalizedAction === 'list' || normalizedAction === 'check') {
      const candidates = featuresLib.listGarbageCandidates(context.cwd, options);
      if (candidates.length === 0) {
        logger.log('No hanging contracts require garbage collection.');
        return;
      }

      logger.log('Hanging contracts:');
      candidates.forEach((candidate) => {
        logger.log(`- ${candidate.id}: ${candidate.staleReason}`);
        logger.log(`  Action: ${candidate.recommendedAction}`);
      });
      if (normalizedAction === 'check') {
        exit(1);
      }
      return;
    }

    if (!normalizedId) {
      logger.log('Usage: grabby feature gc <list|archive|keep> [ID] [reason]');
      exit(1);
      return;
    }

    try {
      const result = featuresLib.recordGarbageDisposition(normalizedId, normalizedAction, context.cwd, options);
      if (normalizedAction === 'archive') {
        logger.log(`Archived hanging feature ${result.id}`);
        logger.log(`Bundle: ${result.bundlePath}`);
        logger.log(`Index: ${result.indexPath}`);
        return;
      }

      logger.log(`Recorded garbage-collector disposition for ${result.id}`);
      logger.log(`Decision: ${result.disposition}`);
      logger.log(`Reason: ${result.reason}`);
      logger.log(`Index: ${result.indexPath}`);
    } catch (error) {
      logger.log(prefixedError(error.message, 'List candidates first with grabby feature gc.'));
      exit(1);
    }
  }


  function contextLint() {
    try {
      const result = lintContextIndex(context.docsDir);
      if (!result.valid) {
        result.errors.forEach((error) => logger.log(error));
        exit(1);
        return;
      }
      logger.log('? Context index is valid');
    } catch (error) {
      logger.log(prefixedError(error.message, 'Fix docs/context-index.yaml references and try again.'));
      exit(1);
    }
  }

  function policyCheck() {
    if (context.trackingMode === 'local-only') {
      logger.log('Policy check passed (contracts.trackingMode=local-only)');
      return;
    }

    const cfg = loadConfig(context.cwd) || {};
    const policy = cfg.contractRequired || {};
    const threshold = Number(policy.fileCountThreshold || 10);
    const restricted = policy.restrictedPaths || ['bin/', 'lib/', 'templates/', 'docs/', 'tests/'];

    let changed = [];
    const envChanged = process.env.GRABBY_CHANGED_FILES || '';
    if (envChanged.trim()) {
      changed = envChanged.split(/[\n,]/).map((line) => normalizeRepoPath(line.trim())).filter(Boolean);
    } else {
      try {
        const out = execSyncImpl('git diff --name-only --cached', { cwd: context.cwd, encoding: 'utf8' });
        changed = out.split('\n').map((line) => normalizeRepoPath(line.trim())).filter(Boolean);
      } catch {
        logger.log(prefixedError('Unable to inspect git diff.', 'Run this command in CI with git available or set GRABBY_CHANGED_FILES.'));
        exit(1);
        return;
      }
    }

    const implementationChanges = changed.filter((file) => !/^contracts\/.+\.(fc\.md|plan\.yaml|audit\.md|brief\.md|prompt\.md|backlog\.yaml|execute\.md|session\.(json|yaml))$/i.test(file));
    if (implementationChanges.length === 0) {
      logger.log('Policy check passed');
      return;
    }

    const triggers = implementationChanges.length >= threshold || implementationChanges.some((file) => restricted.some((rule) => file.startsWith(normalizeRepoPath(rule))));
    if (!triggers) {
      logger.log('Policy check passed');
      return;
    }

    const contractFiles = fs.existsSync(context.contractsDir) ? fs.readdirSync(context.contractsDir).filter((file) => file.endsWith('.fc.md')) : [];
    if (contractFiles.length === 0) {
      logger.log(prefixedError('Contract required by policy but none found.', 'Create a contract in contracts/<ID>.fc.md before merging.'));
      exit(1);
      return;
    }

    const scopedPlans = contractFiles.map((fileName) => {
      const contractPath = path.join(context.contractsDir, fileName);
      const contractContent = fs.readFileSync(contractPath, 'utf8');
      const contractId = extractContractId(contractContent, fileName);
      const { planPath } = getArtifactPaths(context, contractId);
      if (!fs.existsSync(planPath)) {
        return { fileName, missingPlan: true };
      }

      const planData = yaml.parse(fs.readFileSync(planPath, 'utf8'));
      const scopeValidation = validateExecutionScope({
        cwd: context.cwd,
        planData,
        contractContent,
        changedFiles: implementationChanges,
      });
      return { fileName, missingPlan: false, scopeValidation };
    });

    if (scopedPlans.some((entry) => entry.missingPlan)) {
      logger.log(prefixedError('Plan required by policy but at least one contract is missing contracts/<ID>.plan.yaml.', 'Run grabby plan <ID>.fc.md before merging.'));
      exit(1);
      return;
    }

    const hasValidScope = scopedPlans.some((entry) => entry.scopeValidation?.valid);
    if (!hasValidScope) {
      logger.log(prefixedError('Scope drift detected by policy.', 'Limit changes to planned files and allowed directories or update the governing contract and plan.'));
      scopedPlans.forEach((entry) => {
        (entry.scopeValidation?.violations || []).forEach((violation) => logger.log(`  - ${violation}`));
      });
      exit(1);
      return;
    }

    logger.log('Policy check passed');
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
    logger.log(`? Upgraded version pins in ${path.basename(filePath)}`);
  }

  function metricsSummary() {
    const summary = summarizeFeatureMetrics(path.join(context.grabbyDir, 'metrics'));
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
        logger.log(c.success(`? Installed: .git/hooks/${hook}`));
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

  function watch(options = {}) {
    ensureContractsDir(context.contractsDir);
    const { runWatchMode } = require('./watcher.cjs');
    return runWatchMode(context.contractsDir, {
      logger,
      ...options,
    });
  }

  function agentLint() {
    const result = lintAgentDefinitions({
      agentsDir: path.join(context.pkgRoot, 'agents'),
      workflowsDir: path.join(context.pkgRoot, 'workflows'),
    });
    if (result.results.length === 0) {
      logger.log('No agent definitions found.');
      return;
    }

    result.results.forEach((entry) => {
      const relative = path.relative(context.cwd, entry.filePath).replace(/\\/g, '/');
      const status = entry.valid ? 'OK' : 'FAIL';
      logger.log(`${status} ${relative}`);
      entry.errors.forEach((error) => logger.log(`  - ${error}`));
      entry.warnings.forEach((warning) => logger.log(`  - Warning: ${warning}`));
    });

    if (!result.valid) {
      exit(1);
    }
  }

  return {
    init,
    watch,
    agentLint,
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
    cleanLocalContracts,
    featureClose,
    featureGc,
    start,
    prTemplate,
    contextLint,
    policyCheck,
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




