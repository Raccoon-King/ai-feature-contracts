const fs = require('fs');
const path = require('path');
const { detectProjectType, getProjectDirs } = require('./smart-prompts.cjs');
const { summarizeProjectAssessment } = require('./ai-complete.cjs');
const { suggestPluginsForAssessment } = require('./plugins.cjs');

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

function detectNestedProjectTypes(cwd, rootEntries = []) {
  const detected = [];
  const directories = rootEntries.filter((entry) => entry.kind === 'dir').map((entry) => entry.name);
  directories.forEach((dirName) => {
    const dirPath = path.join(cwd, dirName);
    if (fs.existsSync(path.join(dirPath, 'go.mod')) || fs.existsSync(path.join(dirPath, 'main.go'))) {
      detected.push('go');
    }
    if (fs.existsSync(path.join(dirPath, 'package.json'))) {
      detected.push('node');
    }
    if (fs.existsSync(path.join(dirPath, 'pyproject.toml')) || fs.existsSync(path.join(dirPath, 'requirements.txt'))) {
      detected.push('python');
    }
    if (fs.existsSync(path.join(dirPath, 'Cargo.toml'))) {
      detected.push('rust');
    }
  });
  return unique(detected);
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
  const rootEntries = listRootEntries(cwd);
  const nestedTypes = detectNestedProjectTypes(cwd, rootEntries);
  const projectTypes = unique([...detectProjectType(cwd), ...nestedTypes]);
  const projectDirs = unique(getProjectDirs(cwd));
  const dependencies = getDependencyNames(pkg, 'dependencies');
  const devDependencies = getDependencyNames(pkg, 'devDependencies');
  const scripts = Object.keys((pkg && pkg.scripts) || {}).sort();
  const stackSummary = detectStackSummary(projectTypes, pkg);
  const testDirNames = ['test', 'tests', 'spec', '__tests__'];
  const hasTestDir = projectDirs.some((dir) => testDirNames.includes(String(dir).toLowerCase()))
    || rootEntries.some((entry) => entry.kind === 'dir' && testDirNames.includes(String(entry.name).toLowerCase()));

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
    hasTests: hasTestDir || scripts.some((name) => name.startsWith('test')),
    hasContracts: fs.existsSync(path.join(cwd, 'contracts')),
    pluginSuggestions: suggestPluginsForAssessment({
      projectDirs,
      rootEntries,
      dependencies,
      devDependencies,
    }),
  };
}

function renderTemplate(template, values) {
  return Object.entries(values).reduce((content, [key, value]) => {
    return content.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
  }, template);
}

function formatAllowedDirs(projectDirs) {
  const ordered = unique(projectDirs)
    .filter((dir) => ['src', 'lib', 'app', 'pages', 'components', 'hooks', 'services', 'utils', 'test', 'tests', 'api', 'server', 'client'].includes(dir))
    .map((dir) => `\`${dir}/\``);

  if (ordered.length > 0) {
    return ordered.join(', ');
  }

  return '`src/`, `lib/`, `tests/`';
}

function formatStackLabels(projectTypes) {
  return projectTypes.length > 0 ? projectTypes.join(', ') : 'local project structure';
}

function deriveProjectContext(assessment, summary = '') {
  const recommendedDirectories = unique(
    assessment.projectDirs.filter((dir) => ['src', 'lib', 'app', 'pages', 'components', 'hooks', 'services', 'utils', 'test', 'tests', 'api', 'server', 'client', 'docs'].includes(dir))
  );
  const dependencySignals = unique([
    ...assessment.dependencies.slice(0, 8),
    ...assessment.devDependencies.slice(0, 8),
  ]);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    packageName: assessment.packageName,
    stackSummary: assessment.stackSummary,
    summary,
    projectTypes: assessment.projectTypes,
    projectDirs: assessment.projectDirs,
    recommendedDirectories,
    scripts: assessment.scripts,
    dependencySignals,
    testing: {
      hasTests: assessment.hasTests,
      signals: assessment.scripts.filter((name) => name.startsWith('test')),
    },
    governance: {
      hasContracts: assessment.hasContracts,
      allowedDirectories: recommendedDirectories.length > 0 ? recommendedDirectories : ['src', 'lib', 'tests'],
      restrictedDirectories: ['node_modules', '.git', '.env*', 'coverage'],
    },
    plugins: {
      suggested: assessment.pluginSuggestions || [],
    },
    rootSignals: assessment.rootEntries.slice(0, 12),
  };
}

