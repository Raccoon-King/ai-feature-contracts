const fs = require('fs');
const os = require('os');
const path = require('path');
const features = require('../lib/features.cjs');

describe('contract-backed feature index', () => {
  let tempDir;
  let contractsDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-feature-index-'));
    contractsDir = path.join(tempDir, 'contracts');
    fs.mkdirSync(contractsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeContract(fileName, content) {
    fs.writeFileSync(path.join(contractsDir, fileName), content, 'utf8');
  }

  it('parses contract discovery metadata from feature contracts', () => {
    writeContract('GRAB-1.fc.md', `# Feature Contract: Ticket Wizard
**ID:** GRAB-1 | **Status:** approved
**Branch:** feat/GRAB-1-ticket-wizard
Type: feat

## Objective
Build the ticket wizard.
`);

    const listed = features.listContractFeatures(tempDir);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id: 'GRAB-1',
      title: 'Ticket Wizard',
      type: 'feat',
      status: 'approved',
      branch: 'feat/GRAB-1-ticket-wizard',
      contractPath: 'contracts/GRAB-1.fc.md',
    });
  });

  it('resolves feature status paths for plan and audit artifacts', () => {
    writeContract('GRAB-2.fc.md', `# FC: Feature Tracking
**ID:** GRAB-2 | **Status:** draft
`);
    fs.writeFileSync(path.join(contractsDir, 'GRAB-2.plan.yaml'), 'status: approved\n', 'utf8');
    fs.writeFileSync(path.join(contractsDir, 'GRAB-2.audit.md'), '# audit\n', 'utf8');

    const status = features.getContractFeatureStatus('grab-2', tempDir);
    expect(status.planPath).toBe('contracts/GRAB-2.plan.yaml');
    expect(status.auditPath).toBe('contracts/GRAB-2.audit.md');
    expect(status.contractPath).toBe('contracts/GRAB-2.fc.md');
  });

  it('generates and reloads the cached feature index', () => {
    writeContract('GRAB-3.fc.md', `# FC: Cached Feature
**ID:** GRAB-3 | **Status:** paused
`);

    const refreshed = features.refreshFeatureIndex(tempDir);
    expect(refreshed.features).toHaveLength(1);
    expect(fs.existsSync(path.join(tempDir, '.grabby', 'features.index.json'))).toBe(true);

    const loaded = features.loadFeatureIndex(tempDir);
    expect(loaded.features[0].id).toBe('GRAB-3');
  });

  it('indexes archived feature bundles with archive pointer metadata', () => {
    const archiveDir = path.join(tempDir, 'contracts', 'archive', '2026');
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, 'GRAB-4.bundle.md'), `# Feature Archive Bundle
ID: GRAB-4
Title: Archived Feature
Type: FEATURE_CONTRACT
Status: complete
Closed: 2026-03-03T00:00:00.000Z
Branch: feat/GRAB-4
PR/MR: -
`, 'utf8');

    const refreshed = features.refreshFeatureIndex(tempDir);
    expect(refreshed.features).toHaveLength(1);
    expect(refreshed.features[0]).toMatchObject({
      id: 'GRAB-4',
      status: 'complete',
      archivePath: 'contracts/archive/2026/GRAB-4.bundle.md',
      closedAt: '2026-03-03T00:00:00.000Z',
    });
  });

  it('preserves garbage-collector metadata across index refreshes', () => {
    writeContract('GRAB-5.fc.md', `# FC: Hanging Feature
**ID:** GRAB-5 | **Status:** approved
`);
    fs.mkdirSync(path.join(tempDir, '.grabby'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, '.grabby', 'features.index.json'), JSON.stringify({
      generatedAt: '2026-03-03T00:00:00.000Z',
      features: [
        {
          id: 'GRAB-5',
          gcDisposition: 'keep',
          gcReason: 'Pending decision',
        },
      ],
    }, null, 2), 'utf8');

    const refreshed = features.refreshFeatureIndex(tempDir);
    expect(refreshed.features[0]).toMatchObject({
      id: 'GRAB-5',
      gcDisposition: 'keep',
      gcReason: 'Pending decision',
    });
  });

  it('lists stale active contracts as garbage-collector candidates', () => {
    writeContract('GRAB-6.fc.md', `# FC: Hanging Feature
**ID:** GRAB-6 | **Status:** draft
`);
    const contractPath = path.join(contractsDir, 'GRAB-6.fc.md');
    const staleTime = new Date('2025-01-01T00:00:00.000Z');
    fs.utimesSync(contractPath, staleTime, staleTime);

    const candidates = features.listGarbageCandidates(tempDir, { maxAgeDays: 30 });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      id: 'GRAB-6',
      recommendedAction: 'choose',
    });
    expect(candidates[0].staleReason).toContain('No contract activity');
  });

  it('detects deprecated standalone ticket markdown files', () => {
    fs.writeFileSync(path.join(tempDir, 'TT-123.md'), '# legacy\n', 'utf8');
    fs.mkdirSync(path.join(tempDir, 'tickets'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'tickets', 'JIRA-456.md'), '# legacy\n', 'utf8');

    expect(features.findLegacyTicketFiles(tempDir)).toEqual([
      'TT-123.md',
      'tickets/JIRA-456.md',
    ]);
  });
});
