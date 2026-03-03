const fs = require('fs');
const os = require('os');
const path = require('path');
const { executeGraphQL } = require('../lib/graphql.cjs');

describe('graphql helper', () => {
  test('handles health and contracts query', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'graphql-'));
    fs.writeFileSync(path.join(dir, 'a.fc.md'), '# FC: A\n**ID:** FC-11 | **Status:** draft\n');

    const health = executeGraphQL('{ health { status version } }', { contractsDir: dir });
    expect(health.data.health.status).toBe('ok');

    const contracts = executeGraphQL('{ contracts { id title status } }', { contractsDir: dir });
    expect(contracts.data.contracts.length).toBe(1);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('filters contracts by id or file and ignores non-contract files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'graphql-'));
    fs.writeFileSync(path.join(dir, 'a.fc.md'), '# FC: Alpha\n**ID:** FC-11 | **Status:** draft\n');
    fs.writeFileSync(path.join(dir, 'b.fc.md'), '# FC: Beta\n**ID:** FC-12 | **Status:** approved\n');
    fs.writeFileSync(path.join(dir, 'note.md'), '# not a contract\n');

    const byId = executeGraphQL('{ contracts(id: "FC-12") { id title status } }', { contractsDir: dir });
    expect(byId.data.contracts).toEqual([
      expect.objectContaining({ id: 'FC-12', title: 'Beta', status: 'approved', file: 'b.fc.md' }),
    ]);

    const byFile = executeGraphQL('{ contracts(id: "a.fc.md") { id title status } }', { contractsDir: dir });
    expect(byFile.data.contracts).toEqual([
      expect.objectContaining({ id: 'FC-11', file: 'a.fc.md' }),
    ]);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('returns fallbacks for malformed contracts and unsupported queries', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'graphql-'));
    fs.writeFileSync(path.join(dir, 'broken.fc.md'), 'plain text contract without expected metadata\n');

    expect(executeGraphQL('{ contracts { id title status } }', { contractsDir: dir }).data.contracts).toEqual([
      { id: 'unknown', title: 'broken.fc.md', status: 'unknown', file: 'broken.fc.md' },
    ]);
    expect(executeGraphQL('{ unsupportedField }', { contractsDir: dir }).errors).toEqual([
      { message: 'Unsupported query' },
    ]);
    expect(executeGraphQL('{ contracts { id } }', { contractsDir: path.join(dir, 'missing') }).data.contracts).toEqual([]);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
