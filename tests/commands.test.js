const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('yaml');
const {
  createProjectContext,
  createCommandHandlers,
  inferCreateRequest,
} = require('../lib/commands.cjs');

const PKG_ROOT = path.join(__dirname, '..');

function createLogger() {
  const lines = [];
  return {
    lines,
    log: (...values) => lines.push(values.join(' ')),
  };
}

function writeValidContract(tempDir, name = 'valid-feature.fc.md', status = 'draft') {
  const contractsDir = path.join(tempDir, 'contracts');
  fs.mkdirSync(contractsDir, { recursive: true });
  const contractPath = path.join(contractsDir, name);

  fs.writeFileSync(contractPath, `# FC: Valid Feature
**ID:** FC-123 | **Status:** ${status}

## Objective
Ship a bounded feature contract workflow.

## Scope
- Create a valid contract
- Generate a plan

## Non-Goals
- Backend changes

## Directories
**Allowed:** \`src/\`, \`tests/\`
**Restricted:** \`backend/\`, \`node_modules/\`, \`.env*\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | \`src/feature.ts\` | Implementation |
| create | \`tests/feature.test.ts\` | Tests |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery

## Security Considerations
- [ ] Input validation implemented

## Code Quality
- [ ] Lint passes

## Done When
- [ ] Feature works as specified
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes

## Testing
- Unit: \`tests/feature.test.ts\`

## Context Refs
- ARCH_INDEX_v1
- RULESET_CORE_v1
`, 'utf8');

  return contractPath;
}

function createContextDocs(tempDir) {
  const docsDir = path.join(tempDir, 'docs');
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(path.join(docsDir, 'context-index.yaml'), yaml.stringify({
    defaults: {},
    references: {
      ARCH: {
        'auth-module@v1': {
          file: 'architecture.md',
          section: 'Auth Module',
          phases: ['plan', 'execute'],
        },
      },
      RULESET: {
        'imports@v1': {
          file: 'ruleset.md',
          section: 'Imports',
          phases: ['plan', 'execute'],
        },
      },
      ENV: {
        'test-runner@v1': {
          file: 'env.md',
          section: 'Test Runner',
          phases: ['plan', 'execute'],
        },
      },
    },
    versions: {
      latest: {
        ARCH_VERSION: 'v1',
        RULESET_VERSION: 'v1',
        ENV_VERSION: 'v1',
      },
    },
  }), 'utf8');
  fs.writeFileSync(path.join(docsDir, 'architecture.md'), '## Auth Module\nArchitecture\n', 'utf8');
  fs.writeFileSync(path.join(docsDir, 'ruleset.md'), '## Imports\nRules\n', 'utf8');
  fs.writeFileSync(path.join(docsDir, 'env.md'), '## Test Runner\nEnvironment\n', 'utf8');
  return docsDir;
}

