const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('yaml');
const {
  createProjectContext,
  createCommandHandlers,
  inferCreateRequest,
  getNpmExecutable,
  getNpmRunCommand,
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

  it('uses platform-aware npm executable helpers', () => {
    expect(getNpmExecutable('win32')).toBe('npm.cmd');
    expect(getNpmExecutable('darwin')).toBe('npm');
    expect(getNpmExecutable('linux')).toBe('npm');
    expect(getNpmRunCommand('lint', 'win32')).toBe('npm.cmd run lint');
    expect(getNpmRunCommand('test', 'linux')).toBe('npm run test');
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

  it('warns and does not auto-update scaffolding when governance.lock is older than CLI version', () => {
    const logger = createLogger();
    const execCommands = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({
      context,
      logger,
      execSyncImpl: (command) => {
        execCommands.push(command);
        return '';
      },
    });

    writeValidContract(tempDir, 'version-sync.fc.md', 'draft');
    fs.mkdirSync(context.grabbyDir, { recursive: true });
    fs.writeFileSync(path.join(context.grabbyDir, 'governance.lock'), yaml.stringify({
      governance: {
        version: '1.0.0',
        profile: 'default',
        rules_version: 'v1',
      },
    }), 'utf8');

    handlers.validate('version-sync.fc.md');

    expect(execCommands.some((cmd) => cmd.includes('bin') && cmd.includes('index.cjs') && cmd.includes('init'))).toBe(false);
    expect(logger.lines.join('\n')).toContain('Repo scaffolding is older than this CLI');
    expect(logger.lines.join('\n')).toContain('Re-run this command with --yes');
  });

  it('updates scaffolding when governance.lock is older and --yes is provided', () => {
    const logger = createLogger();
    const execCommands = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({
      context,
      logger,
      execSyncImpl: (command) => {
        execCommands.push(command);
        return '';
      },
    });

    writeValidContract(tempDir, 'version-sync-yes.fc.md', 'draft');
    fs.mkdirSync(context.grabbyDir, { recursive: true });
    fs.writeFileSync(path.join(context.grabbyDir, 'governance.lock'), yaml.stringify({
      governance: {
        version: '1.0.0',
        profile: 'default',
        rules_version: 'v1',
      },
    }), 'utf8');

    const originalArgv = process.argv;
    process.argv = [...originalArgv, '--yes'];
    try {
      handlers.validate('version-sync-yes.fc.md');
    } finally {
      process.argv = originalArgv;
    }

    expect(execCommands.some((cmd) => cmd.includes('bin') && cmd.includes('index.cjs') && cmd.includes('init'))).toBe(true);
    expect(logger.lines.join('\n')).toContain('Repo scaffolding updated from CLI');
  });

  it('does not re-warn about outdated scaffolding until 10 more contracts exist', () => {
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    fs.mkdirSync(context.grabbyDir, { recursive: true });
    fs.writeFileSync(path.join(context.grabbyDir, 'governance.lock'), yaml.stringify({
      governance: {
        version: '1.0.0',
        profile: 'default',
        rules_version: 'v1',
      },
    }), 'utf8');

    const firstContractPath = writeValidContract(tempDir, 'WARN-1.fc.md', 'draft');
    fs.writeFileSync(firstContractPath, fs.readFileSync(firstContractPath, 'utf8').replace('**ID:** FC-123', '**ID:** WARN-1'), 'utf8');

    const loggerFirst = createLogger();
    const exitsFirst = [];
    const handlersFirst = createCommandHandlers({
      context,
      logger: loggerFirst,
      exit: (code) => exitsFirst.push(code),
      execSyncImpl: () => '',
    });
    handlersFirst.validate('WARN-1.fc.md');
    expect(exitsFirst).toEqual([]);
    expect(loggerFirst.lines.join('\n')).toContain('Repo scaffolding is older than this CLI');

    const secondContractPath = writeValidContract(tempDir, 'WARN-2.fc.md', 'draft');
    fs.writeFileSync(secondContractPath, fs.readFileSync(secondContractPath, 'utf8').replace('**ID:** FC-123', '**ID:** WARN-2'), 'utf8');

    const loggerSecond = createLogger();
    const exitsSecond = [];
    const handlersSecond = createCommandHandlers({
      context,
      logger: loggerSecond,
      exit: (code) => exitsSecond.push(code),
      execSyncImpl: () => '',
    });
    handlersSecond.validate('WARN-2.fc.md');
    expect(exitsSecond).toEqual([]);
    expect(loggerSecond.lines.join('\n')).not.toContain('Repo scaffolding is older than this CLI');
  });

  it('validates baseline contracts without requiring work-item IDs', () => {
    const logger = createLogger();
    const exits = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({
      context,
      logger,
      exit: (code) => exits.push(code),
    });

    const contractsDir = path.join(tempDir, 'contracts');
    fs.mkdirSync(contractsDir, { recursive: true });
    fs.writeFileSync(path.join(contractsDir, 'PROJECT-BASELINE.fc.md'), `# FC: Project Baseline
**Status:** draft

## Objective
Capture baseline context.

## Scope
- Record stack and structure

## Non-Goals
- Implement feature work

## Directories
**Allowed:** \`contracts/\`
**Restricted:** \`node_modules/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | \`contracts/PROJECT-BASELINE.fc.md\` | baseline |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery

## Security Considerations
- [ ] None

## Code Quality
- [ ] Manual review completed

## Done When
- [ ] Baseline is reviewed
- [ ] Lint passes

## Testing
- Manual
`, 'utf8');

    handlers.validate('PROJECT-BASELINE.fc.md');

    expect(exits).toHaveLength(0);
    expect(logger.lines.join('\n')).toContain('Baseline contract detected: skipping work-item ID filename enforcement.');
    expect(logger.lines.join('\n')).toContain('Validation passed');
  });

  it('plans baseline contracts without requiring work-item IDs', () => {
    const logger = createLogger();
    const exits = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({
      context,
      logger,
      exit: (code) => exits.push(code),
    });

    const contractsDir = path.join(tempDir, 'contracts');
    fs.mkdirSync(contractsDir, { recursive: true });
    fs.writeFileSync(path.join(contractsDir, 'PROJECT-BASELINE.fc.md'), `# FC: Project Baseline
**Status:** draft

## Objective
Capture baseline context.

## Scope
- Record stack and structure

## Non-Goals
- Implement feature work

## Directories
**Allowed:** \`contracts/\`
**Restricted:** \`node_modules/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| create | \`contracts/PROJECT-BASELINE.fc.md\` | baseline |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery

## Security Considerations
- [ ] None

## Code Quality
- [ ] Manual review completed

## Done When
- [ ] Baseline is reviewed
- [ ] Lint passes

## Testing
- Manual
`, 'utf8');

    handlers.plan('PROJECT-BASELINE.fc.md');

    expect(exits).toHaveLength(0);
    expect(fs.existsSync(path.join(contractsDir, 'PROJECT-BASELINE.plan.yaml'))).toBe(true);
    expect(logger.lines.join('\n')).toContain('Baseline contract detected: using baseline filename as canonical ID.');
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

  it('blocks execute on default/protected branch even when full preflight is disabled', () => {
    const logger = createLogger();
    const exits = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({
      context,
      logger,
      exit: (code) => exits.push(code),
      execSyncImpl: (command) => {
        const responses = {
          'git rev-parse --is-inside-work-tree': 'true',
          'git rev-parse --abbrev-ref HEAD': 'main',
          'git rev-parse --abbrev-ref --symbolic-full-name @{u}': 'origin/main',
          'git remote get-url origin': 'git@github.com:team/repo.git',
          'git status --porcelain=v1 --branch': '## main...origin/main',
          'git rev-list --left-right --count origin/main...HEAD': '0 0',
          'git stash list': '',
        };
        if (Object.prototype.hasOwnProperty.call(responses, command)) {
          return responses[command];
        }
        throw new Error(`Unexpected command: ${command}`);
      },
    });

    writeValidContract(tempDir, 'valid-feature.fc.md', 'approved');
    fs.writeFileSync(path.join(tempDir, 'contracts', 'FC-123.plan.yaml'), yaml.stringify({
      status: 'approved',
      files: [{ action: 'modify', path: 'src/feature.ts' }],
    }), 'utf8');

    handlers.execute('valid-feature.fc.md');

    expect(exits).toEqual([1]);
    expect(logger.lines.join('\n')).toContain('Git branch policy failure:');
    expect(logger.lines.join('\n')).toContain('Direct commits/check-ins to protected/default branch "main" are blocked by GitHub policy');
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
    expect(logger.lines.join('\n')).toContain('Verification Checklist:');
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
    expect(logger.lines.join('\n')).toContain('Audit Checklist:');
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

  it('pauses audit at the interactive verification breakpoint when no scripted decision is provided', () => {
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
    fs.writeFileSync(path.join(tempDir, 'grabby.config.json'), JSON.stringify({
      interactive: { enabled: true },
      contracts: { directory: 'contracts', trackingMode: 'tracked' },
    }, null, 2));
    fs.writeFileSync(path.join(tempDir, 'contracts', 'FC-123.plan.yaml'), yaml.stringify({
      status: 'executing',
      files: [],
    }), 'utf8');

    handlers.audit('valid-feature.fc.md');

    expect(commands).toEqual([]);
    expect(fs.existsSync(path.join(tempDir, 'contracts', 'FC-123.audit.md'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, '.grabby', 'session', 'FC-123.json'))).toBe(true);
    expect(logger.lines.join('\n')).toContain('INTERACTIVE BREAKPOINT');
    expect(logger.lines.join('\n')).toContain('Audit paused before test execution.');
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
    expect(fs.existsSync(path.join(tempDir, '.grabby', 'project-context.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.grabbyignore'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'contracts', 'SYSTEM-BASELINE.fc.md'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'contracts', 'PROJECT-BASELINE.fc.md'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'contracts', 'SETUP-BASELINE.fc.md'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'contracts', 'README.md'))).toBe(false);
    const contractsEntries = fs.readdirSync(path.join(tempDir, 'contracts'));
    expect(contractsEntries).toEqual([]);
    const historyFile = path.join(tempDir, '.grabby', 'history', 'history-001.yaml');
    const historyContent = yaml.parse(fs.readFileSync(historyFile, 'utf8'));
    expect(historyContent.entries.map((entry) => entry.id)).toEqual(expect.arrayContaining([
      'SYSTEM-BASELINE',
      'PROJECT-BASELINE',
      'SETUP-BASELINE',
    ]));
    expect(logger.lines.join('\n')).toContain('.grabby/config.json');
    expect(logger.lines.join('\n')).toContain('.grabby/project-context.json');
    expect(logger.lines.join('\n')).toContain('Baseline assessment:');
    expect(logger.lines.join('\n')).toContain('Context summary:');
    expect(logger.lines.join('\n')).toContain('Setup summary');
    expect(logger.lines.join('\n')).toContain('Mode: brownfield');
    expect(logger.lines.join('\n')).toContain('Contracts directory reset for fresh feature work');
    expect(logger.lines.join('\n')).toContain('Contracts directory starts empty by design after init bootstrap archival.');
  });

  it('persists detected plugin suggestions during init', async () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger });

    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      name: 'platform-demo',
      dependencies: { 'keycloak-js': '^25.0.0' },
    }), 'utf8');
    fs.writeFileSync(path.join(tempDir, 'Chart.yaml'), 'apiVersion: v2\nname: platform\n', 'utf8');
    fs.mkdirSync(path.join(tempDir, 'helm'), { recursive: true });

    await handlers.init();

    const repoConfig = JSON.parse(fs.readFileSync(path.join(tempDir, 'grabby.config.json'), 'utf8'));
    expect(repoConfig.plugins.items.helm).toEqual(expect.objectContaining({
      detected: true,
      source: 'builtin',
    }));
    expect(repoConfig.plugins.items.keycloak).toEqual(expect.objectContaining({
      detected: true,
      source: 'builtin',
    }));
    expect(logger.lines.join('\n')).toContain('Suggested plugins: helm, keycloak');
    const summaryLines = logger.lines.filter((line) => line.startsWith('  Created:') || line.startsWith('  Updated:'));
    const repoConfigMentions = (summaryLines.join('\n').match(/grabby\.config\.json/g) || []).length;
    expect(repoConfigMentions).toBe(1);
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
    expect(fs.existsSync(path.join(contractsDir, 'SETUP-BASELINE.fc.md'))).toBe(true);
    expect(logger.lines.join('\n')).toContain('Preserved existing contracts/SYSTEM-BASELINE.fc.md');
    expect(logger.lines.join('\n')).toContain('Preserved:');
  });

  it('preserves existing brownfield docs and local overrides during init', async () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger });

    fs.mkdirSync(path.join(tempDir, 'docs'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.clinerules'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'docs', 'ARCHITECTURE_INDEX.md'), '# existing architecture\n', 'utf8');
    fs.writeFileSync(path.join(tempDir, '.clinerules', '90-local-overrides.md'), '# local overrides\n', 'utf8');
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      name: 'brownfield-demo',
      scripts: { test: 'jest' },
    }), 'utf8');

    await handlers.init();

    expect(fs.readFileSync(path.join(tempDir, 'docs', 'ARCHITECTURE_INDEX.md'), 'utf8')).toBe('# existing architecture\n');
    expect(fs.readFileSync(path.join(tempDir, '.clinerules', '90-local-overrides.md'), 'utf8')).toBe('# local overrides\n');
    expect(logger.lines.join('\n')).toContain('Preserved:');
    expect(logger.lines.join('\n')).toContain('docs/ARCHITECTURE_INDEX.md');
    expect(logger.lines.join('\n')).toContain('.clinerules/90-local-overrides.md');
  });

  it('persists repo interactive defaults when init runs with interactive mode enabled', async () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger });

    await handlers.init({ interactive: true });

    const repoConfig = JSON.parse(fs.readFileSync(path.join(tempDir, 'grabby.config.json'), 'utf8'));
    const runtimeConfig = JSON.parse(fs.readFileSync(path.join(tempDir, '.grabby', 'config.json'), 'utf8'));
    expect(repoConfig.interactive.enabled).toBe(true);
    expect(runtimeConfig.interactive.enabled).toBe(true);
    expect(logger.lines.join('\n')).toContain('Enabled interactive mode by default');
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

  it('runs garbage collection after close and archives remaining completed stories', () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger });
    const activeDir = path.join(tempDir, 'contracts', 'active');
    fs.mkdirSync(activeDir, { recursive: true });

    fs.writeFileSync(path.join(activeDir, 'ARCH-MAIN-1.fc.md'), `# Feature Contract: Main
**ID:** ARCH-MAIN-1 | **Status:** completed
`, 'utf8');
    fs.writeFileSync(path.join(activeDir, 'ARCH-MAIN-1.plan.yaml'), 'status: complete\n', 'utf8');

    fs.writeFileSync(path.join(activeDir, 'ARCH-OTHER-2.fc.md'), `# Feature Contract: Other
**ID:** ARCH-OTHER-2 | **Status:** completed
`, 'utf8');
    fs.writeFileSync(path.join(activeDir, 'ARCH-OTHER-2.plan.yaml'), 'status: complete\n', 'utf8');

    handlers.featureClose('ARCH-MAIN-1');

    expect(fs.existsSync(path.join(activeDir, 'ARCH-MAIN-1.fc.md'))).toBe(false);
    expect(fs.existsSync(path.join(activeDir, 'ARCH-OTHER-2.fc.md'))).toBe(false);
    expect(logger.lines.join('\n')).toContain('Garbage collector archived 1 additional completed story.');
  });

  it('pauses feature close at the archive confirmation breakpoint when interactive mode is enabled', () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger });
    const activeDir = path.join(tempDir, 'contracts', 'active');
    fs.mkdirSync(activeDir, { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'grabby.config.json'), JSON.stringify({
      interactive: { enabled: true },
      contracts: { directory: 'contracts', trackingMode: 'tracked' },
    }, null, 2));
    fs.writeFileSync(path.join(activeDir, 'ARCH-PAUSE-1.fc.md'), `# Feature Contract: Archived Feature
**ID:** ARCH-PAUSE-1 | **Status:** complete

## Objective
Archive this feature

## Scope
- Archive artifacts

## Directories
**Allowed:** \`contracts/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | \`contracts/active/ARCH-PAUSE-1.fc.md\` | contract |

## Done When
- [ ] Tests pass (80%+ coverage)
`, 'utf8');
    fs.writeFileSync(path.join(activeDir, 'ARCH-PAUSE-1.plan.yaml'), yaml.stringify({
      files: [{ path: 'contracts/active/ARCH-PAUSE-1.fc.md' }],
      execution_guard: 'passed',
    }), 'utf8');

    handlers.featureClose('ARCH-PAUSE-1');

    expect(fs.existsSync(path.join(activeDir, 'ARCH-PAUSE-1.fc.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.grabby', 'session', 'ARCH-PAUSE-1.json'))).toBe(true);
    expect(logger.lines.join('\n')).toContain('Archive paused for ARCH-PAUSE-1.');
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

  it('closes root contracts and refreshes list output even when contracts/active exists', () => {
    const closeLogger = createLogger();
    const listLogger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const closeHandlers = createCommandHandlers({ context, logger: closeLogger });
    const listHandlers = createCommandHandlers({ context, logger: listLogger });
    const activeDir = path.join(tempDir, 'contracts', 'active');
    const rootContractsDir = path.join(tempDir, 'contracts');
    fs.mkdirSync(activeDir, { recursive: true });
    fs.writeFileSync(path.join(rootContractsDir, 'ROOT-LIST-1.fc.md'), `# FC: Root Listed
**ID:** ROOT-LIST-1 | **Status:** complete

## Objective
Archive the root contract safely.

## Scope
- Remove it from the live list.

## Directories
**Allowed:** \`contracts/\`
**Restricted:** \`node_modules/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | \`contracts/ROOT-LIST-1.fc.md\` | contract |

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
`, 'utf8');
    fs.writeFileSync(path.join(rootContractsDir, 'ROOT-LIST-1.plan.yaml'), yaml.stringify({
      status: 'complete',
      files: [{ path: 'contracts/ROOT-LIST-1.fc.md' }],
      execution_guard: 'passed',
    }), 'utf8');

    closeHandlers.featureClose('ROOT-LIST-1');
    listHandlers.list();

    expect(fs.existsSync(path.join(rootContractsDir, 'ROOT-LIST-1.fc.md'))).toBe(false);
    expect(listLogger.lines.join('\n')).not.toContain('ROOT-LIST-1');
    expect(closeLogger.lines.join('\n')).toContain('Archived feature ROOT-LIST-1');
  });

  it('lists the canonical live contracts across root and contracts/active layouts', () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger });
    const activeDir = path.join(tempDir, 'contracts', 'active');
    const rootContractsDir = path.join(tempDir, 'contracts');
    fs.mkdirSync(activeDir, { recursive: true });
    fs.writeFileSync(path.join(rootContractsDir, 'ROOT-MIX-1.fc.md'), `# FC: Root Mixed Contract
**ID:** ROOT-MIX-1 | **Status:** draft
`, 'utf8');
    fs.writeFileSync(path.join(activeDir, 'ACTIVE-MIX-1.fc.md'), `# FC: Active Mixed Contract
**ID:** ACTIVE-MIX-1 | **Status:** approved
`, 'utf8');

    handlers.list();

    const output = logger.lines.join('\n');
    expect(output).toContain('ROOT-MIX-1.fc.md');
    expect(output).toContain('ACTIVE-MIX-1.fc.md');
    expect(output).toContain('ID: ROOT-MIX-1 | Status: draft');
    expect(output).toContain('ID: ACTIVE-MIX-1 | Status: approved');
  });

  it('lists baseline contracts that do not declare work-item IDs', () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger });
    const rootContractsDir = path.join(tempDir, 'contracts');
    fs.mkdirSync(rootContractsDir, { recursive: true });
    fs.writeFileSync(path.join(rootContractsDir, 'SYSTEM-BASELINE.fc.md'), `# FC: System Baseline
**Status:** draft
`, 'utf8');
    fs.writeFileSync(path.join(rootContractsDir, 'PROJECT-BASELINE.fc.md'), `# FC: Project Baseline
**Status:** draft
`, 'utf8');

    handlers.list();

    const output = logger.lines.join('\n');
    expect(output).toContain('SYSTEM-BASELINE.fc.md');
    expect(output).toContain('PROJECT-BASELINE.fc.md');
    expect(output).toContain('ID: SYSTEM-BASELINE | Status: draft');
    expect(output).toContain('ID: PROJECT-BASELINE | Status: draft');
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
    expect(logger.lines.join('\n')).toContain('History: .grabby/history/history-001.yaml');
  });

  it('archives hanging approved contracts and removes the matching plan artifact', () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger });
    const activeDir = path.join(tempDir, 'contracts', 'active');
    fs.mkdirSync(activeDir, { recursive: true });
    fs.writeFileSync(path.join(activeDir, 'ARCH-GC-3.fc.md'), `# Feature Contract: Hanging Feature
**ID:** ARCH-GC-3 | **Status:** approved
`, 'utf8');
    fs.writeFileSync(path.join(activeDir, 'ARCH-GC-3.plan.yaml'), yaml.stringify({
      files: [{ path: 'contracts/active/ARCH-GC-3.fc.md' }],
      status: 'approved',
    }), 'utf8');

    handlers.featureGc('archive', 'ARCH-GC-3');

    expect(fs.existsSync(path.join(activeDir, 'ARCH-GC-3.fc.md'))).toBe(false);
    expect(fs.existsSync(path.join(activeDir, 'ARCH-GC-3.plan.yaml'))).toBe(false);
    expect(logger.lines.join('\n')).toContain('Archived hanging feature ARCH-GC-3');
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
    const contract = fs.readFileSync(path.join(tempDir, 'contracts', 'valid-feature.fc.md'), 'utf8');
    expect(prompt).toContain('Grabby Prompt Bundle: valid-feature.fc.md');
    expect(prompt).toContain('Provider profile: generic');
    expect(prompt).toContain('## Contract');
    expect(prompt).toContain('## Backlog');
    expect(contract).toContain('## AI Assistant Handoff');
    expect(contract).toContain('Prompt file: `contracts/valid-feature.prompt.md`');
  });

  it('renders a tiered install prompt for tool-agnostic setup completion', () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger });

    handlers.installPrompt({ tier: '3' });

    const output = logger.lines.join('\n');
    expect(output).toContain('Setup Completion Prompt');
    expect(output).toContain('Tier: Tier 3 (Deep)');
    expect(output).toContain('tool-agnostic');
    expect(output).toContain('grabby complete-baseline SETUP-BASELINE');
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
      execSyncImpl: (command) => {
        commands.push(command);
        const outputs = {
          'git rev-parse --is-inside-work-tree': 'true',
          'git rev-parse --abbrev-ref HEAD': 'main',
          'git rev-parse --abbrev-ref --symbolic-full-name @{u}': 'origin/main',
          'git remote get-url origin': 'git@gitlab.com:team/repo.git',
          'git status --porcelain=v1 --branch': '## main...origin/main',
          'git rev-list --left-right --count origin/main...HEAD': '0 0',
          'git stash list': '',
          'git show-ref --verify refs/heads/fix/FC-123-valid-feature': '',
          'git checkout -b fix/FC-123-valid-feature': '',
          'git ls-remote --heads origin fix/FC-123-valid-feature': '',
        };
        if (!(command in outputs)) throw new Error(`unexpected ${command}`);
        return outputs[command];
      },
    });

    const contractPath = writeValidContract(tempDir);
    handlers.start('valid-feature.fc.md', { type: 'fix' });

    expect(commands).toContain('git rev-parse --is-inside-work-tree');
    expect(commands).toContain('git checkout -b fix/FC-123-valid-feature');
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
    expect(logger.lines.join('\n')).toContain('Not a git repository');
    expect(logger.lines.join('\n')).toContain('Branch: feat/FC-123-valid-feature');
  });

  it('prints git status summary, syncs safely, updates with conflict guidance, and runs git preflight', () => {
    const logger = createLogger();
    const exits = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const commands = [];
    const outputs = {
      'git rev-parse --is-inside-work-tree': 'true',
      'git rev-parse --abbrev-ref HEAD': 'feat/FC-123-valid-feature',
      'git rev-parse --abbrev-ref --symbolic-full-name @{u}': 'origin/feat/FC-123-valid-feature',
      'git remote get-url origin': 'git@gitlab.com:team/repo.git',
      'git status --porcelain=v1 --branch': '## feat/FC-123-valid-feature...origin/feat/FC-123-valid-feature [ahead 1, behind 0]',
      'git rev-list --left-right --count origin/feat/FC-123-valid-feature...HEAD': '0 1',
      'git stash list': '',
      'git fetch origin': '',
      'git rebase origin/main': new Error('conflict'),
    };
    const handlers = createCommandHandlers({
      context,
      logger,
      exit: (code) => exits.push(code),
      execSyncImpl: (command) => {
        commands.push(command);
        if (!(command in outputs)) throw new Error(`unexpected ${command}`);
        const value = outputs[command];
        if (value instanceof Error) throw value;
        return value;
      },
    });

    writeValidContract(tempDir, 'valid-feature.fc.md', 'approved');
    fs.writeFileSync(path.join(tempDir, 'contracts', 'FC-123.plan.yaml'), yaml.stringify({
      status: 'approved',
      files: [{ action: 'modify', path: 'src/feature.ts' }],
    }), 'utf8');
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      scripts: { lint: 'eslint .', test: 'jest' },
    }, null, 2), 'utf8');

    handlers.gitStatus();
    handlers.gitSync();
    handlers.gitUpdate();
    handlers.gitPreflight('valid-feature.fc.md');

    const output = logger.lines.join('\n');
    expect(output).toContain('Branch: feat/FC-123-valid-feature');
    expect(output).toContain('Fetched origin.');
    expect(output).toContain('Update stopped due to conflicts');
    expect(output).toContain('Git preflight passed.');
    expect(exits).toEqual([1]);
    expect(commands).toContain('git fetch origin');
  });

  it('checks for Grabby updates without applying changes', () => {
    const logger = createLogger();
    const commands = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({
      context,
      logger,
      execSyncImpl: (command) => {
        commands.push(command);
        if (command.includes('list -g grabby')) {
          return JSON.stringify({ dependencies: { grabby: { version: '1.0.0' } } });
        }
        if (command.includes('view grabby version')) {
          return JSON.stringify('2.0.0');
        }
        return '';
      },
    });

    handlers.updateGrabby({ checkOnly: true });

    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    expect(commands).toEqual([
      `${npmCommand} list -g grabby --depth=0 --json`,
      `${npmCommand} view grabby version --json`,
      `${npmCommand} view grabby name description bin --json`,
    ]);
    expect(logger.lines.join('\n')).toContain('Grabby update status');
    expect(logger.lines.join('\n')).toContain('Installed: 1.0.0');
    expect(logger.lines.join('\n')).toContain('Latest: 2.0.0');
    expect(logger.lines.join('\n')).toContain('grabby update --yes');
  });

  it('treats semver-equivalent installed/latest versions as up to date', () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({
      context,
      logger,
      execSyncImpl: (command) => {
        if (command.includes('list -g grabby')) {
          return JSON.stringify({ dependencies: { grabby: { version: 'v2.0.0' } } });
        }
        if (command.includes('view grabby version')) {
          return JSON.stringify('2.0.0');
        }
        return '';
      },
    });

    handlers.updateGrabby({ checkOnly: true });

    expect(logger.lines.join('\n')).toContain('Grabby is already up to date.');
  });

  it('treats installed versions newer than registry latest as up to date', () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({
      context,
      logger,
      execSyncImpl: (command) => {
        if (command.includes('list -g grabby')) {
          return JSON.stringify({ dependencies: { grabby: { version: '2.0.0' } } });
        }
        if (command.includes('view grabby version')) {
          return JSON.stringify('1.9.9');
        }
        return '';
      },
    });

    handlers.updateGrabby({ checkOnly: true });

    expect(logger.lines.join('\n')).toContain('installed version is newer than registry latest');
  });

  it('applies Grabby updates when explicitly approved', () => {
    const logger = createLogger();
    const commands = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({
      context,
      logger,
      execSyncImpl: (command) => {
        commands.push(command);
        if (command.includes('list -g grabby')) {
          return JSON.stringify({ dependencies: { grabby: { version: '1.0.0' } } });
        }
        if (command.includes('view grabby version')) {
          return JSON.stringify('2.0.0');
        }
        return '';
      },
    });

    handlers.updateGrabby({ yes: true });

    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    expect(commands).toEqual([
      `${npmCommand} list -g grabby --depth=0 --json`,
      `${npmCommand} view grabby version --json`,
      `${npmCommand} view grabby name description bin --json`,
      `${npmCommand} install -g grabby@latest`,
    ]);
    expect(logger.lines.join('\n')).toContain('Grabby updated successfully.');
  });

  it('uses local-source refresh when npm grabby metadata is incompatible', () => {
    const logger = createLogger();
    const commands = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({
      context,
      logger,
      execSyncImpl: (command) => {
        commands.push(command);
        if (command.includes('list -g grabby')) {
          return JSON.stringify({ dependencies: { grabby: { version: '2.0.0' } } });
        }
        if (command.includes('view grabby version')) {
          return JSON.stringify('0.2.2');
        }
        if (command.includes('view grabby name description bin')) {
          return JSON.stringify({
            name: 'grabby',
            description: 'Enhanced request library with some specific cases',
            bin: {},
          });
        }
        return '';
      },
    });

    handlers.updateGrabby({ yes: true });

    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    expect(commands).toContain(`${npmCommand} install -g ${PKG_ROOT}`);
    expect(logger.lines.join('\n')).toContain('Latest: n/a (registry package unrelated)');
    expect(logger.lines.join('\n')).toContain('Automatic registry update is disabled');
    expect(logger.lines.join('\n')).toContain('Grabby refreshed from local source successfully.');
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

  it('allows empty bulk session checks when allowEmpty is enabled', () => {
    const logger = createLogger();
    const exits = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger, exit: (code) => exits.push(code) });

    handlers.session(null, { checkAll: true, allowEmpty: true });

    expect(exits).toEqual([]);
    expect(logger.lines.join('\n')).toContain('no session artifacts found (skipped)');
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

  it('lints built-in agent definitions successfully', () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger });

    handlers.agentLint();

    const output = logger.lines.join('\n');
    expect(output).toContain('OK');
    expect(output).toContain('agents/analyst.agent.yaml');
  });

  it('fails agent lint when a custom agent definition is invalid', () => {
    const logger = createLogger();
    const exits = [];
    const customPkgRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-agent-lint-'));
    const agentsDir = path.join(customPkgRoot, 'agents');
    const workflowsDir = path.join(customPkgRoot, 'workflows');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.mkdirSync(workflowsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, 'broken.agent.yaml'), `agent:
  metadata:
    id: agents/broken
    name: Broken
    title: Broken Agent
    icon: "!"
    capabilities: broken
  persona:
    role: Broken
    identity: Broken identity
    communication_style: terse
    principles:
      - test
  greeting: Hello
  menu:
    - trigger: BK
      command: broken
      workflow: workflows/missing/workflow.yaml
      description: broken
`, 'utf8');

    const context = createProjectContext({ cwd: tempDir, pkgRoot: customPkgRoot });
    const handlers = createCommandHandlers({ context, logger, exit: (code) => exits.push(code) });

    handlers.agentLint();

    expect(exits).toEqual([1]);
    expect(logger.lines.join('\n')).toContain('FAIL');
    expect(logger.lines.join('\n')).toContain('workflow not found');
    fs.rmSync(customPkgRoot, { recursive: true, force: true });
  });

  it('writes DB discovery, refresh, lint, and dependency graph artifacts', () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger });

    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      dependencies: { prisma: '^5.0.0' },
    }, null, 2));
    fs.mkdirSync(path.join(tempDir, 'prisma', 'migrations', '001_init'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'src', 'repositories'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'prisma', 'schema.prisma'), `
model User {
  id Int @id
}
`, 'utf8');
    fs.writeFileSync(path.join(tempDir, 'prisma', 'migrations', '001_init', 'migration.sql'), `
CREATE TABLE users (
  id INT PRIMARY KEY
);
`, 'utf8');
    fs.writeFileSync(path.join(tempDir, 'src', 'repositories', 'userRepo.ts'), `
export async function listUsers(prisma) {
  return prisma.user.findMany();
}
`, 'utf8');
    fs.writeFileSync(path.join(tempDir, 'src', 'a.ts'), `import './repositories/userRepo';\n`, 'utf8');

    handlers.dbDiscover();
    handlers.dbRefresh();
    handlers.dbLint();
    handlers.depsDiscover();

    expect(fs.existsSync(path.join(tempDir, '.grabby', 'db', 'discovery.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.grabby', 'db', 'schema.snapshot.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.grabby', 'db', 'relations.graph.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.grabby', 'db', 'code_access_map.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.grabby', 'code', 'dependency_graph.json'))).toBe(true);
  });

  it('writes system inventory plus API and FE artifacts', () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger });

    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
      packageManager: 'npm@10.0.0',
      workspaces: ['apps/*', 'services/*'],
    }, null, 2));
    fs.writeFileSync(path.join(tempDir, 'package-lock.json'), '{"lockfileVersion":3}', 'utf8');
    fs.mkdirSync(path.join(tempDir, 'apps', 'web', 'src', 'generated'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'services', 'api'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'specs'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'apps', 'web', 'package.json'), JSON.stringify({
      name: '@repo/web',
      dependencies: { react: '^18.0.0', axios: '^1.7.0' },
    }, null, 2));
    fs.writeFileSync(path.join(tempDir, 'services', 'api', 'package.json'), JSON.stringify({
      name: '@repo/api',
      dependencies: { express: '^4.0.0' },
    }, null, 2));
    fs.writeFileSync(path.join(tempDir, 'apps', 'web', 'src', 'generated', 'client.ts'), 'export function getUsers(){ return fetch("/users"); }', 'utf8');
    fs.writeFileSync(path.join(tempDir, 'apps', 'web', 'src', 'index.tsx'), 'import axios from "axios"; import { getUsers } from "./generated/client"; export async function run(){ await axios.get("/users"); return getUsers(); }', 'utf8');
    fs.writeFileSync(path.join(tempDir, 'specs', 'openapi.yaml'), `
openapi: 3.0.0
info:
  title: API
  version: 1.0.0
paths:
  /users:
    get:
      operationId: getUsers
      responses:
        '200':
          description: ok
`, 'utf8');

    handlers.apiDiscover();
    handlers.apiRefresh();
    handlers.feDiscover();
    handlers.feRefresh();
    handlers.apiLint();
    handlers.feLint();

    expect(fs.existsSync(path.join(tempDir, '.grabby', 'system.inventory.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.grabby', 'be', 'api.snapshot.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.grabby', 'fe', 'deps.snapshot.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.grabby', 'fe', 'import.graph.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.grabby', 'fe', 'api.usage.map.json'))).toBe(true);
  });

  it('fails policyCheck when migration changes exist without DB contract metadata or snapshots', () => {
    const logger = createLogger();
    const exits = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger, exit: (code) => exits.push(code) });

    writeValidContract(tempDir, 'db-change.fc.md', 'approved');
    process.env.GRABBY_CHANGED_FILES = 'prisma/migrations/001_init/migration.sql';

    handlers.policyCheck();

    expect(exits).toEqual([1]);
    expect(logger.lines.join('\n')).toContain('data-change contract');
    delete process.env.GRABBY_CHANGED_FILES;
  });

  it('passes policyCheck for migration changes when DB metadata and snapshots exist', () => {
    const logger = createLogger();
    const exits = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger, exit: (code) => exits.push(code) });

    fs.writeFileSync(path.join(tempDir, 'grabby.config.json'), JSON.stringify({
      version: '1.0',
      contracts: { directory: 'contracts', trackingMode: 'tracked' },
      interactive: { enabled: false, defaultNextAction: null },
      features: { menuMode: true, startupArt: true, rulesetWizard: true },
      dbGovernance: { discovery: {}, constraints: { ciDbAccess: 'none', airgapped: false, destructiveMigrationsRequireReview: true, offlineOnlyParsing: true } },
    }, null, 2));
    const contractPath = writeValidContract(tempDir, 'db-change.fc.md', 'approved');
    fs.writeFileSync(contractPath, `${fs.readFileSync(contractPath, 'utf8')}\n**Data Change:** yes\n\n## Data Impact\n- [x] rollback documented\n- [x] migration/backfill documented\n`, 'utf8');
    fs.writeFileSync(path.join(tempDir, 'contracts', 'FC-123.plan.yaml'), yaml.stringify({
      status: 'approved',
      files: [
        { action: 'modify', path: 'src/feature.ts' },
        { action: 'modify', path: 'prisma/migrations/001_init/migration.sql' },
      ],
    }), 'utf8');
    fs.mkdirSync(path.join(tempDir, '.grabby', 'db'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, '.grabby', 'db', 'schema.snapshot.json'), '{}', 'utf8');
    fs.writeFileSync(path.join(tempDir, '.grabby', 'db', 'relations.graph.json'), '{}', 'utf8');
    process.env.GRABBY_CHANGED_FILES = 'prisma/migrations/001_init/migration.sql,src/feature.ts';

    handlers.policyCheck();

    expect(exits).toEqual([]);
    expect(logger.lines.join('\n')).toContain('Policy check passed');
    delete process.env.GRABBY_CHANGED_FILES;
  });

  it('fails policyCheck when API specs change without API metadata or snapshot', () => {
    const logger = createLogger();
    const exits = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger, exit: (code) => exits.push(code) });

    writeValidContract(tempDir, 'api-change.fc.md', 'approved');
    process.env.GRABBY_CHANGED_FILES = 'specs/openapi.yaml';

    handlers.policyCheck();

    expect(exits).toEqual([1]);
    expect(logger.lines.join('\n')).toContain('api-change contract');
    delete process.env.GRABBY_CHANGED_FILES;
  });

  it('fails policyCheck when FE dependencies change without dependency metadata or snapshot', () => {
    const logger = createLogger();
    const exits = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger, exit: (code) => exits.push(code) });

    writeValidContract(tempDir, 'deps-change.fc.md', 'approved');
    process.env.GRABBY_CHANGED_FILES = 'apps/web/package.json';

    handlers.policyCheck();

    expect(exits).toEqual([1]);
    expect(logger.lines.join('\n')).toContain('deps-change contract');
    delete process.env.GRABBY_CHANGED_FILES;
  });

  it('passes policyCheck for API and FE dependency changes when metadata and snapshots exist', () => {
    const logger = createLogger();
    const exits = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger, exit: (code) => exits.push(code) });

    fs.writeFileSync(path.join(tempDir, 'grabby.config.json'), JSON.stringify({
      version: '1.0',
      contracts: { directory: 'contracts', trackingMode: 'tracked' },
      interactive: { enabled: false, defaultNextAction: null },
      features: { menuMode: true, startupArt: true, rulesetWizard: true },
      dbGovernance: { discovery: {}, constraints: { ciDbAccess: 'none', airgapped: false, destructiveMigrationsRequireReview: true, offlineOnlyParsing: true } },
      systemGovernance: { profile: 'fullstack', roots: { frontendRoots: ['apps/web'], apiSpecRoots: ['specs'] }, rulesetIngestion: { dbSafety: true, apiCompat: true, feDeps: true }, constraints: { airgapped: false, noDbInCi: true, noNetwork: false, noNewDependencies: false, strictBackwardsCompat: true } },
    }, null, 2));
    const contractPath = writeValidContract(tempDir, 'api-deps.fc.md', 'approved');
    fs.writeFileSync(contractPath, `${fs.readFileSync(contractPath, 'utf8')}\n**API Change:** yes\n**Dependency Change:** yes\n**Breaking API Change Approved:** yes\n\n## API Impact\n- [x] compatibility documented\n- [x] versioning documented\n\n## Dependency Impact\n- [x] upgrade strategy documented\n- [x] rollback documented\n`, 'utf8');
    fs.writeFileSync(path.join(tempDir, 'contracts', 'FC-123.plan.yaml'), yaml.stringify({
      status: 'approved',
      files: [
        { action: 'modify', path: 'specs/openapi.yaml' },
        { action: 'modify', path: 'apps/web/package.json' },
      ],
    }), 'utf8');
    fs.mkdirSync(path.join(tempDir, '.grabby', 'be'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.grabby', 'fe'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, '.grabby', 'be', 'api.snapshot.json'), JSON.stringify({ compatibility: { breakingChanges: [] } }, null, 2), 'utf8');
    fs.writeFileSync(path.join(tempDir, '.grabby', 'fe', 'deps.snapshot.json'), JSON.stringify({ packages: [] }, null, 2), 'utf8');
    process.env.GRABBY_CHANGED_FILES = 'specs/openapi.yaml,apps/web/package.json';

    handlers.policyCheck();

    expect(exits).toEqual([]);
    expect(logger.lines.join('\n')).toContain('Policy check passed');
    delete process.env.GRABBY_CHANGED_FILES;
  });

  it('blocks execute for DB change contracts without explicit DB metadata or artifacts', () => {
    const logger = createLogger();
    const exits = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger, exit: (code) => exits.push(code) });

    const contractPath = writeValidContract(tempDir, 'db-exec.fc.md', 'approved');
    fs.writeFileSync(contractPath, `${fs.readFileSync(contractPath, 'utf8')}\nAdd migration for users table.\n`, 'utf8');
    fs.writeFileSync(path.join(tempDir, 'contracts', 'FC-123.plan.yaml'), yaml.stringify({
      status: 'approved',
      files: [{ action: 'modify', path: 'src/feature.ts' }],
    }), 'utf8');

    handlers.execute('db-exec.fc.md');

    expect(exits).toEqual([1]);
    expect(logger.lines.join('\n')).toContain('Governance policy failure');
  });

  it('fails validation for DB change contracts with governance policy violations', () => {
    const logger = createLogger();
    const exits = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger, exit: (code) => exits.push(code) });

    const contractPath = writeValidContract(tempDir, 'db-validate.fc.md', 'draft');
    fs.writeFileSync(contractPath, `${fs.readFileSync(contractPath, 'utf8')}\nAdd migration for users table.\n`, 'utf8');

    handlers.validate('db-validate.fc.md');

    expect(exits).toEqual([1]);
    expect(logger.lines.join('\n')).toContain('Data-affecting contract is missing explicit DB impact metadata');
    expect(logger.lines.join('\n')).toContain('Validation failed');
  });

  it('blocks execute for API and dependency change contracts without required artifacts or approvals', () => {
    const logger = createLogger();
    const exits = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger, exit: (code) => exits.push(code) });

    const contractPath = writeValidContract(tempDir, 'api-deps-exec.fc.md', 'approved');
    fs.writeFileSync(contractPath, `${fs.readFileSync(contractPath, 'utf8')}\nUpdate OpenAPI payload shape and package.json dependencies.\n`, 'utf8');
    fs.writeFileSync(path.join(tempDir, 'contracts', 'FC-123.plan.yaml'), yaml.stringify({
      status: 'approved',
      files: [{ action: 'modify', path: 'specs/openapi.yaml' }],
    }), 'utf8');

    handlers.execute('api-deps-exec.fc.md');

    expect(exits).toEqual([1]);
    expect(logger.lines.join('\n')).toContain('Governance policy failure');
  });

  it('fails validation for API/dependency change contracts with governance policy violations', () => {
    const logger = createLogger();
    const exits = [];
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger, exit: (code) => exits.push(code) });

    const contractPath = writeValidContract(tempDir, 'api-deps-validate.fc.md', 'draft');
    fs.writeFileSync(contractPath, `${fs.readFileSync(contractPath, 'utf8')}\nUpdate OpenAPI payload shape and package.json dependencies.\n`, 'utf8');

    handlers.validate('api-deps-validate.fc.md');

    expect(exits).toEqual([1]);
    expect(logger.lines.join('\n')).toContain('API-affecting contract is missing explicit API impact metadata');
    expect(logger.lines.join('\n')).toContain('Dependency-affecting contract is missing explicit dependency metadata');
    expect(logger.lines.join('\n')).toContain('Validation failed');
  });

  it('surfaces active environment constraints in plan output', () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger });

    fs.writeFileSync(path.join(tempDir, 'grabby.config.json'), JSON.stringify({
      version: '1.0',
      contracts: { directory: 'contracts', trackingMode: 'tracked' },
      interactive: { enabled: false, defaultNextAction: null },
      features: { menuMode: true, startupArt: true, rulesetWizard: true },
      plugins: {
        autoSuggestOnInit: true,
        items: {
          helm: {
            enabled: true,
            mode: 'active',
            source: 'builtin',
            constraints: { offlineOnly: true, noRemoteAccess: true },
          },
        },
      },
      dbGovernance: { discovery: {}, constraints: { ciDbAccess: 'unspecified', airgapped: false, destructiveMigrationsRequireReview: true, offlineOnlyParsing: true } },
      systemGovernance: {
        profile: 'fullstack',
        roots: { frontendRoots: [], backendRoots: [], apiSpecRoots: [], dbSchemaRoots: [], migrationRoots: [] },
        rulesetIngestion: { dbSafety: true, apiCompat: true, feDeps: true },
        constraints: { airgapped: true, noDbInCi: false, noNetwork: true, noNewDependencies: false, strictBackwardsCompat: false },
        topology: { separatedDeployHost: true, devHost: 'box-a', deployHost: 'box-b', clusterAccessFromDev: false, helmAccessFromDev: false, artifactGenerationOnly: true },
      },
    }, null, 2));

    const contractPath = writeValidContract(tempDir, 'env-plan.fc.md', 'draft');
    fs.writeFileSync(contractPath, fs.readFileSync(contractPath, 'utf8').replace('**ID:** FC-123', '**ID:** ENV-202'), 'utf8');

    handlers.plan('env-plan.fc.md');

    const output = logger.lines.join('\n');
    expect(output).toContain('Active environment constraints:');
    expect(output).toContain('system.airgapped=true');
    expect(output).toContain('topology.separatedDeployHost=true (box-a -> box-b)');
    expect(output).toContain('plugin.helm.offlineOnly=true');
    const plan = fs.readFileSync(path.join(tempDir, 'contracts', 'ENV-202.plan.yaml'), 'utf8');
    expect(plan).toContain('environment_constraints:');
  });

  it('writes active environment constraints into the audit artifact', () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger });

    fs.writeFileSync(path.join(tempDir, 'grabby.config.json'), JSON.stringify({
      version: '1.0',
      contracts: { directory: 'contracts', trackingMode: 'tracked' },
      interactive: { enabled: false, defaultNextAction: null },
      features: { menuMode: true, startupArt: true, rulesetWizard: true },
      plugins: {
        autoSuggestOnInit: true,
        items: {
          kubernetes: {
            enabled: true,
            mode: 'read-only',
            source: 'builtin',
            constraints: { noClusterAccess: true, generateArtifactsOnly: true },
          },
        },
      },
      dbGovernance: { discovery: {}, constraints: { ciDbAccess: 'unspecified', airgapped: false, destructiveMigrationsRequireReview: true, offlineOnlyParsing: true } },
      systemGovernance: {
        profile: 'fullstack',
        roots: { frontendRoots: [], backendRoots: [], apiSpecRoots: [], dbSchemaRoots: [], migrationRoots: [] },
        rulesetIngestion: { dbSafety: true, apiCompat: true, feDeps: true },
        constraints: { airgapped: false, noDbInCi: false, noNetwork: true, noNewDependencies: false, strictBackwardsCompat: false },
        topology: { separatedDeployHost: true, devHost: 'dev-box', deployHost: 'deploy-box', clusterAccessFromDev: false, helmAccessFromDev: true, artifactGenerationOnly: true },
      },
    }, null, 2));

    const contractPath = writeValidContract(tempDir, 'env-audit.fc.md', 'complete');
    fs.writeFileSync(contractPath, fs.readFileSync(contractPath, 'utf8').replace('**ID:** FC-123', '**ID:** ENV-203'), 'utf8');
    fs.writeFileSync(path.join(tempDir, 'contracts', 'ENV-203.plan.yaml'), yaml.stringify({
      status: 'approved',
      files: [{ action: 'modify', path: 'lib/config.cjs' }],
    }), 'utf8');

    handlers.audit('env-audit.fc.md', { yes: true });

    const output = logger.lines.join('\n');
    const auditArtifact = fs.readFileSync(path.join(tempDir, 'contracts', 'ENV-203.audit.md'), 'utf8');
    expect(output).toContain('Environment Constraints:');
    expect(output).toContain('plugin.kubernetes.noClusterAccess=true');
    expect(auditArtifact).toContain('## Environment Constraints');
    expect(auditArtifact).toContain('topology.separatedDeployHost=true (dev-box -> deploy-box)');
    expect(auditArtifact).toContain('plugin.kubernetes.generateArtifactsOnly=true');
  });
});

