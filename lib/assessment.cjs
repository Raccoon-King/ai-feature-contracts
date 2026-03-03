const fs = require('fs');
const path = require('path');
const { detectProjectType, getProjectDirs } = require('./smart-prompts.cjs');
const { summarizeProjectAssessment } = require('./ai-complete.cjs');

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function listRootEntries(cwd) {
  return fs.readdirSync(cwd, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.'))
    .filter((entry) => !['node_modules', 'coverage'].includes(entry.name))
    .map((entry) => ({
      name: entry.name,
      kind: entry.isDirectory() ? 'dir' : 'file',
    }));
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function getDependencyNames(pkg, key) {
  return Object.keys((pkg && pkg[key]) || {}).sort();
}

function detectStackSummary(projectTypes, pkg) {
  if (projectTypes.includes('nextjs')) return 'Next.js application';
  if (projectTypes.includes('react') && projectTypes.includes('typescript')) return 'React + TypeScript application';
  if (projectTypes.includes('react')) return 'React application';
  if (projectTypes.includes('typescript') && projectTypes.includes('node')) return 'Node.js + TypeScript CLI/service';
  if (projectTypes.includes('node')) return 'Node.js project';
  if (projectTypes.includes('python')) return 'Python project';
  if (projectTypes.includes('go')) return 'Go project';
  if (projectTypes.includes('rust')) return 'Rust project';
  return pkg && pkg.name ? `Project ${pkg.name}` : 'software project';
}

function collectProjectAssessment(cwd) {
  const pkg = readJson(path.join(cwd, 'package.json'));
  const projectTypes = unique(detectProjectType(cwd));
  const projectDirs = unique(getProjectDirs(cwd));
  const rootEntries = listRootEntries(cwd);
  const dependencies = getDependencyNames(pkg, 'dependencies');
  const devDependencies = getDependencyNames(pkg, 'devDependencies');
  const scripts = Object.keys((pkg && pkg.scripts) || {}).sort();
  const stackSummary = detectStackSummary(projectTypes, pkg);

  return {
    cwd,
    packageName: pkg && pkg.name ? pkg.name : path.basename(cwd),
    projectTypes,
    projectDirs,
    rootEntries,
    dependencies,
    devDependencies,
    scripts,
    stackSummary,
    hasTests: projectDirs.includes('tests') || projectDirs.includes('__tests__') || scripts.some((name) => name.startsWith('test')),
    hasContracts: fs.existsSync(path.join(cwd, 'contracts')),
  };
}

function renderTemplate(template, values) {
  return Object.entries(values).reduce((content, [key, value]) => {
    return content.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
  }, template);
}

function formatAllowedDirs(projectDirs) {
  const ordered = unique(projectDirs)
    .filter((dir) => ['src', 'lib', 'app', 'pages', 'components', 'hooks', 'services', 'utils', 'tests', 'api', 'server', 'client'].includes(dir))
    .map((dir) => `\`${dir}/\``);

  if (ordered.length > 0) {
    return ordered.join(', ');
  }

  return '`src/`, `lib/`, `tests/`';
}

function formatStackLabels(projectTypes) {
  return projectTypes.length > 0 ? projectTypes.join(', ') : 'local project structure';
}

function buildProjectBaselineContract(assessment, summary) {
  const packageLine = assessment.packageName ? `Package/Application: \`${assessment.packageName}\`` : 'Package/Application: local repository';
  const dependencies = unique([...assessment.dependencies.slice(0, 5), ...assessment.devDependencies.slice(0, 5)]);
  const dependencyLine = dependencies.length > 0
    ? dependencies.map((name) => `\`${name}\``).join(', ')
    : 'existing repository dependencies';
  const rootSignals = assessment.rootEntries.slice(0, 8)
    .map((entry) => `\`${entry.name}${entry.kind === 'dir' ? '/' : ''}\``)
    .join(', ');

  return `# Feature Contract: Project Baseline for ${assessment.stackSummary}
**ID:** PROJECT-BASELINE | **Status:** draft
CONTRACT_TYPE: FEATURE_CONTRACT
ARCH_VERSION: v1
RULESET_VERSION: v1
ENV_VERSION: v1

## Objective
Capture the repository baseline for this ${assessment.stackSummary.toLowerCase()} so future feature contracts can stay aligned with the detected structure and tooling.

## Scope
- Record the detected stack and primary project directories for planning context
- Establish default implementation areas for feature contracts in this repository
- Document testing and validation expectations inferred from current tooling
- Preserve the generated baseline as a starting point for future contract refinement

## Non-Goals
- Approve or execute work automatically from this baseline
- Replace detailed architecture docs or project README content
- Infer secrets, credentials, or private runtime values from the local environment

## Directories
**Allowed:** ${formatAllowedDirs(assessment.projectDirs)}
**Restricted:** \`node_modules/\`, \`.git/\`, \`.env*\`, \`coverage/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | \`contracts/PROJECT-BASELINE.fc.md\` | Record the detected repository baseline |
| modify | \`contracts/PROJECT-BASELINE.fc.md\` | Refine the generated baseline after manual review |
| modify | \`contracts/README.md\` | Keep contract usage aligned with baseline generation |

## Dependencies
- Detected stack: ${formatStackLabels(assessment.projectTypes)}
- ${packageLine}
- Primary dependency signals: ${dependencyLine}

## Security Considerations
- [ ] Baseline content reviewed to ensure no secrets or environment values were captured
- [ ] Allowed and restricted directories match the repository's intended governance boundaries
- [ ] Follow-up contracts refine security-sensitive areas before implementation work begins

## Done When
- [ ] The repository stack baseline matches the current project structure
- [ ] Default contract directories reflect the repository's working areas
- [ ] Testing expectations align with existing scripts or test directories
- [ ] Future contracts can use this file as a project-specific starting point
- [ ] Manual review confirms the baseline contains no sensitive information

## Testing
- Manual review of generated baseline content against the repository layout
- Validate future contracts against this baseline before execution

## Context Refs
- ARCH: stack@v1
- RULESET: imports@v1
- ENV: test-runner@v1

## Status Notes
- Assessment summary: ${summary}
- Root signals considered: ${rootSignals || 'no notable root signals detected'}
`;
}

function buildSystemBaselineContract(templatePath, summary, assessment) {
  const template = fs.readFileSync(templatePath, 'utf8');
  return renderTemplate(template, {
    SUMMARY: summary,
    STACK_SUMMARY: assessment.stackSummary,
    PROJECT_NAME: assessment.packageName,
  });
}

async function generateBaselineContracts({ cwd, contractsDir, templatesDir }) {
  const assessment = collectProjectAssessment(cwd);
  const summary = await summarizeProjectAssessment(assessment);
  const created = [];
  const skipped = [];

  const targets = [
    {
      filePath: path.join(contractsDir, 'SYSTEM-BASELINE.fc.md'),
      content: buildSystemBaselineContract(path.join(templatesDir, 'system-baseline.md'), summary, assessment),
    },
    {
      filePath: path.join(contractsDir, 'PROJECT-BASELINE.fc.md'),
      content: buildProjectBaselineContract(assessment, summary),
    },
  ];

  targets.forEach(({ filePath, content }) => {
    if (fs.existsSync(filePath)) {
      skipped.push(path.basename(filePath));
      return;
    }

    fs.writeFileSync(filePath, content, 'utf8');
    created.push(path.basename(filePath));
  });

  return { assessment, summary, created, skipped };
}

module.exports = {
  collectProjectAssessment,
  generateBaselineContracts,
  buildProjectBaselineContract,
};
