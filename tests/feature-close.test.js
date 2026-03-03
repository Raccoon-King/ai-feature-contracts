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

  it('enforces ID mismatch safety', () => {
    writeCompletedFeature('GRAB-ARCH-3');
    const contractPath = path.join(activeDir, 'GRAB-ARCH-3.fc.md');
    const broken = fs.readFileSync(contractPath, 'utf8').replace('**ID:** GRAB-ARCH-3', '**ID:** WRONG-3');
    fs.writeFileSync(contractPath, broken, 'utf8');

    expect(() => features.createArchiveBundle('GRAB-ARCH-3', tempDir)).toThrow('Contract ID mismatch');
  });
});
