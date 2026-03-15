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
const {
  saveDiscoveryArtifact,
  refreshDatabaseArtifacts,
  lintDatabaseArtifacts,
  detectMigrationOrSchemaChanges,
  looksLikeDbChangeContract,
  getDbArtifactPaths,
} = require('./db-awareness.cjs');
const {
  saveRepositoryDependencyGraph,
} = require('./dependency-analyzer.cjs');
const {
  loadGitState,
  saveGitState,
  summarizeGitStatus,
  syncWithRemote,
  createBranchFromContract,
  updateCurrentBranch,
  preflightGitState,
  renderStatusSummary,
} = require('./git-workflow.cjs');
const {
  saveSystemInventoryArtifact,
  refreshApiArtifacts,
  refreshFrontendArtifacts,
  lintApiArtifacts,
  lintFrontendArtifacts,
  detectApiSpecChanges,
  detectFrontendDependencyChanges,
  looksLikeApiChangeContract,
  looksLikeDepsChangeContract,
  getSystemArtifactPaths,
} = require('./system-awareness.cjs');
const { lintAgentDefinitions } = require('./personas.cjs');
const { updatePluginConfig } = require('./plugins.cjs');
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

function summarizeEnvironmentConstraints(config = {}) {
  const systemConstraints = config.systemGovernance?.constraints || {};
  const topology = config.systemGovernance?.topology || {};
  const pluginItems = config.plugins?.items || {};
  const lines = [];

  Object.entries(systemConstraints).forEach(([key, value]) => {
    if (value === true) {
      lines.push(`system.${key}=true`);
    }
  });

  if (topology.separatedDeployHost === true) {
    const devHost = topology.devHost || 'dev';
    const deployHost = topology.deployHost || 'deploy';
    lines.push(`topology.separatedDeployHost=true (${devHost} -> ${deployHost})`);
  }
  if (topology.clusterAccessFromDev === false) {
    lines.push('topology.clusterAccessFromDev=false');
  }
  if (topology.helmAccessFromDev === false) {
    lines.push('topology.helmAccessFromDev=false');
  }
  if (topology.artifactGenerationOnly === true) {
    lines.push('topology.artifactGenerationOnly=true');
  }

  Object.entries(pluginItems).forEach(([pluginKey, pluginConfig]) => {
    const constraints = pluginConfig?.constraints || {};
    Object.entries(constraints).forEach(([key, value]) => {
      if (value === true) {
        lines.push(`plugin.${pluginKey}.${key}=true`);
      }
    });
  });

  return lines;
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

function normalizeInstallPromptTier(value) {
  const raw = String(value || '2').trim().toLowerCase();
  if (raw === '1' || raw === 'tier1' || raw === 'starter' || raw === 'fast') {
    return '1';
  }
  if (raw === '3' || raw === 'tier3' || raw === 'advanced' || raw === 'deep') {
    return '3';
  }
  return '2';
}

function buildInstallPrompt({ tier = '2', setupContractTarget = 'contracts/SETUP-BASELINE.fc.md' } = {}) {
  const resolvedTier = normalizeInstallPromptTier(tier);
  const tierNotes = {
    '1': 'Keep output compact: one actionable checklist plus exact commands.',
    '2': 'Provide a balanced plan: checklist, risk notes, and completion updates.',
    '3': 'Provide a full runbook: phased plan, validations, rollback notes, and final audit summary.',
  };
  const tierLabel = resolvedTier === '1' ? 'Tier 1 (Fast)' : (resolvedTier === '2' ? 'Tier 2 (Balanced)' : 'Tier 3 (Deep)');

  return `# Setup Completion Prompt

Tier: ${tierLabel}

You are finishing Grabby setup for this repository.

## Phase 1: Project Assessment (Interactive)

Before writing any files, perform a comprehensive project assessment and **present findings to the user for review**.

### Step 1: Analyze the Codebase

Scan the repository and identify:

1. **Stack Detection**
   - Framework(s): React, Vue, Angular, Express, Next.js, etc.
   - Language(s): TypeScript, JavaScript, Python, Go, etc.
   - Runtime: Node.js version, browser targets
   - Build tools: Webpack, Vite, esbuild, etc.

2. **Directory Structure**
   - Source directories (src/, lib/, app/, etc.)
   - Component directories (components/, ui/, widgets/, etc.)
   - Test directories (tests/, __tests__/, spec/, etc.)
   - Config directories (config/, .config/, etc.)

3. **Key Components** (for React/Vue/Angular)
   - UI component library in use (MUI, Chakra, Tailwind, etc.)
   - Custom component directories
   - Shared/common components
   - Layout components

4. **Dependencies**
   - Core dependencies from package.json
   - Dev dependencies
   - Peer dependencies

5. **Patterns in Use**
   - State management (Redux, Zustand, Context, etc.)
   - API layer (fetch, axios, react-query, etc.)
   - Styling approach (CSS modules, styled-components, Tailwind, etc.)
   - Testing framework (Jest, Vitest, Playwright, etc.)

### Step 2: Present Assessment for Review

Display your findings in a clear format:

\`\`\`
## Project Assessment

### Stack
- Framework: [detected]
- Language: [detected]
- Runtime: [detected]

### Directories Found
- Source: [list]
- Components: [list]
- Tests: [list]

### Components Detected
- [component directories found]
- [key components identified]

### Dependencies
- Core: [top 10]
- Dev: [top 5]

### Patterns
- State: [detected]
- API: [detected]
- Styling: [detected]
- Testing: [detected]
\`\`\`

Then ask the user:
> **Please review this assessment. What's missing or incorrect?**
> - Any directories I missed?
> - Custom components not detected?
> - Patterns or conventions I should know about?
> - Preferred packages I should add to approved list?

### Step 3: Incorporate User Feedback

After user provides additions/corrections:
1. Acknowledge each addition
2. Confirm the updated assessment
3. Proceed to write system contracts with complete information

## Phase 2: Write System Contracts

With the reviewed assessment, create/update \`.grabby/system/\`:

### ARCHITECTURE.md
- Stack Profile with confirmed framework/runtime
- All directories from assessment + user additions
- Module patterns from codebase analysis
- Naming conventions observed

### STANDARDS.md
- Approved packages from package.json + user additions
- Detected coding conventions (from .eslintrc, .prettierrc, tsconfig)
- Security checklist for project type
- Testing requirements from detected test framework

### WORKFLOW.md
- Keep defaults unless user specifies different workflow

## Phase 3: Complete Setup

1. Read ${setupContractTarget} and summarize pending items.
2. Run governance lifecycle:
   - grabby validate SETUP-BASELINE.fc.md
   - grabby plan SETUP-BASELINE.fc.md
   - grabby approve SETUP-BASELINE.fc.md
3. Implement any required setup artifact updates.
4. Mark setup baseline complete:
   - grabby complete-baseline SETUP-BASELINE

## Rules
- ${tierNotes[resolvedTier]}
- **ALWAYS pause for user review after assessment** - never skip the interactive step
- Keep the response tool-agnostic and implementation-focused
- Do not invent files outside the contract scope

## Deliverables
- Interactive assessment with user confirmation
- Customized system contracts reflecting actual + user-specified standards
- Final checklist with each Done-When item marked pass/fail
- Any follow-up risks with one mitigation each`;
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

function extractBranchLine(content) {
  return content.match(/\*\*Branch:\*\*\s*([^\n\r]+)/i)?.[1]?.trim() || null;
}

function renderAssistantHandoffSection(contractFileName) {
  const normalizedContractFile = String(contractFileName || '').trim() || '<contract>.fc.md';
  const promptFileName = normalizedContractFile.replace(/\.fc\.md$/i, '.prompt.md');
  const promptPath = `contracts/${promptFileName}`;
  return `## AI Assistant Handoff
- Generate prompt bundle: \`grabby prompt ${normalizedContractFile}\`
- Prompt file: \`${promptPath}\`
- Copy/paste flow:
  1. Open \`${promptPath}\`
  2. Paste all contents into your AI assistant
  3. Ask it to execute only within this contract's scope and files
- File reference flow:
  - Tell your AI assistant: "Read and process \`${promptPath}\` exactly, then implement only approved contract scope."`;
}

function upsertAssistantHandoffSection(contractContent, contractFileName) {
  const section = renderAssistantHandoffSection(contractFileName);
  if (/^## AI Assistant Handoff\s*$/im.test(contractContent)) {
    return contractContent.replace(/^## AI Assistant Handoff[\s\S]*?(?=^##\s+|\s*$)/im, `${section}\n\n`);
  }
  return `${String(contractContent || '').trimEnd()}\n\n${section}\n`;
}


function prefixedError(message, suggestion = '') {
  return `[GRABBY] ${message}${suggestion ? ` Suggestion: ${suggestion}` : ''}`;
}

function isBaselineContractFile(filePath) {
  return /(^|[\\/])(SYSTEM|PROJECT|SETUP)-BASELINE\.fc\.md$/i.test(String(filePath || ''));
}

function resolveCanonicalContractId(filePath, { allowBaselineFallback = true } = {}) {
  try {
    return {
      id: ensureIdMatchesFilename(filePath),
      baselineFallback: false,
    };
  } catch (error) {
    if (allowBaselineFallback && isBaselineContractFile(filePath)) {
      return {
        id: path.basename(filePath).replace(/\.fc\.md$/i, '').toUpperCase(),
        baselineFallback: true,
      };
    }
    throw error;
  }
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
- \`SETUP-BASELINE.fc.md\` defines deterministic setup validation and project indexing for any LLM

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

function getNpmExecutable(platform = process.platform) {
  return platform === 'win32' ? 'npm.cmd' : 'npm';
}

function getNpmRunCommand(scriptName, platform = process.platform) {
  return `${getNpmExecutable(platform)} run ${scriptName}`;
}

function getBmadFeatureFlags(config = {}) {
  const defaults = {
    adaptiveHelp: false,
    quickFlowGuardrails: false,
    riskTieredVerification: false,
  };
  const configured = config?.bmadFeatures;
  if (!configured || typeof configured !== 'object') {
    return defaults;
  }
  return {
    adaptiveHelp: configured.adaptiveHelp === true,
    quickFlowGuardrails: configured.quickFlowGuardrails === true,
    riskTieredVerification: configured.riskTieredVerification === true,
  };
}

function getSuggestedNextActions({ contractStats = {}, featureFlags = {} } = {}) {
  const stats = {
    total: Number(contractStats.total || 0),
    draft: Number(contractStats.draft || 0),
    approved: Number(contractStats.approved || 0),
    executing: Number(contractStats.executing || 0),
    complete: Number(contractStats.complete || 0),
  };

  const suggestions = [];

  if (stats.total === 0) {
    suggestions.push({ command: 'grabby ticket "<request>"', reason: 'Structure the request before generating contracts.' });
    suggestions.push({ command: 'grabby task "<request>"', reason: 'Create a bounded contract from the ticket.' });
    suggestions.push({ command: 'grabby orchestrate "<request>"', reason: 'Run the full multi-role intake-to-audit flow.' });
    return suggestions;
  }

  if (stats.draft > 0) {
    suggestions.push({ command: 'grabby validate <file>', reason: 'Close structural and governance gaps in draft contracts.' });
    suggestions.push({ command: 'grabby plan <file>', reason: 'Generate plan artifacts once validation is clean.' });
  }

  if (stats.approved > 0 || stats.executing > 0) {
    suggestions.push({ command: 'grabby execute <file>', reason: 'Move approved plans through scoped execution.' });
    suggestions.push({ command: 'grabby guard <file>', reason: 'Verify execution stays within approved scope.' });
  }

  if (stats.complete > 0) {
    suggestions.push({ command: 'grabby audit <file>', reason: 'Confirm done-when evidence and quality checks.' });
  }

  if (featureFlags.quickFlowGuardrails) {
    suggestions.push({ command: 'grabby quick', reason: 'Use quick flow for bounded work with escalation guardrails.' });
  } else {
    suggestions.push({ command: 'grabby quick', reason: 'Use fast-track flow only for small bounded changes.' });
  }

  return suggestions.slice(0, 3);
}

function getLlmContextPolicy(config = {}) {
  const mode = String(config?.llmContext?.mode || 'standard').trim().toLowerCase();
  const defaults = mode === 'lean'
    ? {
      mode: 'lean',
      planTokenBudget: 700,
      executeTokenBudget: 1000,
      explicitOnly: true,
      maxSections: 2,
      useDefaults: false,
    }
    : {
      mode: 'standard',
      planTokenBudget: 1200,
      executeTokenBudget: 1800,
      explicitOnly: false,
      maxSections: 3,
      useDefaults: true,
    };

  const candidate = config?.llmContext || {};
  const normalizePositive = (value, fallback) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  };
  const normalizeBool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);

  return {
    mode: defaults.mode,
    planTokenBudget: normalizePositive(candidate.planTokenBudget, defaults.planTokenBudget),
    executeTokenBudget: normalizePositive(candidate.executeTokenBudget, defaults.executeTokenBudget),
    explicitOnly: normalizeBool(candidate.explicitOnly, defaults.explicitOnly),
    maxSections: normalizePositive(candidate.maxSections, defaults.maxSections),
    useDefaults: normalizeBool(candidate.useDefaults, defaults.useDefaults),
  };
}

function inferVerificationTier(contractContent = '') {
  const source = String(contractContent || '').toLowerCase();
  const highRiskSignals = ['auth', 'authentication', 'payment', 'billing', 'migration', 'schema', 'security'];
  const mediumSignals = ['api', 'endpoint', 'dependency', 'refactor', 'integration'];
  const highHits = highRiskSignals.filter((signal) => source.includes(signal)).length;
  const mediumHits = mediumSignals.filter((signal) => source.includes(signal)).length;
  if (highHits >= 1) {
    return { tier: 'high-risk', reason: `High-risk signals detected: ${highHits}` };
  }
  if (mediumHits >= 2) {
    return { tier: 'standard', reason: `Moderate-risk signals detected: ${mediumHits}` };
  }
  return { tier: 'basic', reason: 'No strong risk signals detected' };
}

function parseJsonLike(value) {
  if (typeof value !== 'string') {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
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
    execSyncImpl(getNpmRunCommand(scriptName), { stdio: 'pipe', cwd });
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

function hasDbImpactMetadata(content = '') {
  return /\*\*Data Change:\*\*\s*(yes|true)/i.test(content)
    || /## Data Impact[\s\S]*- \[(?: |x|X)\]/.test(content);
}

function hasApiImpactMetadata(content = '') {
  return /\*\*API Change:\*\*\s*(yes|true)/i.test(content)
    || /## API Impact[\s\S]*- \[(?: |x|X)\]/.test(content);
}

function hasDependencyImpactMetadata(content = '') {
  return /\*\*Dependency Change:\*\*\s*(yes|true)/i.test(content)
    || /## Dependency Impact[\s\S]*- \[(?: |x|X)\]/.test(content);
}

function dbPolicyViolations(context, content) {
  if (!looksLikeDbChangeContract(content)) {
    return [];
  }
  const violations = [];
  if (!hasDbImpactMetadata(content)) {
    violations.push('Data-affecting contract is missing explicit DB impact metadata (add **Data Change:** yes and ## Data Impact checklist).');
  }
  const dbPaths = getDbArtifactPaths(context.cwd);
  ['schema.snapshot.json', 'relations.graph.json', 'code_access_map.json'].forEach((fileName) => {
    const absolute = path.join(dbPaths.dbDir, fileName);
    if (!fs.existsSync(absolute)) {
      violations.push(`Missing DB artifact: .grabby/db/${fileName}`);
    }
  });
  if (!/rollback/i.test(content)) {
    violations.push('Data-affecting contract should include rollback notes.');
  }
  if (!/backfill|migration/i.test(content)) {
    violations.push('Data-affecting contract should mention migration or backfill handling.');
  }
  return violations;
}

function apiPolicyViolations(context, content) {
  if (!looksLikeApiChangeContract(content)) {
    return [];
  }
  const violations = [];
  if (!hasApiImpactMetadata(content)) {
    violations.push('API-affecting contract is missing explicit API impact metadata (add **API Change:** yes and ## API Impact checklist).');
  }
  const systemPaths = getSystemArtifactPaths(context.cwd);
  if (!fs.existsSync(systemPaths.apiSnapshotPath)) {
    violations.push('Missing API artifact: .grabby/be/api.snapshot.json');
  } else {
    try {
      const snapshot = JSON.parse(fs.readFileSync(systemPaths.apiSnapshotPath, 'utf8'));
      const breakingChanges = snapshot?.compatibility?.breakingChanges || [];
      if (breakingChanges.length > 0 && !/\*\*Breaking API Change Approved:\*\*\s*(yes|true)/i.test(content)) {
        violations.push('Breaking API changes require **Breaking API Change Approved:** yes.');
      }
    } catch (error) {
      violations.push(`Invalid API artifact: .grabby/be/api.snapshot.json (${error.message})`);
    }
  }
  if (!/version|deprecation|compatib/i.test(content)) {
    violations.push('API-affecting contract should mention versioning, deprecation, or compatibility handling.');
  }
  return violations;
}

function dependencyPolicyViolations(context, content) {
  if (!looksLikeDepsChangeContract(content)) {
    return [];
  }
  const violations = [];
  if (!hasDependencyImpactMetadata(content)) {
    violations.push('Dependency-affecting contract is missing explicit dependency metadata (add **Dependency Change:** yes and ## Dependency Impact checklist).');
  }
  const systemPaths = getSystemArtifactPaths(context.cwd);
  if (!fs.existsSync(systemPaths.feDepsSnapshotPath)) {
    violations.push('Missing FE dependency artifact: .grabby/fe/deps.snapshot.json');
  } else {
    try {
      const snapshot = JSON.parse(fs.readFileSync(systemPaths.feDepsSnapshotPath, 'utf8'));
      const unpinned = [];
      (snapshot.packages || []).forEach((pkg) => {
        Object.entries(pkg.dependencies || {}).forEach(([name, version]) => {
          if (String(version).trim() === '*' || String(version).trim().toLowerCase() === 'latest') {
            unpinned.push(`${name}@${version}`);
          }
        });
      });
      if (unpinned.length > 0 && !/\*\*Dependency Exception Approved:\*\*\s*(yes|true)/i.test(content)) {
        violations.push(`Unpinned dependency changes require explicit approval: ${unpinned.join(', ')}`);
      }
    } catch (error) {
      violations.push(`Invalid FE dependency artifact: .grabby/fe/deps.snapshot.json (${error.message})`);
    }
  }
  return violations;
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

  let scaffoldingSyncChecked = false;

  function isExternalLlmOnlyMode() {
    const repoConfig = loadRepoConfig(context.cwd) || {};
    return repoConfig.workflow?.externalLlmOnly === true;
  }

  function blockStoryCompletionCommand(commandName, fileName = null) {
    logger.log(c.warn(`[GRABBY] ${commandName} is disabled in this repository (workflow.externalLlmOnly=true).`));
    logger.log('Use your preferred AI assistant outside Grabby CLI for execution and completion.');
    if (fileName) {
      logger.log(`Generate handoff context with: grabby prompt ${fileName}`);
    }
  }

  function parseSemver(version) {
    const value = String(version || '').trim();
    const match = value.match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
    if (!match) {
      return null;
    }
    const prerelease = match[4]
      ? match[4].split('.').map((token) => (/^\d+$/.test(token) ? Number(token) : token))
      : [];
    return {
      major: Number(match[1]),
      minor: Number(match[2]),
      patch: Number(match[3]),
      prerelease,
    };
  }

  function compareSemver(left, right) {
    const a = parseSemver(left);
    const b = parseSemver(right);
    if (!a || !b) {
      return null;
    }

    const fields = ['major', 'minor', 'patch'];
    for (let index = 0; index < fields.length; index += 1) {
      const field = fields[index];
      if (a[field] > b[field]) return 1;
      if (a[field] < b[field]) return -1;
    }

    const aPre = a.prerelease;
    const bPre = b.prerelease;
    if (aPre.length === 0 && bPre.length === 0) return 0;
    if (aPre.length === 0) return 1;
    if (bPre.length === 0) return -1;

    const maxLen = Math.max(aPre.length, bPre.length);
    for (let index = 0; index < maxLen; index += 1) {
      const aId = aPre[index];
      const bId = bPre[index];
      if (aId === undefined) return -1;
      if (bId === undefined) return 1;
      if (aId === bId) continue;

      const aNum = typeof aId === 'number';
      const bNum = typeof bId === 'number';
      if (aNum && bNum) return aId > bId ? 1 : -1;
      if (aNum && !bNum) return -1;
      if (!aNum && bNum) return 1;
      return String(aId) > String(bId) ? 1 : -1;
    }

    return 0;
  }

  function semverEqual(left, right) {
    const cmp = compareSemver(left, right);
    if (cmp === null) {
      return String(left || '').trim() === String(right || '').trim();
    }
    return cmp === 0;
  }

  function syncScaffoldingIfOutdated() {
    if (scaffoldingSyncChecked) {
      return;
    }
    scaffoldingSyncChecked = true;

    const lockPath = path.join(context.grabbyDir, 'governance.lock');
    if (!fs.existsSync(lockPath)) {
      return;
    }

    try {
      const lock = yaml.parse(fs.readFileSync(lockPath, 'utf8')) || {};
      const pkg = JSON.parse(fs.readFileSync(path.join(context.pkgRoot, 'package.json'), 'utf8'));
      const lockVersion = lock?.governance?.version;
      const cliVersion = pkg?.version;
      if (!lockVersion || !cliVersion) {
        return;
      }

      // Refresh only when the repo lock is behind the running CLI.
      if (compareSemver(lockVersion, cliVersion) === -1) {
        const countContracts = (rootDir) => {
          if (!fs.existsSync(rootDir)) {
            return 0;
          }
          let count = 0;
          const stack = [rootDir];
          while (stack.length > 0) {
            const current = stack.pop();
            const entries = fs.readdirSync(current, { withFileTypes: true });
            entries.forEach((entry) => {
              const fullPath = path.join(current, entry.name);
              if (entry.isDirectory()) {
                stack.push(fullPath);
              } else if (entry.isFile() && entry.name.endsWith('.fc.md')) {
                count += 1;
              }
            });
          }
          return count;
        };

        const minContractsBetweenWarnings = 10;
        const currentContractCount = countContracts(context.contractsDir);
        const lastWarnedContractCount = Number(lock?.scaffoldingSync?.lastWarnedContractCount);
        const shouldWarn = !Number.isFinite(lastWarnedContractCount)
          || (currentContractCount - lastWarnedContractCount) >= minContractsBetweenWarnings;

        const shouldUpdateNow = process.argv.includes('--yes');
        if (!shouldUpdateNow) {
          if (!shouldWarn) {
            return;
          }
          logger.log(c.warn(`[GRABBY] Repo scaffolding is older than this CLI (${lockVersion} -> ${cliVersion}).`));
          logger.log(c.info(`[GRABBY] Update project docs/scaffolding now? Re-run this command with --yes, or run \`grabby init\` manually. (will re-warn after ${minContractsBetweenWarnings} more contracts)`));
          lock.scaffoldingSync = {
            ...(lock.scaffoldingSync || {}),
            lastWarnedContractCount: currentContractCount,
            minContractsBetweenWarnings,
            lastWarnedAt: timestamp(),
          };
          fs.writeFileSync(lockPath, yaml.stringify(lock), 'utf8');
          return;
        }

        const cliEntry = path.join(context.pkgRoot, 'bin', 'index.cjs');
        execSyncImpl(`"${process.execPath}" "${cliEntry}" init`, {
          cwd: context.cwd,
          stdio: 'pipe',
        });
        logger.log(c.warn(`[GRABBY] Repo scaffolding updated from CLI ${lockVersion} -> ${cliVersion}.`));
      }
    } catch (error) {
      logger.log(c.warn(`[GRABBY] Skipped automatic scaffolding update: ${error.message}`));
    }
  }

  function resolveContract(file) {
    syncScaffoldingIfOutdated();
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
    const existingContractFiles = fs.existsSync(context.contractsDir)
      ? fs.readdirSync(context.contractsDir).filter((entry) => entry.endsWith('.fc.md'))
      : [];
    const startWithFreshContracts = existingContractFiles.length === 0;
    let bootstrapArchived = false;
    let bootstrapArchiveCount = 0;
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

    const contractsDocPath = path.join(projectDocs, 'CONTRACTS.md');
    if (!fs.existsSync(contractsDocPath)) {
      fs.writeFileSync(contractsDocPath, `# Feature Contracts

The \`contracts/\` directory contains feature contracts for AI-assisted development.

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
      logger.log('  ? Created docs/CONTRACTS.md');
      noteCreated('docs/CONTRACTS.md');
    }
    const contractsDocContent = fs.readFileSync(contractsDocPath, 'utf8');
    if (!contractsDocContent.includes('## Baseline Contracts')) {
      fs.writeFileSync(contractsDocPath, `${contractsDocContent.trimEnd()}\n\n${BASELINE_README_SECTION}`, 'utf8');
      logger.log('  ? Updated docs/CONTRACTS.md with baseline contract guidance');
      noteUpdated('docs/CONTRACTS.md');
    } else {
      notePreserved('docs/CONTRACTS.md');
    }
    // Migrate legacy contracts/README.md to docs/CONTRACTS.md
    const legacyReadmePath = path.join(context.contractsDir, 'README.md');
    if (fs.existsSync(legacyReadmePath)) {
      fs.rmSync(legacyReadmePath, { force: true });
      logger.log('  ? Migrated contracts/README.md to docs/CONTRACTS.md');
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

## Change Classification Hints

- If migrations, schema files, or backfills are involved, route the work as a data-change contract.
- If OpenAPI, GraphQL, proto, payload shapes, or versioned endpoints change, route the work as an api-change contract.
- If \`package.json\`, workspace manifests, or lockfiles change, route the work as a deps-change contract.
- Use generated Grabby artifacts under \`.grabby/\` as evidence when classifying risk.

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

    if (startWithFreshContracts) {
      const bootstrapIds = ['SYSTEM-BASELINE', 'PROJECT-BASELINE', 'SETUP-BASELINE'];
      const archivedIds = [];
      bootstrapIds.forEach((baselineId) => {
        const baselinePath = path.join(context.contractsDir, `${baselineId}.fc.md`);
        if (!fs.existsSync(baselinePath)) {
          return;
        }
        const baselineContent = fs.readFileSync(baselinePath, 'utf8');
        const completedContent = /\*\*Status:\*\*\s*[^\n\r|]+/i.test(baselineContent)
          ? baselineContent.replace(/\*\*Status:\*\*\s*[^\n\r|]+/i, '**Status:** complete')
          : `${baselineContent.trimEnd()}\n\n**Status:** complete\n`;
        fs.writeFileSync(baselinePath, completedContent, 'utf8');
        const archived = featuresLib.createArchiveBundle(baselineId, context.cwd);
        archivedIds.push(archived.id);
        noteCreated(archived.historyFile);
      });

      // Legacy contracts/README.md cleanup handled by migration in init

      bootstrapArchiveCount = archivedIds.length;
      bootstrapArchived = bootstrapArchiveCount > 0;
      if (bootstrapArchived) {
        // Ensure contracts directory exists even after archiving removed all files
        ensureContractsDir(context.contractsDir);
        logger.log(`  ? Archived bootstrap contracts to history: ${archivedIds.join(', ')}`);
        logger.log('  ? Contracts directory reset for fresh feature work');
      }
    }

    try {
      const projectContextPath = path.join(context.grabbyDir, 'project-context.json');
      const hadProjectContext = fs.existsSync(projectContextPath);
      const projectContextResult = await generateProjectContextArtifact({ cwd: context.cwd });
      logger.log(`  ? Project context: ${path.relative(context.cwd, projectContextResult.outputPath).replace(/\\/g, '/')}`);
      logger.log(`  ? Context summary: ${projectContextResult.summary}`);
      const suggestedPlugins = projectContextResult.projectContext?.plugins?.suggested || [];
      if (suggestedPlugins.length > 0) {
        const repoConfig = loadRepoConfig(context.cwd) || initRepoConfig(context.cwd);
        const nextRepoConfig = repoConfig.file ? loadRepoConfig(context.cwd) : repoConfig;
        if (nextRepoConfig?.plugins?.autoSuggestOnInit !== false) {
          suggestedPlugins.forEach((pluginKey) => {
            updatePluginConfig(nextRepoConfig, pluginKey, {
              detected: true,
              source: 'builtin',
              enabled: nextRepoConfig?.plugins?.items?.[pluginKey]?.enabled === true,
              mode: nextRepoConfig?.plugins?.items?.[pluginKey]?.enabled === true
                ? (nextRepoConfig.plugins.items[pluginKey].mode || 'active')
                : 'off',
            });
          });
          saveRepoConfig(nextRepoConfig, context.cwd);
          logger.log(`  ? Suggested plugins: ${suggestedPlugins.join(', ')}`);
          noteUpdated(path.relative(context.cwd, repoConfigResult.file).replace(/\\/g, '/'));
        }
      }
      (hadProjectContext ? noteUpdated : noteCreated)(path.relative(context.cwd, projectContextResult.outputPath).replace(/\\/g, '/'));
    } catch (error) {
      logger.log(`  ? Project context skipped: ${error.message}`);
    }

    try {
      const repoConfig = loadRepoConfig(context.cwd) || {};
      const inventoryPath = path.join(context.grabbyDir, 'system.inventory.json');
      const hadInventory = fs.existsSync(inventoryPath);
      const inventoryResult = saveSystemInventoryArtifact(context.cwd, { config: repoConfig });
      logger.log(`  ? System inventory: ${path.relative(context.cwd, inventoryResult.outputPath).replace(/\\/g, '/')}`);
      logger.log(`  ? Detected profile: ${inventoryResult.artifact.profile}`);
      logger.log(`  ? Recommended rulesets: ${(inventoryResult.artifact.rulesets?.recommended || []).join(', ') || 'none'}`);
      (hadInventory ? noteUpdated : noteCreated)(path.relative(context.cwd, inventoryResult.outputPath).replace(/\\/g, '/'));
    } catch (error) {
      logger.log(`  ? System inventory skipped: ${error.message}`);
    }

    try {
      const repoConfig = loadRepoConfig(context.cwd) || {};
      const hadGitState = fs.existsSync(path.join(context.grabbyDir, 'git', 'state.json'));
      const gitStatePath = saveGitState(context.cwd, loadGitState(context.cwd, repoConfig), repoConfig);
      logger.log(`  ? Git state: ${path.relative(context.cwd, gitStatePath).replace(/\\/g, '/')}`);
      (hadGitState ? noteUpdated : noteCreated)(path.relative(context.cwd, gitStatePath).replace(/\\/g, '/'));
    } catch (error) {
      logger.log(`  ? Git state skipped: ${error.message}`);
    }

    const createdUnique = [...new Set(createdArtifacts)];
    const updatedUnique = [...new Set(updatedArtifacts)].filter((artifactPath) => !createdUnique.includes(artifactPath));
    const preservedUnique = [...new Set(preservedArtifacts)].filter(
      (artifactPath) => !createdUnique.includes(artifactPath) && !updatedUnique.includes(artifactPath)
    );

    logger.log('\nSetup summary');
    logger.log(`  Mode: ${isBrownfieldRepo ? 'brownfield' : 'greenfield'}`);
    if (createdUnique.length > 0) {
      logger.log(`  Created: ${createdUnique.join(', ')}`);
    }
    if (updatedUnique.length > 0) {
      logger.log(`  Updated: ${updatedUnique.join(', ')}`);
    }
    if (preservedUnique.length > 0) {
      logger.log(`  Preserved: ${preservedUnique.join(', ')}`);
    }
    logger.log('\nNext steps');
    if (bootstrapArchived) {
      logger.log('  1. Contracts directory starts empty by design after init bootstrap archival.');
      logger.log(`  2. Review archived bootstrap entries under .grabby/history (entries archived: ${bootstrapArchiveCount}).`);
      logger.log('  3. Start bounded work with grabby ticket "<request>" or grabby task "<request>".');
      logger.log('  4. Validate and plan before editing code.');
    } else if (isBrownfieldRepo) {
      logger.log('  1. Review contracts/PROJECT-BASELINE.fc.md, contracts/SYSTEM-BASELINE.fc.md, and contracts/SETUP-BASELINE.fc.md against the existing repo.');
      logger.log('  2. Complete SETUP-BASELINE first (validate -> plan -> approve -> execute -> audit).');
      logger.log('  3. Review .grabby/project-context.json and keep it aligned with the repo.');
      logger.log('  4. Start bounded work with grabby ticket "<request>" or grabby task "<request>".');
      logger.log('  5. Validate and plan before editing brownfield code.');
    } else {
      logger.log('  1. Complete SETUP-BASELINE first (validate -> plan -> approve -> execute -> audit).');
      logger.log('  2. Create your first feature contract with grabby create "feature-name" or grabby task "<request>".');
      logger.log('  3. Validate and plan before editing code.');
    }
    logger.log('\n? Initialized! Run `grabby create "feature-name"` to start.\n');
    logger.log('Install handoff prompt: grabby install:prompt --tier 2');
  }

  // ============================================================================
  // SETUP COMMAND - Simplified one-command initialization
  // ============================================================================

  async function setup(options = {}) {
    const quick = options.quick || options.q;
    const skipBaselines = options.skipBaselines || options.skip;
    const force = options.force || options.f;

    logger.log('Setting up Grabby...\n');

    // Step 1: Run init if not already initialized
    const configExists = fs.existsSync(path.join(context.grabbyDir, 'config.json'));
    if (!configExists || force) {
      logger.log('Step 1: Initializing project...');
      await init({ ...options, quiet: true });
    } else {
      logger.log('Step 1: Already initialized ✓');
    }

    // Step 2: Handle baseline contracts
    const baselineIds = ['SYSTEM-BASELINE', 'PROJECT-BASELINE', 'SETUP-BASELINE'];
    const baselinePaths = baselineIds.map((id) => ({
      id,
      path: path.join(context.contractsDir, `${id}.fc.md`),
    }));

    if (skipBaselines) {
      // Skip mode: Archive any existing baselines immediately
      logger.log('\nStep 2: Skipping baseline contracts (--skip-baselines)...');
      for (const { id, path: contractPath } of baselinePaths) {
        if (fs.existsSync(contractPath)) {
          try {
            // Mark as complete and archive
            const content = fs.readFileSync(contractPath, 'utf8');
            const completed = content.replace(/\*\*Status:\*\*\s*[^\n\r|]+/i, '**Status:** complete');
            fs.writeFileSync(contractPath, completed, 'utf8');
            featuresLib.createArchiveBundle(id, context.cwd, { allowIncomplete: true });
            logger.log(`  Archived: ${id}`);
          } catch (err) {
            logger.log(`  Skip: ${id} (${err.message})`);
          }
        }
      }
      // Ensure contracts dir exists after archival
      ensureContractsDir(context.contractsDir);
    } else if (quick) {
      // Quick mode: Mark all baselines as complete without full workflow
      logger.log('\nStep 2: Quick-completing baseline contracts...');
      for (const { id, path: contractPath } of baselinePaths) {
        if (fs.existsSync(contractPath)) {
          const content = fs.readFileSync(contractPath, 'utf8');
          if (!/\*\*Status:\*\*\s*(complete|completed)/i.test(content)) {
            const completed = content.replace(/\*\*Status:\*\*\s*[^\n\r|]+/i, '**Status:** complete');
            fs.writeFileSync(contractPath, completed, 'utf8');
            logger.log(`  Completed: ${id}`);
          } else {
            logger.log(`  Already complete: ${id}`);
          }
        } else {
          logger.log(`  Not found: ${id}`);
        }
      }
    } else {
      // Normal mode: Check status and guide user
      logger.log('\nStep 2: Checking baseline contracts...');
      let allComplete = true;
      for (const { id, path: contractPath } of baselinePaths) {
        if (fs.existsSync(contractPath)) {
          const content = fs.readFileSync(contractPath, 'utf8');
          const isComplete = /\*\*Status:\*\*\s*(complete|completed)/i.test(content);
          if (isComplete) {
            logger.log(`  ✓ ${id}: complete`);
          } else {
            logger.log(`  ○ ${id}: pending`);
            allComplete = false;
          }
        } else {
          logger.log(`  - ${id}: not created`);
        }
      }

      if (!allComplete) {
        logger.log('\nBaseline contracts are pending. Options:');
        logger.log('  grabby setup --quick     # Auto-complete all baselines');
        logger.log('  grabby setup --skip      # Skip and archive baselines');
        logger.log('  grabby install:prompt --tier 2');
        logger.log('  # Or complete manually: grabby validate SETUP-BASELINE.fc.md');
        return;
      }
    }

    // Step 3: Update governance lock to reflect setup completion
    const lockPath = path.join(context.grabbyDir, 'governance.lock');
    let lockContent = {};
    if (fs.existsSync(lockPath)) {
      try {
        const raw = fs.readFileSync(lockPath, 'utf8');
        // Try YAML first, then JSON
        lockContent = yaml.parse(raw) || {};
      } catch {
        lockContent = {};
      }
    }
    lockContent.setupCompleted = true;
    lockContent.setupCompletedAt = new Date().toISOString();
    lockContent.setupMode = skipBaselines ? 'skip' : (quick ? 'quick' : 'full');
    fs.writeFileSync(lockPath, yaml.stringify(lockContent), 'utf8');

    // Step 4: Update config to disable bootstrap gate if requested
    if (options.disableGate) {
      const repoConfig = loadRepoConfig(context.cwd) || {};
      repoConfig.bootstrap = repoConfig.bootstrap || {};
      repoConfig.bootstrap.gateMode = 'off';
      saveRepoConfig(repoConfig, context.cwd);
      logger.log('\nStep 3: Disabled bootstrap gate in config');
    }

    logger.log('\n✓ Setup complete! You can now use all grabby commands.');
    logger.log('\nNext steps:');
    logger.log('  grabby install:prompt --tier 2  # Generate setup-completion prompt');
    logger.log('  grabby task "your feature"    # Start a new feature');
    logger.log('  grabby create "feature-name"  # Create a contract');
    logger.log('  grabby list                   # See all contracts');
  }

  function installPrompt(options = {}) {
    const setupContractTarget = path.relative(context.cwd, path.join(context.contractsDir, 'SETUP-BASELINE.fc.md')).replace(/\\/g, '/')
      || 'contracts/SETUP-BASELINE.fc.md';
    const tier = normalizeInstallPromptTier(options.tier);
    const prompt = buildInstallPrompt({ tier, setupContractTarget });
    logger.log(prompt);
    logger.log('');
    logger.log('Tip: --tier {1|2|3}');
  }

  function completeBaseline(contractId) {
    const normalizedId = String(contractId || '').trim().toUpperCase();
    const contractPath = path.join(context.contractsDir, `${normalizedId}.fc.md`);

    if (!fs.existsSync(contractPath)) {
      logger.log(`Contract not found: ${normalizedId}`);
      exit(1);
    }

    const content = fs.readFileSync(contractPath, 'utf8');
    if (/\*\*Status:\*\*\s*(complete|completed)/i.test(content)) {
      logger.log(`${normalizedId} is already complete`);
      return;
    }

    const completed = content.replace(/\*\*Status:\*\*\s*[^\n\r|]+/i, '**Status:** complete');
    fs.writeFileSync(contractPath, completed, 'utf8');
    logger.log(`✓ Marked ${normalizedId} as complete`);
  }

  function archiveBaseline(contractId) {
    const normalizedId = String(contractId || '').trim().toUpperCase();
    try {
      const result = featuresLib.createArchiveBundle(normalizedId, context.cwd, { allowIncomplete: true });
      logger.log(`✓ Archived ${normalizedId} to ${result.historyFile}`);
    } catch (err) {
      logger.log(`Failed to archive ${normalizedId}: ${err.message}`);
      exit(1);
    }
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
      const initialContract = fs.readFileSync(result.filePath, 'utf8');
      const withHandoff = upsertAssistantHandoffSection(initialContract, result.fileName);
      if (withHandoff !== initialContract) {
        fs.writeFileSync(result.filePath, withHandoff, 'utf8');
      }
      appendLocalFeatureLog(context, {
        id: result.id,
        title: request.name,
        type: request.templateName,
        contractFile: path.relative(context.cwd, result.filePath).replace(/\\/g, '/'),
      });
      logger.log(`? Created: ${path.relative(context.cwd, result.filePath).replace(/\\/g, '/')}`);
      logger.log(`  ID: ${result.id}`);
      logger.log(`  Template: ${request.templateName}`);
      logger.log('\nNext: open the contract and use ## AI Assistant Handoff, then run:');
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

    try {
      const resolvedId = resolveCanonicalContractId(filePath);
      if (resolvedId.baselineFallback) {
        logger.log(c.warn('! Baseline contract detected: skipping work-item ID filename enforcement.'));
      }
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
        if (lock?.governance?.version && !semverEqual(lock.governance.version, pkg.version)) {
          logger.log(c.warn(`[GRABBY] governance.lock version (${lock.governance.version}) differs from CLI version (${pkg.version}).`));
        }
      } catch {}
    }
    const result = validateContract(content);
    const versionCheck = checkVersionCompatibility(content, context.docsDir);
    result.errors.push(...versionCheck.errors);
    result.warnings.push(...versionCheck.warnings);
    const policyViolations = [
      ...dbPolicyViolations(context, content),
      ...apiPolicyViolations(context, content),
      ...dependencyPolicyViolations(context, content),
    ];
    if (policyViolations.length > 0) {
      result.errors.push(...policyViolations);
    }
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
      const resolvedId = resolveCanonicalContractId(filePath);
      canonicalId = resolvedId.id;
      if (resolvedId.baselineFallback) {
        logger.log(c.warn('! Baseline contract detected: using baseline filename as canonical ID.'));
      }
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

    const contextPolicy = getLlmContextPolicy(loadRepoConfig(context.cwd) || {});
    const resolvedContext = resolveContextRefs({
      docsDir: context.docsDir,
      contractContent: content,
      phase: 'plan',
      tokenBudget: contextPolicy.planTokenBudget,
      useDefaults: contextPolicy.useDefaults,
      explicitOnly: contextPolicy.explicitOnly,
      maxSections: contextPolicy.maxSections,
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
    const repoConfig = loadRepoConfig(context.cwd) || {};
    const bmadFeatures = getBmadFeatureFlags(repoConfig);
    const environmentConstraints = summarizeEnvironmentConstraints(repoConfig);
    if (environmentConstraints.length > 0) {
      planData.environment_constraints = environmentConstraints;
    }

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
    if (environmentConstraints.length > 0) {
      logger.log('Active environment constraints:');
      environmentConstraints.forEach((entry) => logger.log(`  - ${entry}`));
    }
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
      const resolvedId = resolveCanonicalContractId(filePath);
      canonicalId = resolvedId.id;
      if (resolvedId.baselineFallback) {
        logger.log(c.warn('! Baseline contract detected: using baseline filename as canonical ID.'));
      }
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
    if (isExternalLlmOnlyMode()) {
      logger.log('\nNext: run implementation in your preferred AI assistant tool.');
      logger.log(`Handoff bundle: grabby prompt ${fileName}`);
    } else {
      logger.log(`\nNext: grabby execute ${fileName}`);
    }
  }

  function guard(file) {
    const filePath = resolveContract(file);
    if (!filePath) {
      return;
    }

    const fileName = path.basename(filePath);
    let canonicalId;
    try {
      const resolvedId = resolveCanonicalContractId(filePath);
      canonicalId = resolvedId.id;
      if (resolvedId.baselineFallback) {
        logger.log(c.warn('! Baseline contract detected: using baseline filename as canonical ID.'));
      }
    } catch (error) {
      logger.log(`? ${prefixedError(error.message, 'Ensure contract filename ID matches **ID:** content.')}`);
      exit(1);
      return;
    }
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

    if (isExternalLlmOnlyMode()) {
      const fileName = path.basename(filePath);
      blockStoryCompletionCommand('execute', fileName);
      return;
    }

    const fileName = path.basename(filePath);
    let canonicalId;
    try {
      const resolvedId = resolveCanonicalContractId(filePath);
      canonicalId = resolvedId.id;
      if (resolvedId.baselineFallback) {
        logger.log(c.warn('! Baseline contract detected: using baseline filename as canonical ID.'));
      }
    } catch (error) {
      logger.log(`? ${prefixedError(error.message, 'Ensure contract filename ID matches **ID:** content.')}`);
      exit(1);
      return;
    }
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
    const repoConfig = loadRepoConfig(context.cwd) || {};
    const bmadFeatures = getBmadFeatureFlags(repoConfig);
    const environmentConstraints = summarizeEnvironmentConstraints(repoConfig);
    try {
      const branchPolicyPreflight = preflightGitState({
        cwd: context.cwd,
        execSyncImpl,
        config: repoConfig,
        enforceBranchPolicyOnly: true,
      });
      if (!branchPolicyPreflight.valid) {
        logger.log('? Git branch policy failure:');
        branchPolicyPreflight.errors.forEach((error) => logger.log(`  - ${error}`));
        exit(1);
        return;
      }
    } catch (error) {
      if (!String(error.message || '').includes('Not a git repository')) {
        logger.log(`? Git branch policy failure: ${error.message}`);
        exit(1);
        return;
      }
    }
    if (repoConfig.gitGovernance?.requirePreflightBeforeExecute) {
      const scripts = readPackageScripts(path.join(context.cwd, 'package.json'));
      try {
        const preflight = preflightGitState({
          cwd: context.cwd,
          execSyncImpl,
          config: repoConfig,
          contractId: canonicalId,
          expectedBranch: extractBranchLine(content),
          hasPlan: true,
          requiredChecksKnown: {
            lint: Boolean(scripts.lint),
            test: Boolean(scripts.test),
            build: Boolean(scripts.build),
            guard: true,
          },
          policyTriggered: true,
        });
        if (!preflight.valid) {
          logger.log('? Git preflight failure:');
          preflight.errors.forEach((error) => logger.log(`  - ${error}`));
          exit(1);
          return;
        }
      } catch (error) {
        logger.log(`? Git preflight failure: ${error.message}`);
        exit(1);
        return;
      }
    }
    const policyViolations = [
      ...dbPolicyViolations(context, content),
      ...apiPolicyViolations(context, content),
      ...dependencyPolicyViolations(context, content),
    ];
    if (policyViolations.length > 0) {
      logger.log('? Governance policy failure:');
      policyViolations.forEach((violation) => logger.log(`  - ${violation}`));
      exit(1);
      return;
    }
    const contextPolicy = getLlmContextPolicy(repoConfig);
    const resolvedContext = resolveContextRefs({
      docsDir: context.docsDir,
      contractContent: content,
      phase: 'execute',
      tokenBudget: contextPolicy.executeTokenBudget,
      useDefaults: contextPolicy.useDefaults,
      explicitOnly: contextPolicy.explicitOnly,
      maxSections: contextPolicy.maxSections,
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
    if (environmentConstraints.length > 0) {
      logger.log('\nEnvironment Constraints:');
      environmentConstraints.forEach((entry) => logger.log(`  ${entry}`));
    }
    const verificationChecklist = readWorkflowChecklist(context, 'test-engineer');
    if (verificationChecklist) {
      logger.log('\nVerification Checklist:');
      verificationChecklist.split(/\r?\n/).forEach((line) => logger.log(`  ${line}`));
    }
    if (bmadFeatures.riskTieredVerification) {
      const verificationTier = inferVerificationTier(content);
      logger.log(`\nVerification Tier: ${verificationTier.tier}`);
      logger.log(`Tier Basis: ${verificationTier.reason}`);
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

    if (isExternalLlmOnlyMode()) {
      const fileName = path.basename(filePath);
      blockStoryCompletionCommand('audit', fileName);
      return;
    }

    const fileName = path.basename(filePath);
    const contractContent = fs.readFileSync(filePath, 'utf8');
    let canonicalId;
    try {
      const resolvedId = resolveCanonicalContractId(filePath);
      canonicalId = resolvedId.id;
      if (resolvedId.baselineFallback) {
        logger.log(c.warn('! Baseline contract detected: using baseline filename as canonical ID.'));
      }
    } catch (error) {
      logger.log(`? ${prefixedError(error.message, 'Ensure contract filename ID matches **ID:** content.')}`);
      exit(1);
      return;
    }
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

    const dbViolations = dbPolicyViolations(context, contractContent);
    const apiViolations = apiPolicyViolations(context, contractContent);
    const dependencyViolations = dependencyPolicyViolations(context, contractContent);
    const policyViolations = [...dbViolations, ...apiViolations, ...dependencyViolations];
    const repoConfig = loadRepoConfig(context.cwd) || {};
    const bmadFeatures = getBmadFeatureFlags(repoConfig);
    const verificationTier = bmadFeatures.riskTieredVerification
      ? inferVerificationTier(contractContent)
      : null;
    const auditStatus = checks.some((check) => check.status === 'failed') || policyViolations.length > 0
      ? 'needs_attention'
      : (checks.length > 0 ? 'complete' : 'pending');
    const auditLines = [
      `# Audit: ${canonicalId}`,
      '',
      `- Status: ${auditStatus}`,
    ];
    const environmentConstraints = summarizeEnvironmentConstraints(loadRepoConfig(context.cwd) || {});
    if (checks.length > 0) {
      auditLines.push('', '## Checks', ...checks.map((check) => `- ${check.summary}`));
    }
    if (environmentConstraints.length > 0) {
      logger.log('\nEnvironment Constraints:');
      environmentConstraints.forEach((entry) => logger.log(`  - ${entry}`));
      auditLines.push('', '## Environment Constraints', ...environmentConstraints.map((entry) => `- ${entry}`));
    }
    if (dbViolations.length > 0) {
      auditLines.push('', '## DB Policy Findings', ...dbViolations.map((item) => `- ${item}`));
    }
    if (apiViolations.length > 0) {
      auditLines.push('', '## API Policy Findings', ...apiViolations.map((item) => `- ${item}`));
    }
    if (dependencyViolations.length > 0) {
      auditLines.push('', '## Dependency Policy Findings', ...dependencyViolations.map((item) => `- ${item}`));
    }
    if (verificationTier) {
      auditLines.push('', '## Verification Tier', `- Tier: ${verificationTier.tier}`, `- Basis: ${verificationTier.reason}`);
    }
    fs.writeFileSync(auditPath, `${auditLines.join('\n')}\n`);

    logger.log(`\n${'-'.repeat(50)}`);
    logger.log(`Audit: ${path.relative(context.cwd, auditPath).replace(/\\/g, '/')}`);
    logger.log('Update contract status to "complete" when done.');
    logger.log('Mark Done When checkboxes in the contract.\n');
  }

  function list() {
    ensureContractsDir(context.contractsDir);

    const contracts = featuresLib.listContractFeatures(context.cwd);
    if (contracts.length === 0) {
      logger.log('No contracts found.');
      logger.log('Create one: grabby create "feature-name"\n');
      return;
    }

    logger.log('Contracts:\n');
    contracts.forEach((contract) => {
      const file = path.basename(contract.contractPath || `${contract.id}.fc.md`);
      const status = contract.status || '?';
      const icons = {
        draft: '??',
        approved: '? ',
        executing: '?',
        complete: '??',
        paused: '? ',
      };
      logger.log(`  ${icons[status] || '? '} ${file}`);
      logger.log(`     ID: ${contract.id} | Status: ${status}`);
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
    const withHandoff = upsertAssistantHandoffSection(content, fileName);
    if (withHandoff !== content) {
      fs.writeFileSync(filePath, withHandoff, 'utf8');
      logger.log(`Updated contract handoff section: contracts/${fileName}`);
    }
  }


  function gitStatus() {
    const repoConfig = loadRepoConfig(context.cwd) || {};
    try {
      const summary = summarizeGitStatus(context.cwd, execSyncImpl, repoConfig);
      logger.log(renderStatusSummary(summary));
    } catch (error) {
      logger.log(prefixedError(error.message, 'Run this command inside a git repository.'));
      exit(1);
    }
  }

  function gitSync() {
    const repoConfig = loadRepoConfig(context.cwd) || {};
    try {
      const result = syncWithRemote(context.cwd, execSyncImpl, repoConfig);
      logger.log(`Fetched origin.`);
      logger.log(renderStatusSummary(result.summary));
      logger.log(`State: ${path.relative(context.cwd, result.statePath).replace(/\\/g, '/')}`);
    } catch (error) {
      logger.log(prefixedError(error.message, 'Verify origin exists and the repository is reachable.'));
      exit(1);
    }
  }

  function gitStart(file, { type = 'feat', publish = false } = {}) {
    const filePath = resolveContract(file);
    if (!filePath) return;

    const content = fs.readFileSync(filePath, 'utf8');
    let id;
    try {
      id = resolveCanonicalContractId(filePath).id;
    } catch (error) {
      logger.log(`? ${prefixedError(error.message, 'Ensure contract filename ID matches **ID:** content.')}`);
      exit(1);
      return;
    }
    const title = extractContractTitle(content, path.basename(filePath));
    const slug = slugifyTitle(title) || id.toLowerCase();
    const branchName = `${type}/${id}-${slug}`;
    const repoConfig = loadRepoConfig(context.cwd) || {};

    try {
      const result = createBranchFromContract({
        cwd: context.cwd,
        execSyncImpl,
        config: repoConfig,
        branchName,
        publish,
      });
      const updated = setOrInsertBranchLine(content, branchName);
      fs.writeFileSync(filePath, updated);
      logger.log(`? Created branch ${branchName}`);
      if (result.upstreamSet) {
        logger.log(`? Upstream configured for ${branchName}`);
      } else if (result.publishSuggested) {
        logger.log(`Next: git push -u origin ${branchName}`);
      }
      logger.log(`? Updated contract: ${path.basename(filePath)}`);
    } catch (_error) {
      logger.log(`Branch: ${branchName}`);
      logger.log(_error.message || 'Git not available. Create the branch manually.');
      exit(1);
      return;
    }
  }

  function start(file, options = {}) {
    return gitStart(file, options);
  }

  function gitUpdate() {
    const repoConfig = loadRepoConfig(context.cwd) || {};
    try {
      const result = updateCurrentBranch(context.cwd, execSyncImpl, repoConfig);
      if (!result.ok) {
        logger.log(`Update stopped due to conflicts while applying ${result.strategy} against ${result.baseRef}.`);
        result.conflictChecklist.forEach((item) => logger.log(`  - ${item}`));
        exit(1);
        return;
      }
      logger.log(`Updated branch using ${result.strategy} onto ${result.baseRef}.`);
      logger.log(renderStatusSummary(result.summary));
    } catch (error) {
      logger.log(prefixedError(error.message, 'Clean the workspace or switch to a non-protected branch before updating.'));
      exit(1);
    }
  }

  function gitPreflight(file = null) {
    const repoConfig = loadRepoConfig(context.cwd) || {};
    let contractContent = '';
    let contractId = null;
    let expectedBranch = null;
    let hasPlan = false;
    if (file) {
      const filePath = resolveContract(file);
      if (!filePath) return;
      contractContent = fs.readFileSync(filePath, 'utf8');
      contractId = resolveCanonicalContractId(filePath).id;
      expectedBranch = extractBranchLine(contractContent);
      const { planPath } = getArtifactPaths(context, contractId);
      hasPlan = fs.existsSync(planPath);
    }
    const scripts = readPackageScripts(path.join(context.cwd, 'package.json'));
    const requiredChecksKnown = {
      lint: Boolean(scripts.lint),
      test: Boolean(scripts.test),
      build: Boolean(scripts.build),
      guard: true,
    };
    try {
      const result = preflightGitState({
        cwd: context.cwd,
        execSyncImpl,
        config: repoConfig,
        contractId,
        expectedBranch,
        hasPlan,
        requiredChecksKnown,
        policyTriggered: Boolean(file),
      });
      logger.log(renderStatusSummary(result.summary));
      result.warnings.forEach((warning) => logger.log(`WARN ${warning}`));
      if (!result.valid) {
        result.errors.forEach((error) => logger.log(`ERROR ${error}`));
        exit(1);
        return;
      }
      logger.log('Git preflight passed.');
    } catch (error) {
      logger.log(prefixedError(error.message, 'Run this command inside a git repository.'));
      exit(1);
    }
  }

  function prTemplate(file) {
    const filePath = resolveContract(file);
    if (!filePath) return;

    const content = fs.readFileSync(filePath, 'utf8');
    let id;
    try {
      id = resolveCanonicalContractId(filePath).id;
    } catch (error) {
      logger.log(`? ${prefixedError(error.message, 'Ensure contract filename ID matches **ID:** content.')}`);
      exit(1);
      return;
    }
    const title = extractContractTitle(content, path.basename(filePath));
    const repoConfig = loadRepoConfig(context.cwd) || {};
    let branchName = extractBranchLine(content);
    let remoteHosting = String(repoConfig.gitGovernance?.hosting || 'both');
    try {
      const summary = summarizeGitStatus(context.cwd, execSyncImpl, repoConfig);
      branchName = branchName || summary.branch;
      remoteHosting = summary.remote.hosting || remoteHosting;
    } catch {}
    const planPath = `contracts/${id}.plan.yaml`;
    const auditPath = `contracts/${id}.audit.md`;
    const doneWhen = extractDoneWhenSection(content);

    const body = [
      `Title: ${id}: ${title}`,
      '',
      remoteHosting === 'gitlab' ? '## Merge Request' : '## Pull/Merge Request',
      `- ID: ${id}`,
      `- Contract: ${path.relative(context.cwd, filePath).replace(/\\/g, '/')}`,
      `- Plan: ${planPath}`,
      `- Audit: ${auditPath}`,
      `- Branch: ${branchName || 'not recorded'}`,
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
    // Feature close is allowed in externalLlmOnly mode - it's a cleanup operation, not LLM execution

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

      const gcResult = featuresLib.garbageCollectCompletedStories(context.cwd);
      if (gcResult.archived.length > 0) {
        logger.log(`Garbage collector archived ${gcResult.archived.length} additional completed stor${gcResult.archived.length === 1 ? 'y' : 'ies'}.`);
        gcResult.archived.forEach((entry) => {
          logger.log(`  - ${entry.id} -> ${entry.historyFile}`);
        });
      }
      if (gcResult.failed.length > 0) {
        gcResult.failed.forEach((failure) => {
          logger.log(c.warn(`[GC] Failed to archive ${failure.id}: ${failure.error}`));
        });
      }
    } catch (error) {
      logger.log(prefixedError(error.message, 'Close only completed features with matching artifact IDs.'));
      exit(1);
    }
  }

  function featureGc(action = 'list', id = null, options = {}) {
    const normalizedAction = String(action || 'list').trim().toLowerCase();
    const normalizedId = id ? String(id).trim().toUpperCase() : null;

    // GC archive is allowed in externalLlmOnly mode - it's a cleanup operation, not LLM execution

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
        logger.log(`History: ${result.historyFile}`);
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
    const repoConfig = loadRepoConfig(context.cwd) || {};
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

    const migrationChange = detectMigrationOrSchemaChanges(implementationChanges, repoConfig);
    const apiSpecChange = detectApiSpecChanges(implementationChanges, repoConfig);
    const frontendDependencyChange = detectFrontendDependencyChanges(implementationChanges, repoConfig);

    const triggers = migrationChange
      || apiSpecChange
      || frontendDependencyChange
      || implementationChanges.length >= threshold
      || implementationChanges.some((file) => restricted.some((rule) => file.startsWith(normalizeRepoPath(rule))));
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

    if (migrationChange) {
      const hasDbAwareContract = contractFiles.some((fileName) => {
        const content = fs.readFileSync(path.join(context.contractsDir, fileName), 'utf8');
        return hasDbImpactMetadata(content);
      });
      if (!hasDbAwareContract) {
        logger.log(prefixedError('Migration/schema changes require a data-change contract.', 'Add **Data Change:** yes and a ## Data Impact section to the governing contract.'));
        exit(1);
        return;
      }
      const dbPaths = getDbArtifactPaths(context.cwd);
      const requiredArtifacts = [dbPaths.schemaSnapshotPath, dbPaths.relationsGraphPath];
      const missingArtifacts = requiredArtifacts.filter((artifactPath) => !fs.existsSync(artifactPath));
      if (missingArtifacts.length > 0) {
        logger.log(prefixedError('Migration/schema changes require refreshed DB artifacts.', 'Run grabby db:refresh before merging.'));
        missingArtifacts.forEach((artifactPath) => logger.log(`  - Missing: ${path.relative(context.cwd, artifactPath).replace(/\\/g, '/')}`));
        exit(1);
        return;
      }
    }

    if (apiSpecChange) {
      const hasApiAwareContract = contractFiles.some((fileName) => {
        const content = fs.readFileSync(path.join(context.contractsDir, fileName), 'utf8');
        return hasApiImpactMetadata(content);
      });
      if (!hasApiAwareContract) {
        logger.log(prefixedError('API spec changes require an api-change contract.', 'Add **API Change:** yes and a ## API Impact section to the governing contract.'));
        exit(1);
        return;
      }
      const systemPaths = getSystemArtifactPaths(context.cwd);
      if (!fs.existsSync(systemPaths.apiSnapshotPath)) {
        logger.log(prefixedError('API spec changes require a refreshed API snapshot.', 'Run grabby api:refresh before merging.'));
        logger.log(`  - Missing: ${path.relative(context.cwd, systemPaths.apiSnapshotPath).replace(/\\/g, '/')}`);
        exit(1);
        return;
      }
    }

    if (frontendDependencyChange) {
      const hasDependencyAwareContract = contractFiles.some((fileName) => {
        const content = fs.readFileSync(path.join(context.contractsDir, fileName), 'utf8');
        return hasDependencyImpactMetadata(content);
      });
      if (!hasDependencyAwareContract) {
        logger.log(prefixedError('Package manifest or lockfile changes require a deps-change contract.', 'Add **Dependency Change:** yes and a ## Dependency Impact section to the governing contract.'));
        exit(1);
        return;
      }
      const systemPaths = getSystemArtifactPaths(context.cwd);
      if (!fs.existsSync(systemPaths.feDepsSnapshotPath)) {
        logger.log(prefixedError('Dependency changes require a refreshed FE dependency snapshot.', 'Run grabby fe:refresh before merging.'));
        logger.log(`  - Missing: ${path.relative(context.cwd, systemPaths.feDepsSnapshotPath).replace(/\\/g, '/')}`);
        exit(1);
        return;
      }
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
      allowEmpty = false,
    } = options;

    try {
      if (checkAll) {
        const sessionFiles = listSessionFiles();
        if (sessionFiles.length === 0) {
          if (allowEmpty) {
            logger.log('OK contracts :: no session artifacts found (skipped)');
            return;
          }
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
    const contextPolicy = getLlmContextPolicy(loadRepoConfig(context.cwd) || {});
    const planContext = resolveContextRefs({
      docsDir: context.docsDir,
      contractContent: content,
      phase: 'plan',
      tokenBudget: contextPolicy.planTokenBudget,
      useDefaults: contextPolicy.useDefaults,
      explicitOnly: contextPolicy.explicitOnly,
      maxSections: contextPolicy.maxSections,
    });
    const executeContext = resolveContextRefs({
      docsDir: context.docsDir,
      contractContent: content,
      phase: 'execute',
      tokenBudget: contextPolicy.executeTokenBudget,
      useDefaults: contextPolicy.useDefaults,
      explicitOnly: contextPolicy.explicitOnly,
      maxSections: contextPolicy.maxSections,
    });
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

  function dbDiscover() {
    const repoConfig = loadRepoConfig(context.cwd) || {};
    const result = saveDiscoveryArtifact(context.cwd, { config: repoConfig });
    logger.log(`DB discovery: ${path.relative(context.cwd, result.outputPath).replace(/\\/g, '/')}`);
    logger.log(`Languages: ${(result.artifact.languages || []).join(', ') || 'none'}`);
    logger.log(`Databases: ${(result.artifact.databases || []).join(', ') || 'none detected'}`);
    logger.log(`Migration tooling: ${(result.artifact.migrationTooling || []).join(', ') || 'none detected'}`);
  }

  function dbRefresh() {
    const repoConfig = loadRepoConfig(context.cwd) || {};
    const result = refreshDatabaseArtifacts(context.cwd, { config: repoConfig });
    logger.log('DB artifacts refreshed:');
    logger.log(`  - ${path.relative(context.cwd, result.paths.discoveryPath).replace(/\\/g, '/')}`);
    logger.log(`  - ${path.relative(context.cwd, result.paths.schemaSnapshotPath).replace(/\\/g, '/')}`);
    logger.log(`  - ${path.relative(context.cwd, result.paths.relationsGraphPath).replace(/\\/g, '/')}`);
    logger.log(`  - ${path.relative(context.cwd, result.paths.codeAccessMapPath).replace(/\\/g, '/')}`);
  }

  function dbLint(options = {}) {
    const repoConfig = loadRepoConfig(context.cwd) || {};
    const strict = options.strict === true || repoConfig.dbGovernance?.strictArtifactLint === true;
    const result = lintDatabaseArtifacts(context.cwd, { strict });
    if (result.errors.length === 0 && result.warnings.length === 0) {
      logger.log('DB artifacts are valid.');
      return;
    }
    result.errors.forEach((error) => logger.log(`ERROR ${error}`));
    result.warnings.forEach((warning) => logger.log(`WARN ${warning}`));
    if (!result.valid) {
      exit(1);
    }
  }

  function apiDiscover() {
    const repoConfig = loadRepoConfig(context.cwd) || {};
    const result = saveSystemInventoryArtifact(context.cwd, { config: repoConfig });
    logger.log(`System inventory: ${path.relative(context.cwd, result.outputPath).replace(/\\/g, '/')}`);
    logger.log(`Profile: ${result.artifact.profile}`);
    logger.log(`API styles: ${(result.artifact.api.styles || []).join(', ') || 'none detected'}`);
    logger.log(`API specs: ${(result.artifact.api.specFiles || []).join(', ') || 'none detected'}`);
  }

  function apiRefresh() {
    const repoConfig = loadRepoConfig(context.cwd) || {};
    const result = refreshApiArtifacts(context.cwd, { config: repoConfig });
    logger.log('API artifacts refreshed:');
    logger.log(`  - ${path.relative(context.cwd, result.paths.inventoryPath).replace(/\\/g, '/')}`);
    logger.log(`  - ${path.relative(context.cwd, result.paths.apiSnapshotPath).replace(/\\/g, '/')}`);
    logger.log(`  - Operations: ${result.apiSnapshot.operations.length}`);
  }

  function apiLint(options = {}) {
    const repoConfig = loadRepoConfig(context.cwd) || {};
    const strict = options.strict === true || repoConfig.dbGovernance?.strictArtifactLint === true;
    const result = lintApiArtifacts(context.cwd, { strict });
    if (result.errors.length === 0 && result.warnings.length === 0) {
      logger.log('API artifacts are valid.');
      return;
    }
    result.errors.forEach((error) => logger.log(`ERROR ${error}`));
    result.warnings.forEach((warning) => logger.log(`WARN ${warning}`));
    if (!result.valid) {
      exit(1);
    }
  }

  function feDiscover() {
    const repoConfig = loadRepoConfig(context.cwd) || {};
    const result = saveSystemInventoryArtifact(context.cwd, { config: repoConfig });
    logger.log(`System inventory: ${path.relative(context.cwd, result.outputPath).replace(/\\/g, '/')}`);
    logger.log(`Profile: ${result.artifact.profile}`);
    logger.log(`Frontend roots: ${(result.artifact.frontend.roots || []).join(', ') || 'none detected'}`);
    logger.log(`Package manager: ${result.artifact.packageManager || 'unknown'}`);
  }

  function feRefresh() {
    const repoConfig = loadRepoConfig(context.cwd) || {};
    const result = refreshFrontendArtifacts(context.cwd, { config: repoConfig });
    logger.log('FE artifacts refreshed:');
    logger.log(`  - ${path.relative(context.cwd, result.paths.inventoryPath).replace(/\\/g, '/')}`);
    logger.log(`  - ${path.relative(context.cwd, result.paths.feDepsSnapshotPath).replace(/\\/g, '/')}`);
    logger.log(`  - ${path.relative(context.cwd, result.paths.feImportGraphPath).replace(/\\/g, '/')}`);
    logger.log(`  - ${path.relative(context.cwd, result.paths.feApiUsageMapPath).replace(/\\/g, '/')}`);
  }

  function feLint(options = {}) {
    const repoConfig = loadRepoConfig(context.cwd) || {};
    const strict = options.strict === true || repoConfig.dbGovernance?.strictArtifactLint === true;
    const result = lintFrontendArtifacts(context.cwd, { strict });
    if (result.errors.length === 0 && result.warnings.length === 0) {
      logger.log('FE artifacts are valid.');
      return;
    }
    result.errors.forEach((error) => logger.log(`ERROR ${error}`));
    result.warnings.forEach((warning) => logger.log(`WARN ${warning}`));
    if (!result.valid) {
      exit(1);
    }
  }

  function depsDiscover() {
    const result = saveRepositoryDependencyGraph(context.cwd);
    logger.log(`Dependency graph: ${path.relative(context.cwd, result.outputPath).replace(/\\/g, '/')}`);
    logger.log(`Nodes: ${result.artifact.nodes.length}`);
    logger.log(`Edges: ${result.artifact.edges.length}`);
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

    const hooks = ['pre-commit', 'commit-msg', 'pre-push'];
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
    logger.log('  • pre-push: Enforces development->main release flow and release tag gates');
    logger.log('');
    logger.log('To enable strict mode (block commits without contracts):');
    logger.log(c.info('  export GRABBY_STRICT=1'));
    logger.log('');
  }

  function updateGrabby(options = {}) {
    const npmCommand = getNpmExecutable();
    const checkOnly = options.checkOnly === true;
    const shouldApply = options.yes === true;
    const localPackagePath = context.pkgRoot;
    const localPackageJsonPath = path.join(localPackagePath, 'package.json');

    let installedVersion = null;
    let latestVersion = null;
    let registryMetadata = null;
    let localPackageName = 'grabby';
    let localDescription = '';

    try {
      if (fs.existsSync(localPackageJsonPath)) {
        const localPkg = JSON.parse(fs.readFileSync(localPackageJsonPath, 'utf8'));
        localPackageName = localPkg.name || localPackageName;
        localDescription = localPkg.description || '';
      }
    } catch {
      // Ignore local package metadata parse issues and continue with defaults.
    }

    try {
      const raw = execSyncImpl(`${npmCommand} list -g grabby --depth=0 --json`, {
        stdio: 'pipe',
        cwd: context.cwd,
        encoding: 'utf8',
      });
      const parsed = parseJsonLike(raw) || {};
      installedVersion = parsed.dependencies?.grabby?.version || null;
    } catch {
      logger.log(c.warn('Could not determine globally installed Grabby version from npm list.'));
    }

    try {
      const raw = execSyncImpl(`${npmCommand} view grabby version --json`, {
        stdio: 'pipe',
        cwd: context.cwd,
        encoding: 'utf8',
      });
      const parsed = parseJsonLike(raw);
      latestVersion = typeof parsed === 'string' ? parsed : String(raw || '').trim().replace(/^"+|"+$/g, '');
      if (!latestVersion) {
        latestVersion = null;
      }
    } catch {
      logger.log(c.warn('Could not determine latest Grabby version from npm view (offline or registry unavailable).'));
    }

    try {
      const raw = execSyncImpl(`${npmCommand} view grabby name description bin --json`, {
        stdio: 'pipe',
        cwd: context.cwd,
        encoding: 'utf8',
      });
      registryMetadata = parseJsonLike(raw);
    } catch {
      // Optional metadata check; if unavailable, keep existing behavior.
    }

    const registryHasGrabbyBin = Boolean(registryMetadata?.bin?.grabby);
    const registryDescription = String(registryMetadata?.description || '').trim();
    const descriptionMismatch = Boolean(localDescription && registryDescription && localDescription !== registryDescription);
    const registryPackageUnsafe = registryMetadata && (!registryHasGrabbyBin || descriptionMismatch);

    const latestDisplay = registryPackageUnsafe
      ? 'n/a (registry package unrelated)'
      : (latestVersion || 'unknown');
    const installedVsLatest = installedVersion && latestVersion
      ? compareSemver(installedVersion, latestVersion)
      : null;

    logger.log('Grabby update status');
    logger.log(`  Installed: ${installedVersion || 'unknown'}`);
    logger.log(`  Latest: ${latestDisplay}`);

    if (registryPackageUnsafe) {
      logger.log(c.warn('Registry package `grabby` appears unrelated to this CLI. Automatic registry update is disabled.'));
      const localInstallCommand = `${npmCommand} install -g ${localPackagePath}`;
      if (checkOnly) {
        logger.log(c.info(`Run \`${localInstallCommand}\` to refresh from local source.`));
        return;
      }
      if (!shouldApply) {
        logger.log(c.info('Local-source refresh is available. Re-run with `--yes` to apply.'));
        logger.log(c.dim(`Command: ${localInstallCommand}`));
        return;
      }
      try {
        execSyncImpl(localInstallCommand, {
          stdio: 'pipe',
          cwd: context.cwd,
        });
        logger.log(c.success('Grabby refreshed from local source successfully.'));
        logger.log(c.dim('Restart your terminal session if this shell still resolves an older CLI binary.'));
      } catch (error) {
        logger.log(c.error(`Grabby local-source refresh failed: ${error.message}`));
        exit(1);
      }
      return;
    }

    if (checkOnly) {
      if (installedVsLatest === 0) {
        logger.log(c.success('Grabby is already up to date.'));
      } else if (installedVsLatest === 1) {
        logger.log(c.success('Grabby is already up to date (installed version is newer than registry latest).'));
      } else {
        logger.log(c.info('Run `grabby update --yes` to install the latest version.'));
      }
      return;
    }

    if (installedVsLatest === 0 || installedVsLatest === 1) {
      logger.log(c.success('Grabby is already up to date.'));
      return;
    }

    if (!shouldApply) {
      logger.log(c.info('Update is available. Re-run with `--yes` to apply.'));
      logger.log(c.dim('Command: grabby update --yes'));
      return;
    }

    try {
      execSyncImpl(`${npmCommand} install -g ${localPackageName}@latest`, {
        stdio: 'pipe',
        cwd: context.cwd,
      });
      logger.log(c.success('Grabby updated successfully.'));
      logger.log(c.dim('Restart your terminal session if this shell still resolves an older CLI binary.'));
    } catch (error) {
      logger.log(c.error(`Grabby update failed: ${error.message}`));
      exit(1);
    }
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

  // ============================================================================
  // RULESET COMMANDS
  // ============================================================================

  async function rulesetFetch(url, options = {}) {
    const { fetchRuleset, parseRuleset } = require('./ruleset-registry.cjs');
    try {
      logger.log(`Fetching ruleset from ${url}...`);
      const result = await fetchRuleset(url, context.cwd, { forceRefresh: options.force });
      const parsed = parseRuleset(result.content, url);

      if (result.cached) {
        logger.log(`✓ Using cached ruleset: ${parsed.name}`);
      } else {
        logger.log(`✓ Fetched and cached: ${parsed.name}`);
      }

      logger.log(`  Source: ${result.source}`);
      logger.log(`  Cache: ${path.relative(context.cwd, result.cachePath)}`);

      if (parsed.extends.length > 0) {
        logger.log(`  Extends: ${parsed.extends.join(', ')}`);
      }

      const sectionCounts = Object.entries(parsed.sections)
        .filter(([, items]) => items.length > 0)
        .map(([key, items]) => `${key}(${items.length})`);

      if (sectionCounts.length > 0) {
        logger.log(`  Sections: ${sectionCounts.join(', ')}`);
      }

      return result;
    } catch (error) {
      logger.log(`✗ Failed to fetch ruleset: ${error.message}`);
      exit(1);
    }
  }

  function rulesetList() {
    const { listRulesets } = require('./ruleset-registry.cjs');
    const rulesets = listRulesets(context.cwd);

    if (rulesets.length === 0) {
      logger.log('No rulesets found.');
      logger.log('\nTo add rulesets:');
      logger.log('  grabby ruleset fetch <url>           # Fetch from remote');
      logger.log('  grabby ruleset create <name>         # Create local ruleset');
      return;
    }

    logger.log('Available Rulesets:\n');

    const grouped = {
      builtin: rulesets.filter((r) => r.type === 'builtin'),
      shared: rulesets.filter((r) => r.type === 'shared'),
      local: rulesets.filter((r) => r.type === 'local'),
      remote: rulesets.filter((r) => r.type === 'remote'),
    };

    if (grouped.builtin.length > 0) {
      logger.log('Built-in:');
      grouped.builtin.forEach((r) => {
        const ext = r.extends.length > 0 ? ` (extends: ${r.extends.join(', ')})` : '';
        logger.log(`  ${r.name.padEnd(25)} ${r.file}${ext}`);
      });
      logger.log('');
    }

    if (grouped.shared.length > 0) {
      logger.log('Shared (docs/rulesets/):');
      grouped.shared.forEach((r) => {
        const ext = r.extends.length > 0 ? ` (extends: ${r.extends.join(', ')})` : '';
        logger.log(`  ${r.name.padEnd(25)} ${r.file}${ext}`);
      });
      logger.log('');
    }

    if (grouped.local.length > 0) {
      logger.log('Local (.grabby/rulesets/):');
      grouped.local.forEach((r) => {
        const ext = r.extends.length > 0 ? ` (extends: ${r.extends.join(', ')})` : '';
        logger.log(`  ${r.name.padEnd(25)} ${r.file}${ext}`);
      });
      logger.log('');
    }

    if (grouped.remote.length > 0) {
      logger.log('Cached Remote:');
      grouped.remote.forEach((r) => {
        const ext = r.extends.length > 0 ? ` (extends: ${r.extends.join(', ')})` : '';
        logger.log(`  ${r.name.padEnd(25)} ${r.file}${ext}`);
      });
      logger.log('');
    }

    logger.log(`Total: ${rulesets.length} ruleset(s)`);
  }

  async function rulesetResolve(name) {
    const { resolveRulesetChain, generateContractGuidance } = require('./ruleset-registry.cjs');
    const repoConfig = loadRepoConfig(context.cwd);

    try {
      logger.log(`Resolving ruleset: ${name}\n`);
      const resolved = await resolveRulesetChain(name, context.cwd, {
        trustedSources: repoConfig?.governance?.trustedSources || [],
      });

      logger.log(`Name: ${resolved.name}`);
      logger.log(`Source: ${resolved.source}`);

      if (resolved.inheritedFrom?.length > 0) {
        logger.log(`Inherited from: ${resolved.inheritedFrom.join(' → ')}`);
      }

      logger.log('\n--- Merged Content ---\n');
      logger.log(generateContractGuidance(resolved));
    } catch (error) {
      logger.log(`✗ Failed to resolve: ${error.message}`);
      exit(1);
    }
  }

  function rulesetClear() {
    const { clearCache } = require('./ruleset-registry.cjs');
    if (clearCache(context.cwd)) {
      logger.log('✓ Ruleset cache cleared');
    } else {
      logger.log('No cache to clear');
    }
  }

  return {
    init,
    gitStatus,
    gitSync,
    gitStart,
    gitUpdate,
    gitPreflight,
    dbDiscover,
    dbRefresh,
    dbLint,
    apiDiscover,
    apiRefresh,
    apiLint,
    feDiscover,
    feRefresh,
    feLint,
    depsDiscover,
    watch,
    agentLint,
    initHooks,
    updateGrabby,
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
    rulesetFetch,
    rulesetList,
    rulesetResolve,
    rulesetClear,
    setup,
    completeBaseline,
    archiveBaseline,
    installPrompt,
    writeOutput: (content, filePath = null) => writeOutput({ content, filePath, logger, outputMode }),
  };
}

module.exports = {
  createProjectContext,
  createCommandHandlers,
  inferCreateRequest,
  getNpmExecutable,
  getNpmRunCommand,
  getBmadFeatureFlags,
  getSuggestedNextActions,
  getLlmContextPolicy,
  inferVerificationTier,
};
