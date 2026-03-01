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

function createPrompt(goal, contextSummary) {
  return `You are helping build an engineering ruleset from existing project files and user goals.\n\nUser goal:\n${goal}\n\nExisting project snippets:\n${contextSummary || '(none provided)'}\n\nGenerate a concise markdown ruleset using this structure:\n# RULESET: <name>\n\n## Purpose\n- bullet list\n\n## Standards\n- clear enforceable rules\n\n## Security & Quality Gates\n- include test expectations and lint/build checks\n\n## Non-Goals\n- explicit boundaries\n\n## References\n- referenced files\n\nKeep it practical and implementation-focused.`;
}

async function askQuestion(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function interactiveCreateRuleset(baseDir = process.cwd(), options = {}) {
  const logger = options.logger || console;
  const outputDir = options.outputDir || path.join(baseDir, 'docs');
  const provider = options.provider || getAvailableProvider();

  const rl = readline.createInterface({
    input: options.input || process.stdin,
    output: options.output || process.stdout,
  });

  try {
    logger.log('\nRuleset Builder');
    logger.log('─'.repeat(40));

    const goal = options.goal || await askQuestion(rl, 'What ruleset do you want to create? ');
    const title = parseRulesetTitle('Custom Ruleset', options.title || await askQuestion(rl, 'Ruleset title (default: Custom Ruleset): '));
    const pathsRaw = options.pathsCsv || await askQuestion(rl, 'Context files/directories (comma-separated, optional): ');
    const picked = pathsRaw.split(',').map((v) => v.trim()).filter(Boolean);
    const inputFiles = resolveInputFiles(baseDir, picked);

    const summary = summarizeFiles(baseDir, inputFiles);

    let content;
    if (provider) {
      const prompt = createPrompt(goal || 'Create project engineering rules', summary);
      content = await callLLM(prompt, { provider, maxTokens: 1200, temperature: 0.3 });
    } else {
      const refs = inputFiles.map((f) => `- ${path.relative(baseDir, f).replace(/\\/g, '/')}`).join('\n') || '- None';
      content = `# RULESET: ${title}\n\n## Purpose\n- ${goal || 'Define practical project standards'}\n\n## Standards\n- Keep changes scoped and test-backed\n- Follow existing architecture and naming conventions\n\n## Security & Quality Gates\n- Require tests for behavior changes\n- Require lint/build checks to pass\n\n## Non-Goals\n- No unrelated refactors\n- No hidden scope expansion\n\n## References\n${refs}`;
    }

    if (!content.startsWith('#')) {
      content = `# RULESET: ${title}\n\n${content}`;
    }

    fs.mkdirSync(outputDir, { recursive: true });
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ruleset';
    const outPath = path.join(outputDir, `${slug}.ruleset.md`);
    fs.writeFileSync(outPath, `${content.trim()}\n`, 'utf8');

    logger.log(`\n✓ Ruleset created: ${path.relative(baseDir, outPath)}`);
    if (inputFiles.length > 0) {
      logger.log(`Included context from ${inputFiles.length} file(s).`);
    }
    return outPath;
  } finally {
    rl.close();
  }
}

module.exports = {
  interactiveCreateRuleset,
  resolveInputFiles,
  summarizeFiles,
};
