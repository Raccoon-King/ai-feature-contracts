const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('yaml');
const features = require('../lib/features.cjs');

describe('feature close flow', () => {
  let tempDir;
  let activeDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-feature-close-'));
    activeDir = path.join(tempDir, 'contracts', 'active');
    fs.mkdirSync(activeDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeCompletedFeature(id = 'GRAB-ARCH-1') {
    fs.writeFileSync(path.join(activeDir, `${id}.fc.md`), `# Feature Contract: ${id}
**ID:** ${id} | **Status:** completed
**Branch:** feat/${id.toLowerCase()}

## Ticket
- Who: Developers
- What: Close the feature
- Why: Archive history

## Objective
Archive the feature

## Scope
- Bundle artifacts

## Non-Goals
- Extra work

## Directories
**Allowed:** \`contracts/\`
**Restricted:** \`node_modules/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | \`contracts/active/${id}.fc.md\` | contract |

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

    fs.writeFileSync(path.join(activeDir, `${id}.plan.yaml`), yaml.stringify({
      files: [
        { path: `contracts/active/${id}.fc.md` },
        { path: `contracts/active/${id}.audit.md` },
      ],
      execution_guard: 'passed',
    }), 'utf8');

    fs.writeFileSync(path.join(activeDir, `${id}.audit.md`), `# Audit

Validation commands run:
- npm test -> passed
- npm run lint -> passed
`, 'utf8');

    fs.writeFileSync(path.join(activeDir, `${id}.brief.md`), '# brief\n', 'utf8');
    fs.writeFileSync(path.join(activeDir, `${id}.backlog.yaml`), 'epics: []\n', 'utf8');
    fs.writeFileSync(path.join(activeDir, `${id}.prompt.md`), '# prompt\n', 'utf8');
    fs.writeFileSync(path.join(activeDir, `${id}.session.json`), JSON.stringify({ version: 1 }, null, 2), 'utf8');
    fs.writeFileSync(path.join(activeDir, `${id}.session.yaml`), 'version: 1\n', 'utf8');
  }

  it('closing creates compact history and updates the feature index', () => {
    writeCompletedFeature();

    const result = features.createArchiveBundle('GRAB-ARCH-1', tempDir, {
      closedAt: '2026-03-03T00:00:00.000Z',
    });

    expect(result.historyFile).toBe('.grabby/history/history-001.yaml');
    const historyContent = fs.readFileSync(path.join(tempDir, result.historyFile), 'utf8');
    const history = yaml.parse(historyContent);
    expect(history.entries).toHaveLength(1);
    expect(history.entries[0].id).toBe('GRAB-ARCH-1');
    expect(history.entries[0].closedAt).toBe('2026-03-03T00:00:00.000Z');

    const index = features.loadFeatureIndex(tempDir);
    expect(index.features[0]).toMatchObject({
      id: 'GRAB-ARCH-1',
      archivePath: '.grabby/history/history-001.yaml',
      closedAt: '2026-03-03T00:00:00.000Z',
    });
  });

  it('removes the plan after bundling', () => {
    writeCompletedFeature('GRAB-ARCH-2');

    features.createArchiveBundle('GRAB-ARCH-2', tempDir);

    expect(fs.existsSync(path.join(activeDir, 'GRAB-ARCH-2.plan.yaml'))).toBe(false);
  });

  it('removes sibling story artifacts after bundling', () => {
    writeCompletedFeature('GRAB-ARCH-4');

    features.createArchiveBundle('GRAB-ARCH-4', tempDir);

    expect(fs.existsSync(path.join(activeDir, 'GRAB-ARCH-4.brief.md'))).toBe(false);
    expect(fs.existsSync(path.join(activeDir, 'GRAB-ARCH-4.backlog.yaml'))).toBe(false);
    expect(fs.existsSync(path.join(activeDir, 'GRAB-ARCH-4.prompt.md'))).toBe(false);
    expect(fs.existsSync(path.join(activeDir, 'GRAB-ARCH-4.session.json'))).toBe(false);
    expect(fs.existsSync(path.join(activeDir, 'GRAB-ARCH-4.session.yaml'))).toBe(false);
  });

  it('removes the closed feature from the active feature list immediately', () => {
    writeCompletedFeature('GRAB-ARCH-5');

    features.createArchiveBundle('GRAB-ARCH-5', tempDir);

    expect(features.listContractFeatures(tempDir).find((feature) => feature.id === 'GRAB-ARCH-5')).toBeUndefined();
    expect(features.getContractFeatureStatus('GRAB-ARCH-5', tempDir)).toMatchObject({
      id: 'GRAB-ARCH-5',
      status: 'archived',
    });
  });

  it('discovers and closes root contracts even when contracts/active exists', () => {
    const rootContractsDir = path.join(tempDir, 'contracts');
    fs.writeFileSync(path.join(rootContractsDir, 'GRAB-ROOT-1.fc.md'), `# FC: Root Layout
**ID:** GRAB-ROOT-1 | **Status:** complete

## Objective
Archive the root contract.

## Scope
- Keep root contracts discoverable.

## Directories
**Allowed:** \`contracts/\`
**Restricted:** \`node_modules/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | \`contracts/GRAB-ROOT-1.fc.md\` | contract |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery

## Security Considerations
- [ ] None

## Code Quality
- [ ] Covered

## Done When
- [ ] Tests pass (80%+ coverage)

## Testing
- Unit
`, 'utf8');
    fs.writeFileSync(path.join(rootContractsDir, 'GRAB-ROOT-1.plan.yaml'), yaml.stringify({
      status: 'complete',
      files: [{ path: 'contracts/GRAB-ROOT-1.fc.md' }],
    }), 'utf8');

    expect(features.listContractFeatures(tempDir).find((feature) => feature.id === 'GRAB-ROOT-1')).toMatchObject({
      id: 'GRAB-ROOT-1',
      contractPath: 'contracts/GRAB-ROOT-1.fc.md',
    });

    features.createArchiveBundle('GRAB-ROOT-1', tempDir);

    expect(fs.existsSync(path.join(rootContractsDir, 'GRAB-ROOT-1.fc.md'))).toBe(false);
    expect(features.getContractFeatureStatus('GRAB-ROOT-1', tempDir)).toMatchObject({
      id: 'GRAB-ROOT-1',
      status: 'archived',
    });
  });

  it('closes slug-named stories and removes sibling artifacts by file stem', () => {
    const slug = 'login-redirect-story';
    const id = 'GRAB-SLUG-1';
    fs.writeFileSync(path.join(activeDir, `${slug}.fc.md`), `# FC: Slug Layout
**ID:** ${id} | **Status:** complete

## Objective
Archive slug named story.

## Scope
- Keep slug-named artifacts in sync.

## Directories
**Allowed:** \`contracts/\`
**Restricted:** \`node_modules/\`

## Files
| Action | Path | Reason |
|--------|------|--------|
| modify | \`contracts/active/${slug}.fc.md\` | contract |

## Dependencies
- Allowed: existing packages only
- Banned: moment, lodash, jquery

## Security Considerations
- [ ] None

## Done When
- [ ] Tests pass (80%+ coverage)

## Testing
- Unit
`, 'utf8');
    fs.writeFileSync(path.join(activeDir, `${slug}.plan.yaml`), yaml.stringify({
      files: [{ path: `contracts/active/${slug}.fc.md` }],
    }), 'utf8');
    fs.writeFileSync(path.join(activeDir, `${slug}.audit.md`), '# audit\n', 'utf8');
    fs.writeFileSync(path.join(activeDir, `${slug}.brief.md`), '# brief\n', 'utf8');
    fs.writeFileSync(path.join(activeDir, `${slug}.backlog.yaml`), 'epics: []\n', 'utf8');

    const result = features.createArchiveBundle(id, tempDir);

    expect(fs.existsSync(path.join(activeDir, `${slug}.fc.md`))).toBe(false);
    expect(fs.existsSync(path.join(activeDir, `${slug}.plan.yaml`))).toBe(false);
    expect(fs.existsSync(path.join(activeDir, `${slug}.audit.md`))).toBe(false);
    expect(fs.existsSync(path.join(activeDir, `${slug}.brief.md`))).toBe(false);
    expect(fs.existsSync(path.join(activeDir, `${slug}.backlog.yaml`))).toBe(false);
    expect(result.historyFile).toBe('.grabby/history/history-001.yaml');
    const history = yaml.parse(fs.readFileSync(path.join(tempDir, result.historyFile), 'utf8'));
    expect(history.entries[0].id).toBe(id);
  });

  it('enforces ID mismatch safety', () => {
    writeCompletedFeature('GRAB-ARCH-3');
    const contractPath = path.join(activeDir, 'GRAB-ARCH-3.fc.md');
    const broken = fs.readFileSync(contractPath, 'utf8').replace('**ID:** GRAB-ARCH-3', '**ID:** WRONG-3');
    fs.writeFileSync(contractPath, broken, 'utf8');

    expect(() => features.createArchiveBundle('GRAB-ARCH-3', tempDir)).toThrow('Contract ID mismatch');
  });

  it('garbageCollectCompletedStories archives all completed non-baseline stories', () => {
    writeCompletedFeature('GRAB-GC-A');
    writeCompletedFeature('GRAB-GC-B');
    fs.writeFileSync(path.join(activeDir, 'SETUP-BASELINE.fc.md'), `# FC: Setup Baseline
**ID:** SETUP-BASELINE | **Status:** complete
`, 'utf8');

    const result = features.garbageCollectCompletedStories(tempDir, {
      closedAt: '2026-03-06T00:00:00.000Z',
    });

    expect(result.archived.map((entry) => entry.id)).toEqual(['GRAB-GC-A', 'GRAB-GC-B']);
    expect(result.failed).toEqual([]);
    expect(fs.existsSync(path.join(activeDir, 'GRAB-GC-A.fc.md'))).toBe(false);
    expect(fs.existsSync(path.join(activeDir, 'GRAB-GC-B.fc.md'))).toBe(false);
    expect(fs.existsSync(path.join(activeDir, 'SETUP-BASELINE.fc.md'))).toBe(true);
  });
});