describe('Command handlers', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-commands-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates a project context with derived paths', () => {
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });

    expect(context.contractsDir).toBe(path.join(tempDir, 'contracts'));
    expect(context.templatesDir).toBe(path.join(PKG_ROOT, 'templates'));
    expect(context.docsDir).toBe(path.join(PKG_ROOT, 'docs'));
    expect(context.grabbyDir).toBe(path.join(tempDir, '.grabby'));
  });

  it('infers a plain-language create request without changing the default template', () => {
    const request = inferCreateRequest('a unit test');

    expect(request.name).toBe('unit test');
    expect(request.templateName).toBe('contract');
  });

  it('infers a bug-fix template from natural language', () => {
    const request = inferCreateRequest('fix login redirect bug');

    expect(request.name).toBe('login redirect bug');
    expect(request.templateName).toBe('bug-fix');
  });

  it('writes output to console and file based on mode', () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, outputMode: 'both', logger });
    const outFile = path.join(tempDir, 'out.txt');

    handlers.writeOutput('hello world', outFile);

    expect(fs.readFileSync(outFile, 'utf8')).toBe('hello world');
    expect(logger.lines.join('\n')).toContain('hello world');
    expect(logger.lines.join('\n')).toContain('Written to:');
  });

  it('reports resolveContract failures and exits', () => {
    const logger = createLogger();
    const exits = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({
      context,
      logger,
      exit: (code) => exits.push(code),
    });

    const resolved = handlers.resolveContract('missing.fc.md');

    expect(resolved).toBe(1);
    expect(exits).toEqual([1]);
    expect(logger.lines.join('\n')).toContain('Contract not found');
    expect(logger.lines.join('\n')).toContain('Looked in:');
  });

  it('fails create when the contract already exists', () => {
    const logger = createLogger();
    const exits = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({
      context,
      logger,
      exit: (code) => exits.push(code),
    });

    handlers.create('Existing Feature');
    handlers.create('Existing Feature');

    expect(exits).toEqual([1]);
    expect(logger.lines.join('\n')).toContain('Contract already exists');
  });

  it('creates a bug-fix contract from natural language input', () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger });

    handlers.create('fix login redirect bug');

    const contractPath = path.join(tempDir, 'contracts', 'login-redirect-bug.fc.md');
    const contract = fs.readFileSync(contractPath, 'utf8');
    expect(fs.existsSync(contractPath)).toBe(true);
    expect(contract).toContain('## Bug Details');
    expect(contract).toContain('# FC: login redirect bug');
    expect(logger.lines.join('\n')).toContain('Template: bug-fix');
  });

  it('fails planning when the contract is invalid', () => {
    const logger = createLogger();
    const exits = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({
      context,
      logger,
      exit: (code) => exits.push(code),
    });

    fs.mkdirSync(context.contractsDir, { recursive: true });
    fs.writeFileSync(path.join(context.contractsDir, 'FC-999.fc.md'), '# FC: Invalid\n**ID:** FC-999 | **Status:** draft\n## Objective\nMissing sections\n', 'utf8');

    handlers.plan('FC-999.fc.md');

    expect(exits).toEqual([1]);
    expect(logger.lines.join('\n')).toContain('Contract has validation errors');
  });

  it('fails validation when a completed feature remains in contracts/active', () => {
    const logger = createLogger();
    const exits = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({
      context,
      logger,
      exit: (code) => exits.push(code),
    });

    const activeDir = path.join(tempDir, 'contracts', 'active');
    fs.mkdirSync(activeDir, { recursive: true });
    fs.writeFileSync(path.join(activeDir, 'ARCH-9.fc.md'), `# Feature Contract: Done Feature
**ID:** ARCH-9 | **Status:** completed

## Objective
Archive me

## Scope
- done

## Non-Goals
- none

## Directories
**Allowed:** \`contracts/\`
**Restricted:** \`node_modules/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | \`contracts/active/ARCH-9.fc.md\` | contract |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery

## Security Considerations
- [ ] none

## Code Quality
- [ ] lint

## Done When
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes

## Testing
- Unit

## Context Refs
- ARCH: auth-module@v1
- RULESET: imports@v1
- ENV: test-runner@v1
`, 'utf8');

    handlers.validate(path.join(activeDir, 'ARCH-9.fc.md'));

    expect(exits).toEqual([1]);
    expect(logger.lines.join('\n')).toContain('Completed features must not remain in contracts/active/');
  });

  it('fails approval when no plan file exists yet', () => {
    const logger = createLogger();
    const exits = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger, exit: (code) => exits.push(code) });

    const contractPath = writeValidContract(tempDir);
    handlers.approve('valid-feature.fc.md');

    expect(fs.readFileSync(contractPath, 'utf8')).toContain('**Status:** draft');
    expect(exits).toEqual([1]);
    expect(logger.lines.join('\n')).toContain('No plan found');
  });

  it('fails execution when the plan file is missing', () => {
    const logger = createLogger();
    const exits = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({
      context,
      logger,
      exit: (code) => exits.push(code),
    });

    writeValidContract(tempDir, 'valid-feature.fc.md', 'approved');
    handlers.execute('valid-feature.fc.md');

    expect(exits).toEqual([1]);
    expect(logger.lines.join('\n')).toContain('No plan found');
  });

  it('executes legacy plans that use files_to_modify and files_to_create', () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger });

    writeValidContract(tempDir, 'valid-feature.fc.md', 'approved');
    fs.writeFileSync(path.join(tempDir, 'contracts', 'FC-123.plan.yaml'), yaml.stringify({
      status: 'approved',
      context: ['ARCH:test@v1'],
      rules: ['§testing'],
      files_to_create: ['tests/new-cli.test.js'],
      files_to_modify: ['tests/cli.test.js'],
    }));

    handlers.execute('valid-feature.fc.md');

    const planData = yaml.parse(fs.readFileSync(path.join(tempDir, 'contracts', 'FC-123.plan.yaml'), 'utf8'));
    expect(planData.status).toBe('executing');
    expect(planData.execution_guard).toBe('passed');
    expect(logger.lines.join('\n')).toContain('create: tests/new-cli.test.js');
    expect(logger.lines.join('\n')).toContain('modify: tests/cli.test.js');
  });

  it('audits files and reports lint/build outcomes', () => {
    const logger = createLogger();
    const commands = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({
      context,
      logger,
      execSyncImpl: (command) => {
        commands.push(command);
        if (command.includes('build')) {
          throw new Error('build failed');
        }
      },
    });

    writeValidContract(tempDir, 'valid-feature.fc.md', 'approved');
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      name: 'tmp',
      scripts: {
        lint: 'echo lint',
        build: 'echo build',
      },
    }), 'utf8');
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'src', 'feature.ts'), 'module.exports = {};', 'utf8');
    fs.mkdirSync(path.join(tempDir, 'contracts'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'contracts', 'FC-123.plan.yaml'), yaml.stringify({
      status: 'executing',
      files: [
        { action: 'create', path: 'src/feature.ts' },
        { action: 'modify', path: 'README.md' },
      ],
    }));

    handlers.audit('valid-feature.fc.md');

    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    expect(commands).toEqual([`${npmCommand} run lint`, `${npmCommand} run build`]);
    expect(logger.lines.join('\n')).toContain('Lint: passed');
    expect(logger.lines.join('\n')).toContain('Build: failed');
    expect(logger.lines.join('\n')).toContain('src/feature.ts');
  });

  it('skips unconfigured build checks during audit', () => {
    const logger = createLogger();
    const commands = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({
      context,
      logger,
      execSyncImpl: (command) => {
        commands.push(command);
      },
    });

    writeValidContract(tempDir, 'valid-feature.fc.md', 'approved');
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      name: 'tmp',
      scripts: {
        lint: 'echo lint',
      },
    }), 'utf8');
    fs.mkdirSync(path.join(tempDir, 'contracts'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'contracts', 'FC-123.plan.yaml'), yaml.stringify({
      status: 'executing',
      files: [],
    }));

    handlers.audit('valid-feature.fc.md');

    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    expect(commands).toEqual([`${npmCommand} run lint`]);
    expect(logger.lines.join('\n')).toContain('Lint: passed');
    expect(logger.lines.join('\n')).toContain('Build: not configured');
  });

  it('treats noop lint scripts as not configured during audit', () => {
    const logger = createLogger();
    const commands = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({
      context,
      logger,
      execSyncImpl: (command) => {
        commands.push(command);
      },
    });

    writeValidContract(tempDir, 'valid-feature.fc.md', 'approved');
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      name: 'tmp',
      scripts: {
        lint: "echo 'No lint configured yet'",
      },
    }), 'utf8');
    fs.mkdirSync(path.join(tempDir, 'contracts'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'contracts', 'FC-123.plan.yaml'), yaml.stringify({
      status: 'executing',
      files: [],
    }));

    handlers.audit('valid-feature.fc.md');

    expect(commands).toEqual([]);
    expect(logger.lines.join('\n')).toContain('Lint: not configured (noop script)');
  });

  it('reports the real contract status during audit instead of the plan status', () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({
      context,
      logger,
      execSyncImpl: () => {},
    });

    writeValidContract(tempDir, 'valid-feature.fc.md', 'complete');
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      name: 'tmp',
      scripts: {
        lint: 'echo lint',
      },
    }), 'utf8');
    fs.writeFileSync(path.join(tempDir, 'contracts', 'FC-123.plan.yaml'), yaml.stringify({
      status: 'executing',
      files: [],
    }), 'utf8');

    handlers.audit('valid-feature.fc.md');

    expect(logger.lines.join('\n')).toContain('Status: complete');
    expect(logger.lines.join('\n')).not.toContain('Status: executing');
    expect(fs.readFileSync(path.join(tempDir, 'contracts', 'FC-123.audit.md'), 'utf8')).toContain('- Status: complete');
  });

  it('lists an empty contract directory clearly', () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger });

    handlers.list();

    expect(logger.lines.join('\n')).toContain('No contracts found.');
    expect(logger.lines.join('\n')).toContain('grabby create "feature-name"');
  });

  it('initializes repo config during init', async () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger });

    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      name: 'baseline-demo',
      scripts: { test: 'jest' },
      dependencies: { react: '^18.0.0' },
      devDependencies: { jest: '^29.7.0' },
    }), 'utf8');
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'tests'), { recursive: true });

    await handlers.init();

    expect(fs.existsSync(path.join(tempDir, '.grabby', 'config.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.grabbyignore'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'contracts', 'SYSTEM-BASELINE.fc.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'contracts', 'PROJECT-BASELINE.fc.md'))).toBe(true);
    expect(fs.readFileSync(path.join(tempDir, 'contracts', 'README.md'), 'utf8')).toContain('## Baseline Contracts');
    expect(fs.readFileSync(path.join(tempDir, 'contracts', 'PROJECT-BASELINE.fc.md'), 'utf8')).toContain('React application');
    expect(logger.lines.join('\n')).toContain('.grabby/config.json');
    expect(logger.lines.join('\n')).toContain('Baseline assessment:');
  });

  it('preserves existing baseline contracts during init', async () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger });
    const contractsDir = path.join(tempDir, 'contracts');

    fs.mkdirSync(contractsDir, { recursive: true });
    fs.writeFileSync(path.join(contractsDir, 'SYSTEM-BASELINE.fc.md'), '# existing system baseline\n', 'utf8');
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      name: 'preserve-demo',
      scripts: { test: 'jest' },
    }), 'utf8');

    await handlers.init();

    expect(fs.readFileSync(path.join(contractsDir, 'SYSTEM-BASELINE.fc.md'), 'utf8')).toBe('# existing system baseline\n');
    expect(fs.existsSync(path.join(contractsDir, 'PROJECT-BASELINE.fc.md'))).toBe(true);
    expect(logger.lines.join('\n')).toContain('Preserved existing contracts/SYSTEM-BASELINE.fc.md');
  });

  it('archives a completed feature and removes active artifacts', () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger });
    const activeDir = path.join(tempDir, 'contracts', 'active');
    fs.mkdirSync(activeDir, { recursive: true });
    fs.writeFileSync(path.join(activeDir, 'ARCH-1.fc.md'), `# Feature Contract: Archived Feature
**ID:** ARCH-1 | **Status:** completed

## Ticket
- Who: Devs
- What: Close this feature
- Why: Keep history

## Objective
Archive this feature

## Scope
- Archive artifacts

## Non-Goals
- None

## Directories
**Allowed:** \`contracts/\`
**Restricted:** \`node_modules/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | \`contracts/active/ARCH-1.fc.md\` | contract |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery

## Security Considerations
- [ ] None

## Code Quality
- [ ] Covered

## Done When
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes

## Testing
- Unit

## Context Refs
- ARCH: auth-module@v1
- RULESET: imports@v1
- ENV: test-runner@v1
`, 'utf8');
    fs.writeFileSync(path.join(activeDir, 'ARCH-1.plan.yaml'), yaml.stringify({
      files: [{ path: 'contracts/active/ARCH-1.fc.md' }],
      execution_guard: 'passed',
    }), 'utf8');
    fs.writeFileSync(path.join(activeDir, 'ARCH-1.audit.md'), '# Audit\nValidation commands run: npm test (passed)\n', 'utf8');

    handlers.featureClose('ARCH-1');

    expect(fs.existsSync(path.join(activeDir, 'ARCH-1.fc.md'))).toBe(false);
    expect(fs.existsSync(path.join(activeDir, 'ARCH-1.plan.yaml'))).toBe(false);
    expect(fs.existsSync(path.join(activeDir, 'ARCH-1.audit.md'))).toBe(false);
    const historyFile = path.join(tempDir, '.grabby', 'history', 'history-001.yaml');
    expect(fs.existsSync(historyFile)).toBe(true);
    const historyContent = yaml.parse(fs.readFileSync(historyFile, 'utf8'));
    expect(historyContent.entries).toHaveLength(1);
    expect(historyContent.entries[0].id).toBe('ARCH-1');
    expect(logger.lines.join('\n')).toContain('Archived feature ARCH-1');
  });

  it('lists no active contracts immediately after feature close', () => {
    const closeLogger = createLogger();
    const listLogger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const closeHandlers = createCommandHandlers({ context, logger: closeLogger });
    const listHandlers = createCommandHandlers({ context, logger: listLogger });
    const activeDir = path.join(tempDir, 'contracts', 'active');
    fs.mkdirSync(activeDir, { recursive: true });
    fs.writeFileSync(path.join(activeDir, 'ARCH-LIST-1.fc.md'), `# Feature Contract: Archived
**ID:** ARCH-LIST-1 | **Status:** complete

## Objective
Archive it

## Scope
- Remove it from active contracts

## Directories
**Allowed:** \`contracts/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | \`contracts/active/ARCH-LIST-1.fc.md\` | contract |

## Done When
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes

## Security Considerations
- [ ] None

## Testing
- Unit
`, 'utf8');
    fs.writeFileSync(path.join(activeDir, 'ARCH-LIST-1.plan.yaml'), yaml.stringify({
      files: [{ path: 'contracts/active/ARCH-LIST-1.fc.md' }],
      execution_guard: 'passed',
    }), 'utf8');

    closeHandlers.featureClose('ARCH-LIST-1');
    listHandlers.list();

    expect(fs.existsSync(path.join(activeDir, 'ARCH-LIST-1.fc.md'))).toBe(false);
    expect(listLogger.lines.join('\n')).toContain('No contracts found.');
    expect(listLogger.lines.join('\n')).not.toContain('ARCH-LIST-1');
  });

  it('records explicit keep dispositions for hanging contracts', () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger });
    const activeDir = path.join(tempDir, 'contracts', 'active');
    fs.mkdirSync(activeDir, { recursive: true });
    fs.writeFileSync(path.join(activeDir, 'ARCH-KEEP-1.fc.md'), `# Feature Contract: Hanging Feature
**ID:** ARCH-KEEP-1 | **Status:** approved
`, 'utf8');

    const staleTime = new Date('2025-01-01T00:00:00.000Z');
    fs.utimesSync(path.join(activeDir, 'ARCH-KEEP-1.fc.md'), staleTime, staleTime);

    handlers.featureGc('keep', 'ARCH-KEEP-1', { reason: 'Waiting on external dependency', maxAgeDays: 30 });

    const index = JSON.parse(fs.readFileSync(path.join(tempDir, '.grabby', 'features.index.json'), 'utf8'));
    expect(index.features[0]).toMatchObject({
      id: 'ARCH-KEEP-1',
      gcDisposition: 'keep',
      gcReason: 'Waiting on external dependency',
    });
    expect(logger.lines.join('\n')).toContain('Recorded garbage-collector disposition for ARCH-KEEP-1');
  });

  it('fails garbage-collector checks when stale active contracts need disposition', () => {
    const logger = createLogger();
    const exits = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger, exit: (code) => exits.push(code) });
    const activeDir = path.join(tempDir, 'contracts', 'active');
    fs.mkdirSync(activeDir, { recursive: true });
    fs.writeFileSync(path.join(activeDir, 'ARCH-GC-1.fc.md'), `# Feature Contract: Hanging Feature
**ID:** ARCH-GC-1 | **Status:** draft
`, 'utf8');

    const staleTime = new Date('2025-01-01T00:00:00.000Z');
    fs.utimesSync(path.join(activeDir, 'ARCH-GC-1.fc.md'), staleTime, staleTime);

    handlers.featureGc('check', null, { maxAgeDays: 30 });

    expect(exits).toEqual([1]);
    expect(logger.lines.join('\n')).toContain('ARCH-GC-1');
    expect(logger.lines.join('\n')).toContain('No contract activity');
  });

  it('archives hanging completed contracts and removes sibling story artifacts', () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger });
    const activeDir = path.join(tempDir, 'contracts', 'active');
    fs.mkdirSync(activeDir, { recursive: true });
    fs.writeFileSync(path.join(activeDir, 'ARCH-GC-2.fc.md'), `# Feature Contract: Hanging Feature
**ID:** ARCH-GC-2 | **Status:** completed
`, 'utf8');
    fs.writeFileSync(path.join(activeDir, 'ARCH-GC-2.plan.yaml'), yaml.stringify({
      files: [{ path: 'contracts/active/ARCH-GC-2.fc.md' }],
    }), 'utf8');
    fs.writeFileSync(path.join(activeDir, 'ARCH-GC-2.brief.md'), '# brief\n', 'utf8');
    fs.writeFileSync(path.join(activeDir, 'ARCH-GC-2.backlog.yaml'), 'epics: []\n', 'utf8');
    fs.writeFileSync(path.join(activeDir, 'ARCH-GC-2.prompt.md'), '# prompt\n', 'utf8');
    fs.writeFileSync(path.join(activeDir, 'ARCH-GC-2.session.json'), JSON.stringify({ version: 1 }), 'utf8');

    handlers.featureGc('archive', 'ARCH-GC-2');

    expect(fs.existsSync(path.join(activeDir, 'ARCH-GC-2.fc.md'))).toBe(false);
    expect(fs.existsSync(path.join(activeDir, 'ARCH-GC-2.brief.md'))).toBe(false);
    expect(fs.existsSync(path.join(activeDir, 'ARCH-GC-2.backlog.yaml'))).toBe(false);
    expect(fs.existsSync(path.join(activeDir, 'ARCH-GC-2.prompt.md'))).toBe(false);
    expect(fs.existsSync(path.join(activeDir, 'ARCH-GC-2.session.json'))).toBe(false);
    expect(logger.lines.join('\n')).toContain('Archived hanging feature ARCH-GC-2');
  });

  it('generates an agile backlog from a valid contract', () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger });

    writeValidContract(tempDir);
    handlers.backlog('valid-feature.fc.md');

    const backlog = yaml.parse(fs.readFileSync(path.join(tempDir, 'contracts', 'valid-feature.backlog.yaml'), 'utf8'));
    expect(backlog.epics).toHaveLength(1);
    expect(backlog.epics[0].tasks.length).toBeGreaterThan(0);
    expect(backlog.epics[0].tasks[0].subtasks.length).toBeGreaterThan(0);
    expect(logger.lines.join('\n')).toContain('AGILE BACKLOG');
  });

  it('renders a provider-agnostic prompt bundle', () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger, outputMode: 'file' });

    writeValidContract(tempDir);
    handlers.backlog('valid-feature.fc.md');
    handlers.plan('valid-feature.fc.md');
    handlers.promptBundle('valid-feature.fc.md');

    const promptPath = path.join(tempDir, 'contracts', 'valid-feature.prompt.md');
    const prompt = fs.readFileSync(promptPath, 'utf8');
    expect(prompt).toContain('Grabby Prompt Bundle: valid-feature.fc.md');
    expect(prompt).toContain('Provider profile: generic');
    expect(prompt).toContain('## Contract');
    expect(prompt).toContain('## Backlog');
  });

  it('inspects a valid session artifact and reports schema status', () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger });
    fs.mkdirSync(context.contractsDir, { recursive: true });
    fs.writeFileSync(path.join(context.contractsDir, 'valid-feature.session.json'), JSON.stringify({
      version: 1,
      mode: 'task',
      request: 'valid feature',
      persona: {
        key: 'architect',
        name: 'Archie',
        title: 'Contract Architect',
        handoffCommand: 'grabby agent architect CC',
      },
      artifacts: {
        contractFile: 'contracts/valid-feature.fc.md',
        briefFile: 'contracts/valid-feature.brief.md',
        planFile: null,
        backlogFile: null,
        executionFile: null,
        auditFile: null,
      },
      generatedAt: new Date().toISOString(),
    }, null, 2));

    handlers.session('contracts/valid-feature.session.json');

    expect(logger.lines.join('\n')).toContain('Schema: v1 valid');
    expect(logger.lines.join('\n')).toContain('contractFile');
  });

  it('regenerates a session artifact from an existing contract', () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger });
    writeValidContract(tempDir);
    fs.writeFileSync(path.join(tempDir, 'contracts', 'valid-feature.brief.md'), '# brief', 'utf8');

    handlers.session('valid-feature.fc.md', { regenerate: true, format: 'json' });

    const sessionPath = path.join(tempDir, 'contracts', 'valid-feature.session.json');
    expect(fs.existsSync(sessionPath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(sessionPath, 'utf8')).mode).toBe('task');
    expect(logger.lines.join('\n')).toContain('Session regenerated');
  });

  it('supports CI-style session checks', () => {
    const logger = createLogger();
    const exits = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({
      context,
      logger,
      exit: (code) => exits.push(code),
    });
    fs.mkdirSync(context.contractsDir, { recursive: true });
    fs.writeFileSync(path.join(context.contractsDir, 'valid-feature.session.json'), JSON.stringify({
      version: 1,
      mode: 'task',
      request: 'valid feature',
      persona: {
        key: 'architect',
        name: 'Archie',
        title: 'Contract Architect',
        handoffCommand: 'grabby agent architect CC',
      },
      artifacts: {
        contractFile: 'contracts/valid-feature.fc.md',
        briefFile: 'contracts/valid-feature.brief.md',
      },
      generatedAt: new Date().toISOString(),
    }, null, 2));

    handlers.session('contracts/valid-feature.session.json', { check: true });
    expect(logger.lines.join('\n')).toContain('OK contracts/valid-feature.session.json');
    expect(exits).toEqual([]);

    logger.lines.length = 0;
    fs.writeFileSync(path.join(context.contractsDir, 'invalid.session.json'), JSON.stringify({
      version: 1,
      mode: 'broken',
      request: '',
      persona: {},
      artifacts: {},
      generatedAt: 'bad-date',
    }, null, 2));

    handlers.session('contracts/invalid.session.json', { check: true });
    expect(logger.lines.join('\n')).toContain('INVALID contracts/invalid.session.json');
    expect(exits).toEqual([1]);
  });

  it('supports bulk CI session checks', () => {
    const logger = createLogger();
    const exits = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({
      context,
      logger,
      exit: (code) => exits.push(code),
    });
    fs.mkdirSync(context.contractsDir, { recursive: true });
    fs.writeFileSync(path.join(context.contractsDir, 'a.session.json'), JSON.stringify({
      version: 1,
      mode: 'task',
      request: 'a',
      persona: {
        key: 'architect',
        name: 'Archie',
        title: 'Contract Architect',
        handoffCommand: 'grabby agent architect CC',
      },
      artifacts: {
        contractFile: 'contracts/a.fc.md',
        briefFile: 'contracts/a.brief.md',
      },
      generatedAt: new Date().toISOString(),
    }, null, 2));
    fs.writeFileSync(path.join(context.contractsDir, 'b.session.json'), JSON.stringify({
      version: 1,
      mode: 'broken',
      request: '',
      persona: {},
      artifacts: {},
      generatedAt: 'bad-date',
    }, null, 2));

    handlers.session(null, { checkAll: true });

    expect(logger.lines.join('\n')).toContain('OK contracts/a.session.json');
    expect(logger.lines.join('\n')).toContain('INVALID contracts/b.session.json');
    expect(exits).toEqual([1]);
  });

  it('warns about deprecated standalone ticket markdown during validation', () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger });

    writeValidContract(tempDir);
    fs.writeFileSync(path.join(tempDir, 'TT-123.md'), '# legacy ticket', 'utf8');

    handlers.validate('valid-feature.fc.md');

    expect(logger.lines.join('\n')).toContain('Standalone ticket markdown is deprecated');
    expect(logger.lines.join('\n')).toContain('TT-123.md');
  });

  it('cleans local-only artifacts when requested', () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger });
    const localContractsDir = path.join(tempDir, '.grabby', 'contracts');
    const featureLogPath = path.join(tempDir, '.grabby', 'feature-log.json');

    fs.mkdirSync(localContractsDir, { recursive: true });
    fs.writeFileSync(path.join(localContractsDir, 'temp.fc.md'), '# temp', 'utf8');
    fs.writeFileSync(featureLogPath, JSON.stringify({ entries: [] }), 'utf8');

    handlers.cleanLocalContracts();

    expect(fs.existsSync(localContractsDir)).toBe(false);
    expect(fs.existsSync(featureLogPath)).toBe(false);
    expect(logger.lines.join('\n')).toContain('Removed local-only Grabby artifacts');
  });

  it('prints a no-op message when no local-only artifacts exist', () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger });

    handlers.cleanLocalContracts();

    expect(logger.lines.join('\n')).toContain('No local-only Grabby artifacts found.');
  });

  it('builds a PR template from a contract', () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger });

    writeValidContract(tempDir);
    handlers.prTemplate('valid-feature.fc.md');

    const output = logger.lines.join('\n');
    expect(output).toContain('Title: FC-123: Valid Feature');
    expect(output).toContain('- Plan: contracts/FC-123.plan.yaml');
    expect(output).toContain('## Done When');
  });

  it('creates a branch and updates the contract when git is available', () => {
    const logger = createLogger();
    const commands = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({
      context,
      logger,
      execSyncImpl: (command) => commands.push(command),
    });

    const contractPath = writeValidContract(tempDir);
    handlers.start('valid-feature.fc.md', { type: 'fix' });

    expect(commands).toEqual([
      'git rev-parse --is-inside-work-tree',
      expect.stringMatching(/^git checkout -b fix\/FC-123-/),
    ]);
    expect(fs.readFileSync(contractPath, 'utf8')).toContain('**Branch:** fix/FC-123-valid-feature');
    expect(logger.lines.join('\n')).toContain('Created branch fix/FC-123-valid-feature');
  });

  it('reports manual branch creation when git is unavailable', () => {
    const logger = createLogger();
    const exits = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({
      context,
      logger,
      exit: (code) => exits.push(code),
      execSyncImpl: () => {
        throw new Error('git missing');
      },
    });

    writeValidContract(tempDir);
    handlers.start('valid-feature.fc.md');

    expect(exits).toEqual([1]);
    expect(logger.lines.join('\n')).toContain('Git not available. Create the branch manually.');
    expect(logger.lines.join('\n')).toContain('Branch: feat/FC-123-valid-feature');
  });

  it('passes policy checks when only contract artifacts changed', () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger });
    process.env.GRABBY_CHANGED_FILES = 'contracts/FC-123.fc.md,contracts/FC-123.plan.yaml';

    handlers.policyCheck();

    expect(logger.lines.join('\n')).toContain('Policy check passed');
    delete process.env.GRABBY_CHANGED_FILES;
  });

  it('fails policy checks when git diff cannot be inspected', () => {
    const logger = createLogger();
    const exits = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({
      context,
      logger,
      exit: (code) => exits.push(code),
      execSyncImpl: () => {
        throw new Error('git unavailable');
      },
    });

    handlers.policyCheck();

    expect(exits).toEqual([1]);
    expect(logger.lines.join('\n')).toContain('Unable to inspect git diff.');
  });

  it('fails policy checks when triggered changes have no governing contract', () => {
    const logger = createLogger();
    const exits = [];
    fs.mkdirSync(path.join(tempDir, '.grabby'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, '.grabby', 'config.json'), JSON.stringify({
      contractRequired: {
        fileCountThreshold: 1,
        restrictedPaths: ['lib/'],
      },
    }), 'utf8');
    const context = { ...createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT }), trackingMode: 'tracked' };
    const handlers = createCommandHandlers({ context, logger, exit: (code) => exits.push(code) });
    process.env.GRABBY_CHANGED_FILES = 'lib/commands.cjs';

    handlers.policyCheck();

    expect(exits).toEqual([1]);
    expect(logger.lines.join('\n')).toContain('Contract required by policy but none found.');
    delete process.env.GRABBY_CHANGED_FILES;
  });

  it('fails policy checks when a triggered contract is missing its plan', () => {
    const logger = createLogger();
    const exits = [];
    fs.mkdirSync(path.join(tempDir, '.grabby'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, '.grabby', 'config.json'), JSON.stringify({
      contractRequired: {
        fileCountThreshold: 1,
        restrictedPaths: ['lib/'],
      },
    }), 'utf8');
    const context = { ...createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT }), trackingMode: 'tracked' };
    const handlers = createCommandHandlers({ context, logger, exit: (code) => exits.push(code) });
    process.env.GRABBY_CHANGED_FILES = 'lib/commands.cjs';

    writeValidContract(tempDir);
    handlers.policyCheck();

    expect(exits).toEqual([1]);
    expect(logger.lines.join('\n')).toContain('Plan required by policy');
    delete process.env.GRABBY_CHANGED_FILES;
  });

  it('passes policy checks when changed files stay within plan scope', () => {
    const logger = createLogger();
    const exits = [];
    fs.mkdirSync(path.join(tempDir, '.grabby'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, '.grabby', 'config.json'), JSON.stringify({
      contractRequired: {
        fileCountThreshold: 1,
        restrictedPaths: ['lib/'],
      },
    }), 'utf8');
    const context = { ...createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT }), trackingMode: 'tracked' };
    const handlers = createCommandHandlers({ context, logger, exit: (code) => exits.push(code) });
    process.env.GRABBY_CHANGED_FILES = 'src/feature.ts';

    writeValidContract(tempDir);
    fs.writeFileSync(path.join(tempDir, 'contracts', 'FC-123.plan.yaml'), yaml.stringify({
      status: 'approved',
      files: [{ action: 'create', path: 'src/feature.ts' }],
    }), 'utf8');

    handlers.policyCheck();

    expect(exits).toEqual([]);
    expect(logger.lines.join('\n')).toContain('Policy check passed');
    delete process.env.GRABBY_CHANGED_FILES;
  });

  it('fails policy checks when changed files drift beyond plan scope', () => {
    const logger = createLogger();
    const exits = [];
    fs.mkdirSync(path.join(tempDir, '.grabby'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, '.grabby', 'config.json'), JSON.stringify({
      contractRequired: {
        fileCountThreshold: 1,
        restrictedPaths: ['lib/'],
      },
    }), 'utf8');
    const context = { ...createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT }), trackingMode: 'tracked' };
    const handlers = createCommandHandlers({ context, logger, exit: (code) => exits.push(code) });
    process.env.GRABBY_CHANGED_FILES = 'lib/commands.cjs';

    writeValidContract(tempDir);
    fs.writeFileSync(path.join(tempDir, 'contracts', 'FC-123.plan.yaml'), yaml.stringify({
      status: 'approved',
      files: [{ action: 'create', path: 'src/feature.ts' }],
    }), 'utf8');

    handlers.policyCheck();

    expect(exits).toEqual([1]);
    expect(logger.lines.join('\n')).toContain('Scope drift detected by policy.');
    delete process.env.GRABBY_CHANGED_FILES;
  });

  it('inspects YAML session artifacts and reports ignored files', () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger });
    fs.mkdirSync(context.contractsDir, { recursive: true });
    fs.writeFileSync(path.join(tempDir, '.grabbyignore'), 'contracts/ignored.brief.md\n', 'utf8');
    fs.writeFileSync(path.join(context.contractsDir, 'ignored.brief.md'), '# ignored', 'utf8');
    fs.writeFileSync(path.join(context.contractsDir, 'valid-feature.session.yaml'), yaml.stringify({
      version: 1,
      mode: 'task',
      request: 'valid feature',
      persona: {
        key: 'architect',
        name: 'Archie',
        title: 'Contract Architect',
        handoffCommand: 'grabby agent architect CC',
      },
      artifacts: {
        contractFile: 'contracts/valid-feature.fc.md',
        briefFile: 'contracts/ignored.brief.md',
      },
      generatedAt: new Date().toISOString(),
    }));

    handlers.session('contracts/valid-feature.session.yaml');

    const output = logger.lines.join('\n');
    expect(output).toContain('contracts/ignored.brief.md (ignored)');
    expect(output).toContain('Schema: v1 valid');
  });

  it('fails session regeneration when the brief is missing', () => {
    const logger = createLogger();
    const exits = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger, exit: (code) => exits.push(code) });

    writeValidContract(tempDir);
    handlers.session('valid-feature.fc.md', { regenerate: true });

    expect(exits).toEqual([1]);
    expect(logger.lines.join('\n')).toContain('Brief not found for contract: valid-feature.fc.md');
  });

  it('installs git hooks when a repository is present', () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger });
    fs.mkdirSync(path.join(tempDir, '.git', 'hooks'), { recursive: true });

    handlers.initHooks();

    expect(fs.existsSync(path.join(tempDir, '.git', 'hooks', 'pre-commit'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.git', 'hooks', 'commit-msg'))).toBe(true);
    expect(logger.lines.join('\n')).toContain('Git Hooks Installed');
  });

  it('fails context lint when the context index is invalid', () => {
    const logger = createLogger();
    const exits = [];
    const docsDir = path.join(tempDir, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });
    const context = { ...createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT }), docsDir };
    const handlers = createCommandHandlers({ context, logger, exit: (code) => exits.push(code) });
    handlers.contextLint();
    expect(exits).toEqual([1]);
    expect(logger.lines.join('\n')).toContain('context-index.yaml');
  });

  it('fails planning for unapproved architecture change contracts', () => {
    const logger = createLogger();
    const exits = [];
    const docsDir = createContextDocs(tempDir);
    const context = { ...createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT }), docsDir };
    const handlers = createCommandHandlers({ context, logger, exit: (code) => exits.push(code) });

    fs.mkdirSync(context.contractsDir, { recursive: true });
    fs.writeFileSync(path.join(context.contractsDir, 'ARCH-100.fc.md'), `# FC: Arch Change
**ID:** ARCH-100 | **Status:** draft
CONTRACT_TYPE: ARCH_CHANGE_CONTRACT
ARCH_VERSION: v1
RULESET_VERSION: v1
ENV_VERSION: v1

## Objective
Change architecture safely.

## Scope
- update auth boundary

## Directories
**Allowed:** \`src/\`
**Restricted:** \`node_modules/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | \`src/auth.ts\` | auth |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery

## Security Considerations
- [ ] reviewed

## Code Quality
- [ ] lint passes

## Done When
- [ ] Tests pass (80%+ coverage)
- [ ] Lint passes

## Testing
- Unit

## Context Refs
- ARCH: auth-module@v1
- RULESET: imports@v1
- ENV: test-runner@v1
`, 'utf8');

    handlers.plan('ARCH-100.fc.md');

    expect(exits).toEqual([1]);
    expect(logger.lines.join('\n')).toContain('ARCH_CHANGE_CONTRACT requires ARCH_APPROVED: true before execution');
  });

  it('fails guard when the plan is missing or not approved', () => {
    const logger = createLogger();
    const exits = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger, exit: (code) => exits.push(code) });

    writeValidContract(tempDir, 'guarded.fc.md', 'approved');
    handlers.guard('guarded.fc.md');
    expect(exits).toEqual([1]);
    expect(logger.lines.join('\n')).toContain('No plan found.');

    exits.length = 0;
    logger.lines.length = 0;
    fs.writeFileSync(path.join(tempDir, 'contracts', 'FC-123.plan.yaml'), yaml.stringify({ status: 'draft', files: [] }), 'utf8');

    handlers.guard('guarded.fc.md');

    expect(exits).toEqual([1]);
    expect(logger.lines.join('\n')).toContain('Plan is not approved');
  });

  it('passes guard when the approved plan stays in scope', () => {
    const logger = createLogger();
    const exits = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger, exit: (code) => exits.push(code) });

    writeValidContract(tempDir, 'guard-pass.fc.md', 'approved');
    fs.writeFileSync(path.join(tempDir, 'contracts', 'FC-123.plan.yaml'), yaml.stringify({
      status: 'approved',
      files: [{ action: 'create', path: 'src/feature.ts' }],
    }), 'utf8');

    handlers.guard('guard-pass.fc.md');

    expect(exits).toEqual([]);
    expect(logger.lines.join('\n')).toContain('Guard passed');
  });

  it('reports empty-session failures during bulk session checks', () => {
    const logger = createLogger();
    const exits = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger, exit: (code) => exits.push(code) });

    handlers.session(null, { checkAll: true });

    expect(exits).toEqual([1]);
    expect(logger.lines.join('\n')).toContain('no session artifacts found');
  });

  it('resolves plan and execute context bundles for a contract', () => {
    const logger = createLogger();
    const docsDir = createContextDocs(tempDir);
    const context = { ...createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT }), docsDir };
    const handlers = createCommandHandlers({ context, logger });

    fs.mkdirSync(context.contractsDir, { recursive: true });
    fs.writeFileSync(path.join(context.contractsDir, 'CTX-123.fc.md'), `# FC: Resolve Context
**ID:** CTX-123 | **Status:** draft
ARCH_VERSION: v1
RULESET_VERSION: v1
ENV_VERSION: v1

## Objective
Resolve context refs.

## Scope
- bounded

## Directories
**Allowed:** \`src/\`
**Restricted:** \`node_modules/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | \`src/context.ts\` | context |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery

## Security Considerations
- [ ] reviewed

## Code Quality
- [ ] lint passes

## Done When
- [ ] Tests pass (80%+ coverage)

## Testing
- Unit

## Context Refs
- ARCH: auth-module@v1
- RULESET: imports@v1
- ENV: test-runner@v1
`, 'utf8');

    handlers.resolve('CTX-123.fc.md');

    const output = logger.lines.join('\n');
    expect(output).toContain('plan:');
    expect(output).toContain('execute:');
    expect(output).toContain('auth-module@v1');
  });

  it('upgrades contract version pins and summarizes metrics', () => {
    const logger = createLogger();
    const docsDir = createContextDocs(tempDir);
    const context = { ...createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT }), docsDir };
    const handlers = createCommandHandlers({ context, logger });

    fs.mkdirSync(context.contractsDir, { recursive: true });
    fs.writeFileSync(path.join(context.contractsDir, 'VERS-1.fc.md'), `# FC: Versions
**ID:** VERS-1 | **Status:** draft
ARCH_VERSION: v0
RULESET_VERSION: v0
ENV_VERSION: v0
`, 'utf8');

    handlers.upgradeContract('VERS-1.fc.md');
    const upgraded = fs.readFileSync(path.join(context.contractsDir, 'VERS-1.fc.md'), 'utf8');
    expect(upgraded).toContain('ARCH_VERSION: v1');
    expect(upgraded).toContain('RULESET_VERSION: v1');
    expect(upgraded).toContain('ENV_VERSION: v1');

    fs.mkdirSync(path.join(context.grabbyDir, 'metrics'), { recursive: true });
    fs.writeFileSync(path.join(context.grabbyDir, 'metrics', 'a.metrics.json'), JSON.stringify({
      feature: 'a',
      token_usage: { total: 50 },
      files_modified: 2,
      lines_changed: 10,
      rule_violations_detected: 1,
      plan_execution_drift: { drift_count: 0 },
    }), 'utf8');

    logger.lines.length = 0;
    handlers.metricsSummary();
    expect(logger.lines.join('\n')).toContain('total_tokens: 50');
    expect(logger.lines.join('\n')).toContain('features: 1');
  });

  it('fails initHooks outside a git repository', () => {
    const logger = createLogger();
    const exits = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger, exit: (code) => exits.push(code) });

    handlers.initHooks();

    expect(exits).toEqual([1]);
    expect(logger.lines.join('\n')).toContain('Not a git repository');
  });

  it('dispatches watch mode through the watcher module', () => {
    jest.resetModules();
    jest.doMock('../lib/watcher.cjs', () => ({
      runWatchMode: jest.fn(() => 'watch-started'),
    }));

    const { createCommandHandlers: createHandlersFresh, createProjectContext: createContextFresh } = require('../lib/commands.cjs');
    const watcher = require('../lib/watcher.cjs');
    const logger = createLogger();
    const context = createContextFresh({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createHandlersFresh({ context, logger });

    const result = handlers.watch({ debounceMs: 5 });

    expect(result).toBe('watch-started');
    expect(watcher.runWatchMode).toHaveBeenCalledWith(context.contractsDir, expect.objectContaining({
      logger,
      debounceMs: 5,
    }));
    jest.dontMock('../lib/watcher.cjs');
  });
});

