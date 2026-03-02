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

  it('approves a contract even when no plan file exists yet', () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger });

    const contractPath = writeValidContract(tempDir);
    handlers.approve('valid-feature.fc.md');

    expect(fs.readFileSync(contractPath, 'utf8')).toContain('**Status:** approved');
    expect(logger.lines.join('\n')).toContain('Contract approved');
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
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'tmp' }), 'utf8');
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

    expect(commands).toEqual(['npm run lint', 'npm run build']);
    expect(logger.lines.join('\n')).toContain('Lint: passed');
    expect(logger.lines.join('\n')).toContain('Build: failed');
    expect(logger.lines.join('\n')).toContain('src/feature.ts');
  });

  it('lists an empty contract directory clearly', () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger });

    handlers.list();

    expect(logger.lines.join('\n')).toContain('No contracts found.');
    expect(logger.lines.join('\n')).toContain('grabby create "feature-name"');
  });

  it('initializes repo config during init', () => {
    const logger = createLogger();
    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    const handlers = createCommandHandlers({ context, logger });

    handlers.init();

    expect(fs.existsSync(path.join(tempDir, '.grabby', 'config.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.grabbyignore'))).toBe(true);
    expect(logger.lines.join('\n')).toContain('.grabby/config.json');
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
});

