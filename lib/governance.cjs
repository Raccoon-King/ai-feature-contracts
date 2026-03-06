const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = {
  version: 1,
  llm: {
    defaultProvider: 'generic',
    providers: {
      generic: {
        type: 'openai-compatible',
        model: 'set-me',
      },
    },
  },
  governance: {
    rules: [
      'Obey contract scope and non-goals.',
      'Do not modify restricted directories.',
      'Explain tradeoffs before expanding scope.',
      'Prefer minimal, testable changes.',
    ],
    guidance: [
      'Treat the Grabby backlog as the execution order.',
      'Finish subtasks in order unless a dependency forces a re-sequence.',
      'Keep output deterministic and concise.',
    ],
  },
  contractRequired: {
    fileCountThreshold: 10,
    restrictedPaths: ['src/core', 'migrations'],
    alwaysRequireTypes: ['architectural_change'],
  },
  agile: {
    enabled: true,
    levels: ['epic', 'task', 'subtask'],
    maxTasksPerEpic: 5,
    maxSubtasksPerTask: 5,
    splitBy: ['scope', 'files', 'quality'],
    naming: {
      epicPrefix: 'EPIC',
      taskPrefix: 'TASK',
      subtaskPrefix: 'SUBTASK',
    },
  },
};

function getGrabbyDir(cwd) {
  return path.join(cwd, '.grabby');
}

function getConfigPath(cwd) {
  return path.join(getGrabbyDir(cwd), 'config.json');
}

function ensureGrabbyDir(cwd) {
  const grabbyDir = getGrabbyDir(cwd);
  if (!fs.existsSync(grabbyDir)) {
    fs.mkdirSync(grabbyDir, { recursive: true });
  }
  return grabbyDir;
}

function initConfig(cwd) {
  ensureGrabbyDir(cwd);
  const configPath = getConfigPath(cwd);
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
  }
  return configPath;
}

function mergeConfig(defaultValue, overrideValue) {
  if (Array.isArray(defaultValue) || Array.isArray(overrideValue)) {
    return overrideValue !== undefined ? overrideValue : defaultValue;
  }

  if (
    defaultValue &&
    typeof defaultValue === 'object' &&
    overrideValue &&
    typeof overrideValue === 'object'
  ) {
    const merged = { ...defaultValue };
    Object.keys(overrideValue).forEach((key) => {
      merged[key] = mergeConfig(defaultValue[key], overrideValue[key]);
    });
    return merged;
  }

  return overrideValue !== undefined ? overrideValue : defaultValue;
}

function loadConfig(cwd) {
  const configPath = getConfigPath(cwd);
  if (!fs.existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }

  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return mergeConfig(DEFAULT_CONFIG, parsed);
}

function renderPromptBundle({
  fileName,
  contractContent,
  config,
  planContent = null,
  backlogContent = null,
}) {
  const rules = config.governance.rules.map((rule) => `- ${rule}`).join('\n');
  const guidance = config.governance.guidance.map((item) => `- ${item}`).join('\n');
  const provider = config.llm.defaultProvider;

  return `# Grabby Prompt Bundle: ${fileName}

## Runtime
- Provider profile: ${provider}
- Agile levels: ${config.agile.levels.join(' > ')}
- Max tasks per epic: ${config.agile.maxTasksPerEpic}
- Max subtasks per task: ${config.agile.maxSubtasksPerTask}

## Rules
${rules}

## Guidance
${guidance}

## Contract
\`\`\`markdown
${contractContent.trim()}
\`\`\`

${planContent ? `## Plan
\`\`\`yaml
${planContent.trim()}
\`\`\`

` : ''}${backlogContent ? `## Backlog
\`\`\`yaml
${backlogContent.trim()}
\`\`\`

` : ''}## LLM Instructions
1. Follow the contract exactly.
2. Execute work according to the backlog hierarchy.
3. Do not exceed the allowed directories or add banned dependencies.
4. Report assumptions before changing scope.
5. Prefer minimal diffs with tests and validation.
6. Assess feature complexity using Fibonacci points only: 0.5, 1, 2, 3, 5, 8, 13.
7. Assess delivery time using only these buckets: 0.5 day, 1 day, 3 days, 5 days, 2 weeks.
8. If estimate is over 5 days or complexity is 13, recommend breakdown and require subtasks before implementation.
9. After completion, display a post-feature ticket with: Feature ID, summary, Fibonacci complexity, time bucket, breakdown decision, subtasks, validation results, and follow-up risks.
`;
}

module.exports = {
  DEFAULT_CONFIG,
  getGrabbyDir,
  getConfigPath,
  ensureGrabbyDir,
  initConfig,
  loadConfig,
  renderPromptBundle,
  getAfcDir: getGrabbyDir,
  ensureAfcDir: ensureGrabbyDir,
};
