const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { callLLM, getAvailableProvider } = require('./ai-complete.cjs');

const TEXT_EXTENSIONS = new Set([
  '.md', '.markdown', '.txt', '.rst', '.adoc', '.yaml', '.yml', '.json', '.js', '.cjs', '.ts', '.tsx', '.jsx'
]);

function isLikelyTextFile(filePath) {
  return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function resolveInputFiles(baseDir, provided = []) {
  const files = [];
  for (const candidate of provided) {
    const resolved = path.resolve(baseDir, candidate);
    if (!fs.existsSync(resolved)) continue;
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(resolved)) {
        const nested = path.join(resolved, entry);
        if (fs.statSync(nested).isFile() && isLikelyTextFile(nested)) {
          files.push(nested);
        }
      }
    } else if (stat.isFile() && isLikelyTextFile(resolved)) {
      files.push(resolved);
    }
  }
  return Array.from(new Set(files));
}

function summarizeFiles(baseDir, files, maxChars = 12000) {
  let buffer = '';
  for (const file of files) {
    const rel = path.relative(baseDir, file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf8');
    const clipped = content.length > 2500 ? `${content.slice(0, 2500)}\n...` : content;
    const chunk = `\n## File: ${rel}\n${clipped}\n`;
    if ((buffer + chunk).length > maxChars) break;
    buffer += chunk;
  }
  return buffer;
}

function parseRulesetTitle(defaultName, answer) {
  const cleaned = (answer || '').trim();
  return cleaned.length > 0 ? cleaned : defaultName;
}

function slugifyTitle(title = '') {
  return String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ruleset';
}

function createPrompt(goal, contextSummary) {
  return `You are helping build an engineering ruleset from existing project files and user goals.\n\nUser goal:\n${goal}\n\nExisting project snippets:\n${contextSummary || '(none provided)'}\n\nGenerate a concise markdown ruleset using this structure:\n# RULESET: <name>\n\n## Purpose\n- bullet list\n\n## Standards\n- clear enforceable rules\n\n## Security & Quality Gates\n- include test expectations and lint/build checks\n\n## Non-Goals\n- explicit boundaries\n\n## References\n- referenced files\n\nKeep it practical and implementation-focused.`;
}

function createFallbackRuleset({ title, goal, references, mode }) {
  const refs = references.length > 0
    ? references.map((file) => `- ${file}`).join('\n')
    : '- None';
  const purpose = goal || (mode === 'import-existing'
    ? 'Capture reusable standards from existing project materials'
    : 'Define practical local repository standards');
  return `# RULESET: ${title}

## Purpose
- ${purpose}

## Standards
- Keep changes scoped and test-backed
- Follow existing architecture and naming conventions
- Prefer guided setup flows over ad hoc flags

## Security & Quality Gates
- Require tests for behavior changes
- Require lint/build checks to pass
- Avoid hidden scope expansion

## Non-Goals
- No unrelated refactors
- No undocumented workflow drift

## References
${refs}`;
}

function buildRulesetOutputDir(baseDir, mode, outputDir) {
  if (outputDir) {
    return outputDir;
  }
  return mode === 'create-local'
    ? path.join(baseDir, '.grabby', 'rulesets')
    : path.join(baseDir, 'docs', 'rulesets');
}

async function askQuestion(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function createRulesetFromMode(baseDir = process.cwd(), options = {}) {
  const logger = options.logger || console;
  const mode = options.mode || 'create-local';
  const outputDir = buildRulesetOutputDir(baseDir, mode, options.outputDir);
  const provider = options.provider || getAvailableProvider();
  const title = parseRulesetTitle(
    mode === 'import-existing' ? 'Imported Ruleset' : 'Local Repository Ruleset',
    options.title
  );
  const picked = String(options.pathsCsv || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const inputFiles = resolveInputFiles(baseDir, picked);
  const summary = summarizeFiles(baseDir, inputFiles);
  const references = inputFiles.map((file) => path.relative(baseDir, file).replace(/\\/g, '/'));

  let content;
  if (provider) {
    const prompt = createPrompt(options.goal || 'Create project engineering rules', summary);
    content = await callLLM(prompt, { provider, maxTokens: 1200, temperature: 0.3 });
  } else {
    content = createFallbackRuleset({
      title,
      goal: options.goal,
      references,
      mode,
    });
  }

  if (!content.startsWith('#')) {
    content = `# RULESET: ${title}\n\n${content}`;
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const outPath = path.join(outputDir, `${slugifyTitle(title)}.ruleset.md`);
  fs.writeFileSync(outPath, `${content.trim()}\n`, 'utf8');

  logger.log(`\nRuleset created: ${path.relative(baseDir, outPath)}`);
  if (inputFiles.length > 0) {
    logger.log(`Included context from ${inputFiles.length} file(s).`);
  }
  return outPath;
}

async function runRulesetWizard(baseDir = process.cwd(), options = {}) {
  const logger = options.logger || console;
  const rl = readline.createInterface({
    input: options.input || process.stdin,
    output: options.output || process.stdout,
  });

  try {
    logger.log('\nRuleset Wizard');
    logger.log('-'.repeat(40));
    logger.log('  1) Import rules from existing files');
    logger.log('  2) Create a local repository ruleset');

    const modeAnswer = options.mode || await askQuestion(rl, 'Choose mode (1-2): ');
    const mode = modeAnswer === '1' || modeAnswer === 'import-existing'
      ? 'import-existing'
      : 'create-local';
    const defaultTitle = mode === 'import-existing' ? 'Imported Ruleset' : 'Local Repository Ruleset';
    const defaultGoal = mode === 'import-existing'
      ? 'Capture reusable standards from existing project files'
      : 'Define local repository rules for this project';
    const pathPrompt = mode === 'import-existing'
      ? 'Existing files/directories to ingest (comma-separated): '
      : 'Seed files/directories for the local ruleset (comma-separated, optional): ';

    const goal = options.goal || await askQuestion(rl, 'What should this ruleset achieve? ');
    const title = parseRulesetTitle(defaultTitle, options.title || await askQuestion(rl, `Ruleset title (default: ${defaultTitle}): `));
    const pathsCsv = options.pathsCsv || await askQuestion(rl, pathPrompt);

    return createRulesetFromMode(baseDir, {
      ...options,
      mode,
      goal: goal || defaultGoal,
      title,
      pathsCsv,
      logger,
    });
  } finally {
    rl.close();
  }
}

async function interactiveCreateRuleset(baseDir = process.cwd(), options = {}) {
  return runRulesetWizard(baseDir, options);
}

module.exports = {
  interactiveCreateRuleset,
  runRulesetWizard,
  createRulesetFromMode,
  createFallbackRuleset,
  resolveInputFiles,
  summarizeFiles,
};
