const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  createProjectContext,
  createCommandHandlers,
} = require('../lib/commands.cjs');
const { listContractFeatures } = require('../lib/features.cjs');

const PKG_ROOT = path.join(__dirname, '..');

function createLogger() {
  const lines = [];
  return {
    lines,
    log: (...values) => lines.push(values.join(' ')),
  };
}

describe('tracking mode', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-tracking-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeLocalOnlyConfig() {
    fs.writeFileSync(path.join(tempDir, 'grabby.config.json'), JSON.stringify({
      version: '1.0',
      contracts: {
        trackingMode: 'local-only',
      },
    }, null, 2));
  }

  it('uses .grabby/contracts as the active contracts directory in local-only mode', () => {
    writeLocalOnlyConfig();

    const context = createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT });
    expect(context.trackingMode).toBe('local-only');
    expect(context.contractsDir).toBe(path.join(tempDir, '.grabby', 'contracts'));
  });

  it('creates new contracts under .grabby/contracts in local-only mode', () => {
    writeLocalOnlyConfig();
    const logger = createLogger();
    const handlers = createCommandHandlers({
      context: createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT }),
      logger,
    });

    handlers.create('Local Only Feature');

    expect(fs.existsSync(path.join(tempDir, '.grabby', 'contracts', 'local-only-feature.fc.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'contracts', 'local-only-feature.fc.md'))).toBe(false);
  });

  it('writes a local feature log entry in local-only mode', () => {
    writeLocalOnlyConfig();
    const handlers = createCommandHandlers({
      context: createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT }),
      logger: createLogger(),
    });

    handlers.create('Local Log Feature');

    const logPath = path.join(tempDir, '.grabby', 'feature-log.json');
    expect(fs.existsSync(logPath)).toBe(true);
    const log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0].contractFile).toBe('.grabby/contracts/local-log-feature.fc.md');
  });

  it('keeps canonical feature listing rooted in contracts/', () => {
    writeLocalOnlyConfig();
    fs.mkdirSync(path.join(tempDir, 'contracts'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'contracts', 'TRACKED-1.fc.md'), `# FC: Tracked Feature
**ID:** TRACKED-1 | **Status:** completed
`, 'utf8');

    fs.mkdirSync(path.join(tempDir, '.grabby', 'contracts'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, '.grabby', 'contracts', 'LOCAL-1.fc.md'), `# FC: Local Feature
**ID:** LOCAL-1 | **Status:** draft
`, 'utf8');

    const features = listContractFeatures(tempDir);
    expect(features.map((feature) => feature.id)).toEqual(['TRACKED-1']);
  });

  it('lets policy check pass in local-only mode without committed contracts', () => {
    writeLocalOnlyConfig();
    const logger = createLogger();
    const handlers = createCommandHandlers({
      context: createProjectContext({ cwd: tempDir, pkgRoot: PKG_ROOT }),
      logger,
      execSyncImpl: () => 'src/a.ts\nsrc/b.ts\n',
    });

    handlers.policyCheck();
    expect(logger.lines.join('\n')).toContain('contracts.trackingMode=local-only');
  });
});