function saveProjectContextArtifact(cwd, projectContext, outputPath = path.join(cwd, '.grabby', 'project-context.json')) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(projectContext, null, 2)}\n`, 'utf8');
  return outputPath;
}

async function generateProjectContextArtifact({ cwd, outputPath = path.join(cwd, '.grabby', 'project-context.json') }) {
  const assessment = collectProjectAssessment(cwd);
  const summary = await summarizeProjectAssessment(assessment);
  const projectContext = deriveProjectContext(assessment, summary);
  const savedPath = saveProjectContextArtifact(cwd, projectContext, outputPath);
  return {
    assessment,
    summary,
    projectContext,
    outputPath: savedPath,
  };
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

function buildSetupBaselineContract(assessment, summary) {
  const recommendedDirs = formatAllowedDirs(assessment.projectDirs);
  const stackLabels = formatStackLabels(assessment.projectTypes);
  const testSignals = assessment.scripts.filter((name) => name.startsWith('test'));
  const testSignalLine = testSignals.length > 0 ? testSignals.join(', ') : 'none detected';

  return `# Feature Contract: Setup Validation and Project Index Baseline
**ID:** SETUP-BASELINE | **Status:** draft
CONTRACT_TYPE: FEATURE_CONTRACT
ARCH_VERSION: v1
RULESET_VERSION: v1
ENV_VERSION: v1

## Objective
Define the deterministic setup validation and repository indexing procedure that any LLM must follow after \`grabby init\` so governed workflows start from a known-good baseline.

## Scope
- Verify required setup artifacts exist and are readable for this repository
- Verify CI/CD setup status and capture missing automation artifacts
- Build and refresh a project index snapshot grounded in current repository signals
- Produce a remediation checklist when setup gaps are detected

## Non-Goals
- Directly implement feature code outside setup/index governance artifacts
- Skip or bypass Grabby lifecycle gates
- Infer private runtime values or secrets from local environments

## Directories
**Allowed:** ${recommendedDirs}, \`contracts/\`, \`.grabby/\`, \`.github/\`, \`docs/\`
**Restricted:** \`node_modules/\`, \`.git/\`, \`.env*\`, \`coverage/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | \`contracts/SETUP-BASELINE.fc.md\` | Seed deterministic setup-validation instructions for any LLM |
| modify | \`contracts/SETUP-BASELINE.fc.md\` | Refine setup checks for repository-specific requirements |
| modify | \`.grabby/project-context.json\` | Refresh the indexed project context after setup validation |
| modify | \`contracts/README.md\` | Keep baseline guidance aligned with setup-validation workflow |

## Dependencies
- Detected stack: ${stackLabels}
- Required setup commands: \`grabby init\`, \`grabby cicd\`, \`grabby cicd --setup\`
- Test signal scripts: ${testSignalLine}

## Security Considerations
- [ ] Setup validation confirms baseline artifacts contain no secrets
- [ ] Restricted directories remain excluded from setup/index automation
- [ ] Remediation outputs avoid exposing sensitive local environment details

## Done When
- [ ] Required setup artifacts are validated: \`.grabby/governance.lock\`, \`grabby.config.json\`, \`.grabby/config.json\`, \`contracts/SYSTEM-BASELINE.fc.md\`, \`contracts/PROJECT-BASELINE.fc.md\`, \`contracts/SETUP-BASELINE.fc.md\`, \`.grabby/project-context.json\`
- [ ] CI/CD status is checked and missing artifacts are either generated or explicitly documented
- [ ] Project indexing signals (stack, directories, testing, plugins) are refreshed and traceable
- [ ] Any LLM can execute the same setup-validation sequence without improvisation

## Testing
- Run \`grabby validate SETUP-BASELINE.fc.md\`
- Run \`grabby cicd\` and confirm setup status output is captured
- Confirm \`.grabby/project-context.json\` reflects current repository structure after validation

## LLM Setup Protocol
1. Read \`contracts/SYSTEM-BASELINE.fc.md\` and \`contracts/PROJECT-BASELINE.fc.md\` first.
2. Validate required setup artifacts listed in Done When.
3. Run CI/CD setup checks and generate missing files with \`grabby cicd --setup\` if needed.
4. Refresh and review \`.grabby/project-context.json\` as the canonical index artifact.
5. Record unresolved setup gaps before any post-setup feature work.

## Context Refs
- ARCH: setup-validation@v1
- RULESET: baseline-governance@v1
- ENV: local-repo-index@v1

## Status Notes
- Assessment summary: ${summary}
- Baseline stack profile: ${assessment.stackSummary}
`;
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
    {
      filePath: path.join(contractsDir, 'SETUP-BASELINE.fc.md'),
      content: buildSetupBaselineContract(assessment, summary),
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
  buildSetupBaselineContract,
  deriveProjectContext,
  saveProjectContextArtifact,
  generateProjectContextArtifact,
};
